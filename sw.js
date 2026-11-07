var CACHE = "xiaji-shell-4";
var SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/ledger.js",
  "./js/rules.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/xlsx.full.min.js",
  "./vendor/chart.umd.min.js",
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(SHELL);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("traineddata") >= 0) return;
  event.respondWith(fetch(req).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
    return res;
  }).catch(function () {
    return caches.match(req).then(function (cached) {
      if (cached) return cached;
      if (req.mode === "navigate") return caches.match("./index.html");
      return new Response("", { status: 504 });
    });
  }));
});
