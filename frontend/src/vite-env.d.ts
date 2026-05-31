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
  /**
   * When 'true', auth flows run against the in-process demo backend
   * (DEMO_USERNAME / DEMO_PASSWORD), no Cognito calls. Defaults to true
   * during `npm run dev` (see .env.development), false in production builds.
   */
  readonly VITE_USE_DEMO_AUTH?: 'true' | 'false';
  /** Cognito User Pool id, e.g. 'eu-central-1_AbCdEfG'. Baked at build time. */
  readonly VITE_USER_POOL_ID?: string;
  /** Cognito User Pool web client id. Baked at build time. */
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  /** AWS region the user pool lives in. Defaults to 'eu-central-1'. */
  readonly VITE_AWS_REGION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
