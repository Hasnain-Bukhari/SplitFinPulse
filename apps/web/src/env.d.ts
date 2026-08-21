/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ContactAddress {
  name?: string[];
  email?: string[];
}

interface ContactsManager {
  select(
    properties: Array<"name" | "email">,
    options: { multiple: boolean },
  ): Promise<ContactAddress[]>;
}

interface Navigator {
  contacts?: ContactsManager;
}
