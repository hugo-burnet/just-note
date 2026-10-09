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
 * Scrolls the page the way a reader does, a screen at a time (a page that loads its pictures as they
 * come into view only loads what it sees), until the pictures that `selector` matches are all
 * there and nothing changes any more; then gives the bytes of each, in the order they are in the
 * page, to the plugin. It ends with `done` (and a line on what it found), or with `fail` and the reason.
 *
 * `slots` is a selector for the places the page keeps for its pictures, when it has them before it has
 * the pictures: there are as many pictures as places, and a chapter in which some did not come in time
 * fails instead of being short. Where there is no such selector, or it matches nothing, a picture that
 * has come is all there is to go by.
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
  var QUIET_STEPS = 6;
  var BUDGET_MS = 45000;
  var NOTHING_MS = 12000;

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function pictures() { return Array.prototype.slice.call(document.querySelectorAll(SELECTOR)); }
  function loaded(img) { return img.complete && img.naturalWidth > 0; }
  function places() { return SLOTS ? document.querySelectorAll(SLOTS).length : 0; }
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

  async function scroll() {
    var started = Date.now();
    var y = 0;
    var quiet = 0;
    var last = '';
    while (Date.now() - started < BUDGET_MS) {
      var height = heightOf();
      var view = viewOf();
      if (y + view < height) {
        y = Math.min(y + Math.round(view * 0.8), height);
        scrollTo(y);
        await sleep(STEP_MS);
        quiet = 0;
        continue;
      }
      // At the bottom: wait for what is still coming in.
      scrollTo(height);
      var list = pictures();
      var signature = list.length + '/' + list.filter(loaded).length + '/' + places() + '/' + height;
      quiet = signature === last ? quiet + 1 : 0;
      last = signature;
      if (list.length > 0 && list.every(loaded) && list.length >= places() && quiet >= QUIET_STEPS) return;
      if (list.length === 0 && Date.now() - started > NOTHING_MS) return;
      await sleep(STEP_MS);
    }
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
    await scroll();
    var list = pictures();
    var wanted = places();
    var summary = 'pictures ' + list.length + ', places ' + wanted + ', page height ' + heightOf();
    // A chapter with a page missing is worse than none: say so instead of shifting the others.
    if (!list.every(loaded)) throw new Error('A picture did not load (' + list.filter(loaded).length + ' of ' + list.length + ').');
    if (list.length < wanted) throw new Error('Only ' + list.length + ' of ' + wanted + ' pages came.');
    for (var i = 0; i < list.length; i++) {
      var blob = await blobOf(list[i]);
      bridge.add(token, blob.type || '', await base64Of(blob));
    }
    bridge.done(token, summary);
  }

  main().catch(function (error) { bridge.fail(token, String((error && error.message) || error)); });
})();`;
}
