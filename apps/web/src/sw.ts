/// <reference lib="webworker" />
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string }>;
};

const cacheName = "splitfinpulse-shell-v1";
const assets = self.__WB_MANIFEST.map((item) => item.url);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/health" ||
    event.request.method !== "GET"
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match("/index.html")) ?? Response.error(),
      ),
    );
    return;
  }
  if (url.origin === self.location.origin && assets.includes(url.pathname))
    event.respondWith(
      caches
        .match(event.request)
        .then((cached) => cached ?? fetch(event.request)),
    );
});

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;
if (apiKey && projectId && messagingSenderId && appId) {
  const config = {
    apiKey,
    projectId,
    messagingSenderId,
    appId,
    ...(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
      ? { authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN }
      : {}),
  };
  const messaging = getMessaging(initializeApp(config));
  onBackgroundMessage(messaging, async (payload) => {
    await self.registration.showNotification(
      payload.notification?.title ?? "SplitFinPulse",
      {
        body: payload.notification?.body ?? "You have a SplitFinPulse update",
        data: { url: payload.fcmOptions?.link ?? "/notifications" },
        icon: "/pwa-192x192.png",
      },
    );
  });
}
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    typeof event.notification.data?.url === "string"
      ? event.notification.data.url
      : "/notifications";
  event.waitUntil(self.clients.openWindow(url));
});
