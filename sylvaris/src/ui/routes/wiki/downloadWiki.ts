// "Download wiki": builds the one-file HTML copy in the browser and saves it. Works offline:
// the builder is its own chunk, precached by the service worker, and the stylesheet and logo
// come from the page and the cache.
import { BRAND } from '../../brandAssets.ts';
import { downloadBlob } from '../../data/saveFile.ts';
import { wikiRuleset } from './wikiData.ts';

/** The page's stylesheets as text, without web fonts (their files are not in the copy). */
export function pageCss(doc: Document = document): string {
  const parts: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // A stylesheet from another site; there are none, but do not fail on one.
    }
    for (const rule of Array.from(rules)) {
      if (rule.cssText.startsWith('@font-face')) continue;
      parts.push(rule.cssText);
    }
  }
  return parts.join('\n');
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(new URL(BRAND.logo96, document.baseURI));
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * The test-build planner script, built next to the app (planner/planner.js) and precached for
 * offline use. Null in dev, where it is not built; the file then has no Test build section.
 */
async function plannerScript(): Promise<string | null> {
  try {
    const response = await fetch(new URL('planner/planner.js', document.baseURI));
    if (!response.ok) return null;
    const text = await response.text();
    // The real script mounts on #test-build-app; anything else (a fallback page) is ignored.
    return text.includes('test-build-app') ? text : null;
  } catch {
    return null;
  }
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Builds the file and hands it to the browser's download. Returns the file name. */
export async function downloadWikiHtml(): Promise<string> {
  const { wikiExportFileName, wikiHtmlDocument } = await import('./exportWiki.tsx');
  const rs = wikiRuleset();
  const html = wikiHtmlDocument({
    rs,
    css: pageCss(),
    logoDataUrl: await logoDataUrl(),
    date: today(),
    plannerScript: await plannerScript(),
  });
  const name = wikiExportFileName(rs);
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
  return name;
}
