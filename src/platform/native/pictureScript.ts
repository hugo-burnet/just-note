// Two small scripts the WebView of the app runs inside a page whose pictures are built by its own
// scripts. Neither is ever fetched: they are written here, as text, and handed to the WebView
// (PageFetcherPlugin.java), which runs the first before the page's own scripts and the second once
// the page is ready. They talk back through the object the plugin gives the page, JustReadPictures.

/**
 * Runs before the page's scripts. A reader that builds a picture from bytes it decrypted shows it
 * as a blob: address, and may let go of that address as soon as the picture is on screen, after
 * which the bytes can no longer be asked for. So the blobs are kept, by address, as they are made.
 */
export const BLOB_HOOK = `(function () {
  if (window.__justReadBlobs) return;
  var blobs = new Map();
  window.__justReadBlobs = blobs;
  var create = URL.createObjectURL;
  URL.createObjectURL = function (object) {
    var address = create.apply(URL, arguments);
    if (object instanceof Blob) blobs.set(address, object);
    return address;
  };
})();`;

/**
 * Scrolls the page the way a reader does (a page that loads its pictures as they come into view only
 * loads what it sees) until the pictures that `selector` matches are all there and nothing changes any
 * more; then gives the bytes of each, in the order they are in the page, to the plugin. It tells the
 * plugin how far it has got (`progress`, in percent: the user is looking at a spinner), and ends with
 * `done` (and a line on what it found), or with `fail` and the reason.
 *
 * `slots` is a selector for the places the page keeps for its pictures, when it has them before it has
 * the pictures. Those that show (a page may keep others, hidden) are the places: the script goes from one
 * that has no picture yet to the next, waiting for each picture, which is a lot quicker than scrolling a
 * screen at a time through pages that are metres long; and it goes on waiting while the pictures are
 * fewer than the places. A page may keep places for other things than pictures, so both have an end:
 * places that stay empty are scrolled through like any page, and places that promise more than ever
 * came are given a few seconds, after which the pictures there are are taken (the line it ends with says
 * so, and what the places are). Only a script that ran out of time on the way down, with fewer pictures
 * than places, fails: what came is the top of a chapter, not the chapter. Where there is no such
 * selector, or it matches nothing, a picture that has come is all there is to go by, and the page is
 * scrolled a screen at a time.
 *
 * The pictures are read from the blobs the hook kept, else asked for by their address, else drawn
 * on a canvas (a picture whose address has been let go of is still on screen).
 */
export function pictureScript(selector: string, slots = ''): string {
  return `(function () {
  var bridge = window.JustReadPictures;
  var token = window.__justReadToken;
  var SELECTOR = ${JSON.stringify(selector)};
  var SLOTS = ${JSON.stringify(slots)};
  var STEP_MS = 250;
  var POLL_MS = 50;
  var HOP_MS = 6000;
  var QUIET_STEPS = 6;
  var SHORT_STEPS = 32;
  var BUDGET_MS = 45000;
  var BUDGET_MAX_MS = 65000;
  var NOTHING_MS = 12000;
  // Of the way to the end, the part that is the scrolling: the rest is reading the pictures.
  var SCROLLED = 85;

  var reported = -1;

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  // Only ever up, and only when it changes: the plugin writes it on the screen.
  function progress(percent) {
    if (percent <= reported) return;
    reported = percent;
    bridge.progress(token, percent);
  }
  function pictures() { return Array.prototype.slice.call(document.querySelectorAll(SELECTOR)); }
  function loaded(img) { return img.complete && img.naturalWidth > 0; }
  // The places that show, in the order of the page: a page may keep others (a pager, say) that it hides.
  function showing() {
    if (!SLOTS) return [];
    return Array.prototype.filter.call(document.querySelectorAll(SLOTS), function (el) { return el.getClientRects().length > 0; });
  }
  function places() { return showing().length; }
  function filled(el) {
    var img = el.matches(SELECTOR) ? el : el.querySelector(SELECTOR);
    return !!img && loaded(img);
  }
  function describe(el) {
    var tag = String(el.tagName || '').toLowerCase();
    var classes = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 4) : [];
    return tag ? tag + (el.id ? '#' + el.id : '') + classes.map(function (name) { return '.' + name; }).join('') : '';
  }
  // What the places are, for a report: how many of each kind, where they sit, whether they show or hold a picture.
  function kinds() {
    var counts = {};
    Array.prototype.forEach.call(document.querySelectorAll(SLOTS), function (el) {
      var name = describe(el);
      if (!name) return;
      if (el.parentElement) name += ' in ' + describe(el.parentElement);
      if (el.getClientRects && el.getClientRects().length === 0) name += ' hidden';
      if (el.querySelector && el.querySelector('img')) name += ' with img';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.keys(counts).map(function (name) { return counts[name] + 'x ' + name; }).join(', ');
  }
  // A reader may scroll inside a box of its own instead of the page: the nearest ancestor of a picture that does.
  function box() {
    var first = pictures()[0];
    for (var el = first && first.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }
  function heightOf() {
    var inner = box();
    return inner ? inner.scrollHeight : Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  }
  function viewOf() {
    var inner = box();
    return inner ? inner.clientHeight : window.innerHeight || 600;
  }
  function scrollTo(y) {
    var inner = box();
    if (inner) inner.scrollTop = y;
    window.scrollTo(0, y);
  }

  // The quick way, for a page that keeps places for its pictures: to the first place with no picture in it,
  // wait for the picture, on to the next. Nothing is scrolled through that has nothing to wait for. Two
  // places in a row that stay empty are not what they were taken for: the page is then scrolled as any other.
  // True when every place shows its picture.
  async function hop(started) {
    var gaveUp = [];
    var strikes = 0;
    for (var hops = 0; hops < 500 && Date.now() - started < BUDGET_MS; hops++) {
      var list = showing();
      var empty = list.filter(function (el) { return !filled(el); });
      var next = empty.filter(function (el) { return gaveUp.indexOf(el) < 0; })[0];
      if (list.length === 0) return false;
      progress(Math.floor((SCROLLED * (list.length - empty.length)) / list.length));
      if (!next) return gaveUp.length === 0;
      next.scrollIntoView(true);
      var until = Date.now() + HOP_MS;
      var count = pictures().filter(loaded).length;
      while (!filled(next) && Date.now() < until) {
        await sleep(POLL_MS);
        // Others coming in is no reason to give up on this one.
        var now = pictures().filter(loaded).length;
        if (now > count) {
          count = now;
          until = Date.now() + HOP_MS;
        }
      }
      if (filled(next)) {
        strikes = 0;
      } else {
        gaveUp.push(next);
        strikes++;
        if (strikes === 2) return false;
      }
    }
    return false;
  }

  // A long page takes long to scroll through, a screen at a time: the time allowed grows with it (up to a limit).
  function budget(height, view) {
    return Math.min(BUDGET_MAX_MS, BUDGET_MS + Math.ceil(height / (view * 0.8)) * STEP_MS);
  }

  // How it ended: 'ready' (the pictures are all there), 'short' (the places promise more than ever came),
  // 'nothing' (no picture at all) or 'late' (out of time before the pictures were all there).
  async function scroll(started, there) {
    var y = there ? heightOf() : 0;
    var quiet = 0;
    var last = '';
    while (Date.now() - started < budget(heightOf(), viewOf())) {
      var height = heightOf();
      var view = viewOf();
      if (y + view < height) {
        y = Math.min(y + Math.round(view * 0.8), height);
        scrollTo(y);
        progress(Math.min(SCROLLED, Math.floor((SCROLLED * y) / height)));
        await sleep(STEP_MS);
        quiet = 0;
        continue;
      }
      // At the bottom: wait for what is still coming in.
      scrollTo(height);
      var list = pictures();
      var wanted = places();
      var ready = list.length > 0 && list.every(loaded);
      var signature = list.length + '/' + list.filter(loaded).length + '/' + wanted + '/' + height;
      quiet = signature === last ? quiet + 1 : 0;
      last = signature;
      if (ready && list.length >= wanted && quiet >= QUIET_STEPS) return 'ready';
      if (ready && quiet >= SHORT_STEPS) return 'short';
      if (list.length === 0 && Date.now() - started > NOTHING_MS) return 'nothing';
      await sleep(STEP_MS);
    }
    return 'late';
  }

  function base64Of(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result);
        resolve(text.slice(text.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  async function blobOf(img) {
    var address = img.currentSrc || img.src;
    var kept = window.__justReadBlobs && window.__justReadBlobs.get(address);
    if (kept) return kept;
    try {
      return await (await fetch(address)).blob();
    } catch (ignored) {
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.92); });
    }
  }

  async function main() {
    var started = Date.now();
    var how = await scroll(started, SLOTS ? await hop(started) : false);
    var list = pictures();
    var wanted = places();
    var summary = 'pictures ' + list.length + ', places ' + wanted + ', page height ' + heightOf();
    var what = wanted > 0 ? kinds() : '';
    if (what) summary += ' (' + what + ')';
    // A chapter with a page missing is worse than none: say so instead of shifting the others.
    if (!list.every(loaded)) throw new Error('A picture did not load (' + list.filter(loaded).length + ' of ' + list.length + ').');
    if (list.length === 0 && wanted > 0) throw new Error('None of the ' + wanted + ' pages came.');
    if (how === 'late' && list.length < wanted) throw new Error('Only ' + list.length + ' of ' + wanted + ' pages came in time.');
    if (list.length < wanted) summary += ', fewer pictures than places';
    for (var i = 0; i < list.length; i++) {
      var blob = await blobOf(list[i]);
      bridge.add(token, blob.type || '', await base64Of(blob));
      progress(SCROLLED + Math.floor(((100 - SCROLLED) * (i + 1)) / list.length));
    }
    bridge.done(token, summary);
  }

  main().catch(function (error) { bridge.fail(token, String((error && error.message) || error)); });
})();`;
}
