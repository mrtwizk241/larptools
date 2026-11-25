// No-login builder: the logo and header art inside the HTML file as data URLs, so the one file
// needs nothing else. Used instead of brandAssets.ts by vite.local.config.ts.
import logo96 from '../../public/brand/logo-96.webp?inline';
import logo256 from '../../public/brand/logo-256.webp?inline';
import swamp800 from '../../public/brand/swamp-800.webp?inline';
import swamp1600 from '../../public/brand/swamp-1600.webp?inline';

export const BRAND = { logo96, logo256, swamp800, swamp1600 };
