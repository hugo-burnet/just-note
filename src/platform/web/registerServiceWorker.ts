/** Installs the service worker of a production build; in development there is none, so nothing is ever stale. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // Relative, so it works under /<repository>/ on GitHub Pages as at the root.
    navigator.serviceWorker.register('./sw.js').catch((error: unknown) => console.warn('No offline mode:', error));
  });
}
