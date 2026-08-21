import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { api } from "./api/client";

export async function enablePushNotifications(): Promise<void> {
  if (!("Notification" in window) || !("serviceWorker" in navigator))
    throw new Error("Push notifications are unavailable in this browser");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notification permission was not granted");
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey)
    throw new Error("Push notifications are not configured");
  const config = {
    apiKey,
    projectId,
    messagingSenderId,
    appId,
    ...(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
      ? { authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN }
      : {}),
  };
  const app = getApps()[0] ?? initializeApp(config);
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Push registration did not return a token");
  await api.registerPushDevice(token);
}
