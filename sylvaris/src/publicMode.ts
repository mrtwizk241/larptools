// The public site build (docs/PUBLIC-SITE-PLAN.md): the no-login app (`LOCAL_MODE`, src/localMode.ts)
// hosted on larptools with a service worker. Every character is the visitor's own test build, saved
// in this browser. `__SY_PUBLIC__` is true only in `vite.public.config.ts`; the app with accounts
// and the single-file Character Playground set it to false.
declare const __SY_PUBLIC__: boolean;

export const PUBLIC_MODE: boolean = typeof __SY_PUBLIC__ === 'boolean' ? __SY_PUBLIC__ : false;

/**
 * Where the list of characters lives. On the public site the calculator is the start page, so the
 * visitor's test builds have their own address.
 */
export const CHARACTERS_PATH = PUBLIC_MODE ? '/test-builds' : '/';

/** The open source repo of the public site, linked from the footer. */
export const PUBLIC_REPO_URL = 'https://github.com/mrtwizk241/larptools';

/** Most test builds the public site keeps in one browser. */
export const TEST_BUILD_LIMIT = 10;
