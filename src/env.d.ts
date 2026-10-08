interface ImportMetaEnv {
  /** Where the proxy lives when the app is hosted without one (GitHub Pages). Set at build time. */
  readonly VITE_PROXY_URL?: string;
}

/** The version of package.json, put in by Vite. */
declare const __APP_VERSION__: string;
