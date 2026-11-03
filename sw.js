/* Absolute Reader service worker: offline app + libraries, and PDFs shared to the installed app. */
const V = "absolute-reader-v2";
const SHELL = ["./reader.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];
const LIBS = /(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)/;

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== V && x !== "reader-share").map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

const put = (r, res) => { if (res && res.ok && res.status !== 206) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)).catch(() => {}); } return res; };

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);

  /* A PDF shared to the installed app (share_target): keep the files, then open the reader */
  if (r.method === "POST" && u.origin === location.origin && u.searchParams.has("share")) {
    e.respondWith((async () => {
      try {
        const fd = await r.formData(), files = fd.getAll("pdf").filter(f => f && f.name !== undefined);
        const c = await caches.open("reader-share");
        let i = 0;
        for (const f of files) { await c.put("/__shared/" + i++ + "?name=" + encodeURIComponent(f.name || "shared.pdf"), new Response(f)); }
        return Response.redirect(u.pathname + "?shared=" + files.length, 303);
      } catch (err) {
        return Response.redirect(u.pathname, 303);
      }
    })());
    return;
  }

  if (r.method !== "GET") return;

  if (u.origin === location.origin) {
    /* the page: network first so updates arrive, cached copy when offline */
    if (r.mode === "navigate" || u.pathname.endsWith("reader.html")) {
      e.respondWith(
        fetch(r).then(res => put(r, res))
          .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("./reader.html")))
      );
      return;
    }
    /* icons, manifest: serve cached now, refresh in the background */
    e.respondWith(
      caches.match(r).then(m => {
        const net = fetch(r).then(res => put(r, res)).catch(() => m);
        return m || net;
      })
    );
    return;
  }

  /* pdf.js, fonts, etc.: cached after first use so the reader opens offline */
  if (LIBS.test(u.host)) {
    e.respondWith(
      caches.match(r).then(m => {
        const net = fetch(r).then(res => { if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(V).then(x => x.put(r, c)).catch(() => {}); } return res; }).catch(() => m);
        return m || net;
      })
    );
  }
});
