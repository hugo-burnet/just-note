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
 * page, to the plugin. It ends with `done`, or with `fail` and the reason.
 *
 * The pictures are read from the blobs the hook kept, else asked for by their address, else drawn
 * on a canvas (a picture whose address has been let go of is still on screen).
 */
export function pictureScript(selector: string): string {
  return `(function () {
  var bridge = window.JustReadPictures;
  var token = window.__justReadToken;
  var SELECTOR = ${JSON.stringify(selector)};
  var STEP_MS = 350;
  var QUIET_STEPS = 6;
  var BUDGET_MS = 45000;
  var NOTHING_MS = 12000;

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function pictures() { return Array.prototype.slice.call(document.querySelectorAll(SELECTOR)); }
  function loaded(img) { return img.complete && img.naturalWidth > 0; }
  function heightOf() {
    return Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  }

  async function scroll() {
    var started = Date.now();
    var y = 0;
    var quiet = 0;
    var last = '';
    while (Date.now() - started < BUDGET_MS) {
      var height = heightOf();
      var view = window.innerHeight || 600;
      if (y + view < height) {
        y = Math.min(y + Math.round(view * 0.8), height);
        window.scrollTo(0, y);
        await sleep(STEP_MS);
        quiet = 0;
        continue;
      }
      // At the bottom: wait for what is still coming in.
      window.scrollTo(0, height);
      var list = pictures();
      var signature = list.length + '/' + list.filter(loaded).length + '/' + height;
      quiet = signature === last ? quiet + 1 : 0;
      last = signature;
      if (list.length > 0 && list.every(loaded) && quiet >= QUIET_STEPS) return;
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
    // A chapter with a page missing is worse than none: say so instead of shifting the others.
    if (!list.every(loaded)) throw new Error('A picture did not load (' + list.filter(loaded).length + ' of ' + list.length + ').');
    for (var i = 0; i < list.length; i++) {
      var blob = await blobOf(list[i]);
      bridge.add(token, blob.type || '', await base64Of(blob));
    }
    bridge.done(token);
  }

  main().catch(function (error) { bridge.fail(token, String((error && error.message) || error)); });
})();`;
}
