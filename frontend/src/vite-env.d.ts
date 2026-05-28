/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

interface ImportMetaEnv {
  /** When 'true', API calls short-circuit and a banner is shown. Set by CI. */
  readonly VITE_WIP_MODE?: 'true' | 'false';
  /** Version string baked into the build (e.g. 'v0.1.0' or 'dev-a1b2c3d'). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
