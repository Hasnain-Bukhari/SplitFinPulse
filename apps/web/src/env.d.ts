/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
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
