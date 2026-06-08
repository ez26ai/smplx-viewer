// Google Analytics 4 (gtag.js) loader.
//
// This intentionally does nothing unless a Measurement ID is provided at build
// time via the VITE_GA_ID environment variable. That keeps `pnpm dev` and any
// build without the variable completely analytics-free — which also preserves
// the app's privacy promise (the user's model file is never uploaded; GA only
// ever sees page views / events, never file contents).
//
// Set it in a `.env` file (see .env.example) or inline:
//   VITE_GA_ID=G-XXXXXXXXXX pnpm bundle

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function initAnalytics(): void {
  const id = import.meta.env.VITE_GA_ID;
  if (!id) return; // no ID configured -> analytics disabled

  // GA needs a real http(s) origin. When the standalone file is opened directly
  // from disk (file://) there is no domain to attribute traffic to, so skip it.
  if (typeof window === 'undefined') return;
  if (window.location.protocol === 'file:') {
    console.info('[analytics] disabled: page opened from the filesystem (file://).');
    return;
  }

  // Inject the gtag.js library.
  const gtm_script = document.createElement('script');
  gtm_script.async = true;
  gtm_script.src = `https://www.googletagmanager.com`;
  document.head.appendChild(gtm_script);

  // Standard gtag bootstrap.
  const gtag_script = document.createElement('script');
  gtag_script.textContent = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  window.gtag('js', new Date());
  window.gtag('config', '${id}');
  `;
  document.head.appendChild(gtag_script);
}
