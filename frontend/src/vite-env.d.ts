/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

interface ImportMetaEnv {
  /** When 'true', API calls short-circuit and a banner is shown. Set by CI. */
  readonly VITE_WIP_MODE?: 'true' | 'false';
  /** When 'true', auth + every API call are served by an in-memory mock backend
   *  for local frontend testing with no server. Set by `npm run dev:mock`. */
  readonly VITE_MOCK_MODE?: 'true' | 'false';
  /** Version string baked into the build (e.g. 'v0.1.0' or 'dev-a1b2c3d'). */
  readonly VITE_APP_VERSION?: string;
  /**
   * Base URL for the gameplay/public API. No trailing slash. When unset, the
   * client uses `/api`, which the Vite dev proxy forwards to local FastAPI.
   * In CI builds the deploy workflow fills this with the HTTP API endpoint
   * read from the FatchadApiStack CloudFormation outputs.
   */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Base URL for the admin API. Separate from VITE_API_BASE_URL so an
   * environment can route admin traffic through a different host (e.g. a
   * locked-down VPN-only domain) without ceremony. Defaults to '/api/admin'
   * for the dev proxy.
   */
  readonly VITE_ADMIN_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
