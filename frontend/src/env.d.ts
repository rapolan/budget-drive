/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_TENANT_ID?: string;
  // add other VITE_ env vars here as needed
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Provide a minimal `process.env` shape for libraries that reference it
declare const process: {
  env: {
    NODE_ENV?: string;
    [key: string]: any;
  };
};

export {};
