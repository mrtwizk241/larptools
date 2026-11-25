// The logo and header art. The app loads them from public/brand/ by address; the no-login
// builder (one HTML file) swaps this module for brandAssets.local.ts, which carries them inside
// the file (see vite.local.config.ts).
const BASE = import.meta.env.BASE_URL;

export const BRAND = {
  logo96: `${BASE}brand/logo-96.webp`,
  logo256: `${BASE}brand/logo-256.webp`,
  swamp800: `${BASE}brand/swamp-800.webp`,
  swamp1600: `${BASE}brand/swamp-1600.webp`,
};
