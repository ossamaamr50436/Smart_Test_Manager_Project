/* Service Worker — تطبيق ويب تقدمي (PWA)
 * - تخزين مؤقت للموارد الأساسية (App Shell) لدعم العمل دون اتصال
 * - استراتيجية: Cache First للملفات الثابتة، Network First للطلبات التنقّل
 * - مسح المخازن القديمة عند تحديث الإصدار
 */
const CACHE_NAME = "smart-test-manager-v1";
const APP_SHELL = [
  "/",
  "/login",
  "/dashboard",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // لا نخزن مؤقتاً استدعاءات الـ API وقنوات البث الحي
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return;
  }

  // استراتيجية Cache First للملفات الثابتة (صور، أيقونات)
  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Network First لطلبات الصفحات (التنقّل) مع الرجوع للكاش عند عدم التوفر
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/login")))
  );
});
