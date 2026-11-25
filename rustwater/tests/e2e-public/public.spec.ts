// The public site build (docs/PUBLIC-SITE-PLAN.md): no sign-in, test builds saved in the browser,
// the calculator, offline after one visit, and never a request to a server API.
import { readdirSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function main(page: Page) {
  return page.getByRole('main');
}

/** Collects page errors, CSP violations, and any request to `/api/`. */
async function watch(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('request', (request) => {
    // No Rustwater logo or site art on the public site.
    if (new URL(request.url()).pathname.includes('/brand/'))
      problems.push(`Brand image: ${request.url()}`);
    if (new URL(request.url()).pathname.includes('/api/'))
      problems.push(`API call: ${request.url()}`);
  });
  await page.exposeFunction('reportViolation', (text: string) => problems.push(text));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      void (window as unknown as { reportViolation: (text: string) => void }).reportViolation(
        `CSP violation: ${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  return problems;
}

/** Runs the new test build wizard with the first choice of every question. */
async function makeTestBuild(page: Page, name: string): Promise<void> {
  await page.goto('./#/test-builds');
  await main(page).getByRole('link', { name: 'New test build' }).click();
  await expect(main(page).getByRole('heading', { level: 1, name: 'New test build' })).toBeVisible();
  await main(page).getByLabel('Character name').fill(name);
  await main(page).getByLabel('Age').fill('3');
  const progress = main(page).getByText(/^Step \d of 6$/);
  for (let step = 1; step <= 6; step += 1) {
    await expect(progress).toHaveText(`Step ${step} of 6`);
    // Pick the first option of every radio group with none chosen. Twice: choosing an ancestry
    // shows its subtypes.
    for (let pass = 0; pass < 2; pass += 1) {
      await page.evaluate(() => {
        const radios = [...document.querySelectorAll<HTMLInputElement>('main input[type=radio]')];
        for (const group of new Set(radios.map((r) => r.name)))
          if (!radios.some((r) => r.name === group && r.checked))
            radios.find((r) => r.name === group)?.click();
      });
    }
    await main(page)
      .getByRole('button', { name: step === 6 ? 'Create test build' : 'Next' })
      .click();
  }
  await expect(page).toHaveURL(/#\/c\//);
  await expect(main(page).getByText(name).first()).toBeVisible();
}

test('the site opens on the calculator, with no sign-in and no accessibility problems', async ({
  page,
}) => {
  const problems = await watch(page);
  await page.goto('./');
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Soak and Damage Calculator' }),
  ).toBeVisible();
  await expect(main(page).getByText('Unofficial, player-made tool')).toBeVisible();
  // Header links, left to right: the calculator, Test Builds, the Rules Wiki.
  await expect(page.getByRole('banner').getByRole('link')).toContainText([
    'Soak and Damage Calculator',
    'Test Builds',
    'Rules Wiki',
  ]);
  // The offline option sits above the header.
  await expect(page.getByRole('region', { name: 'Offline use' })).toBeVisible();
  await expect(page.getByText('Unofficial Player Tools')).toBeVisible();
  // A button back to the LARP Tools hub at the site root.
  const hub = page.getByRole('banner').getByRole('link', { name: 'LARP Tools', exact: true });
  await expect(hub).toBeVisible();
  await expect(hub).toHaveAttribute('href', '/');
  expect((await hub.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('link', { name: 'Sign In' })).toHaveCount(0);
  await expect(
    page.getByText('Unofficial fan tool, not affiliated with Rustwater LARP.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/mrtwizk241/larptools',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Test Builds has its own page, with the storage and privacy notes.
  await page.getByRole('banner').getByRole('link', { name: 'Test Builds' }).click();
  await expect(main(page).getByRole('heading', { level: 1, name: 'Test Builds' })).toBeVisible();
  await expect(page).toHaveURL(/#\/test-builds$/);
  await expect(main(page).getByText('saved only in this browser')).toBeVisible();
  await expect(main(page).getByText('Unofficial, player-made tool')).toBeVisible();
  await expect(main(page).getByText('no tracking')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Old calculator links still work.
  await page.goto('./#/calculator');
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Soak and Damage Calculator' }),
  ).toBeVisible();
  // The build ships the security headers file and no brand images.
  expect((await page.request.get('./_headers')).ok()).toBe(true);
  const logo = await page.request.get('./brand/logo-96.webp');
  expect(logo.headers()['content-type'] ?? '').not.toMatch(/^image\//);
  expect(problems).toEqual([]);
});

test('the LARP Tools button fits 375px and passes axe in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  const hub = page.getByRole('banner').getByRole('link', { name: 'LARP Tools', exact: true });
  await expect(hub).toBeVisible();
  await expect(hub).toHaveAttribute('href', '/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('a test build is made, changed, and kept in this browser', async ({ page }) => {
  const problems = await watch(page);
  await makeTestBuild(page, 'Public Test Build');
  await expect(main(page).getByText('Saved only in this browser.')).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Requests' })).toHaveCount(0);

  // Add points the way the test build banner does.
  await main(page).getByLabel('Amount to add or remove').fill('50');
  await main(page).getByRole('button', { name: 'Add or remove points' }).click();
  await expect(page.getByText('Added 50 CXP.')).toBeVisible();

  await page.reload();
  await expect(main(page).getByText('Public Test Build').first()).toBeVisible();
  await page.goto('./#/test-builds');
  await expect(main(page).getByRole('link', { name: /Public Test Build/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test('server-only screens are not on the public site', async ({ page }) => {
  for (const path of ['login', 'staff', 'admin', 'events', 'requests']) {
    await page.goto(`./#/${path}`);
    await expect(
      main(page).getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible();
  }
});

test('after Make available offline, the calculator, test builds, and the wiki work offline', async ({
  page,
  context,
}) => {
  const problems = await watch(page);
  await makeTestBuild(page, 'Offline Build');
  await page.goto('./#/test-builds');
  // Make available offline: the bar says when the site is saved, then stays away.
  const bar = page.getByRole('region', { name: 'Offline use' });
  await bar.getByRole('button', { name: 'Make available offline' }).click();
  await expect(bar.getByRole('status')).toContainText('Ready to use offline', { timeout: 30_000 });
  await bar.getByRole('button', { name: 'Close the offline bar' }).click();
  await expect(bar).toHaveCount(0);

  await context.setOffline(true);
  await page.reload();
  await expect(main(page).getByRole('link', { name: /Offline Build/ })).toBeVisible();
  await main(page)
    .getByRole('link', { name: /Offline Build/ })
    .click();
  await expect(main(page).getByText('Offline Build').first()).toBeVisible();
  await expect(bar).toHaveCount(0);
  await page.goto('./#/calculator');
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Soak and Damage Calculator' }),
  ).toBeVisible();
  // The wiki and its articles work offline too.
  await page.goto('./#/wiki');
  await expect(main(page).getByRole('heading', { level: 1, name: 'Rules Wiki' })).toBeVisible();
  await main(page).getByRole('link', { name: 'Making a Character' }).click();
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Making a Character' }),
  ).toBeVisible();
  // Settings still offers it, already done.
  await page.goto('./#/settings');
  await expect(main(page).getByText('Ready to use offline')).toBeVisible();
  expect(problems).toEqual([]);
});

test('the Rules Wiki is the third header link, with no accessibility problems', async ({
  page,
}) => {
  const problems = await watch(page);
  await page.goto('./');
  await page.getByRole('banner').getByRole('link', { name: 'Rules Wiki' }).click();
  await expect(page).toHaveURL(/#\/wiki$/);
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // An article opens from the list.
  await main(page).getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/wiki\/./);
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(problems).toEqual([]);
});

test('test builds are backed up to a file and restored from it', async ({ page }) => {
  // Force the download path: the share sheet cannot be driven in a test.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
  const problems = await watch(page);
  await makeTestBuild(page, 'Backed Up Build');
  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await main(page).getByRole('button', { name: 'Back up all characters' }).click();
  const file = await download;
  const backupPath = await file.path();
  const backup = JSON.parse(readFileSync(backupPath, 'utf8')) as { characters: unknown[] };
  expect(backup.characters).toHaveLength(1);

  // Clear this browser's data, then restore from the file.
  await page.evaluate(async () => {
    for (const db of await indexedDB.databases())
      if (db.name)
        await new Promise((done) => {
          const request = indexedDB.deleteDatabase(db.name!);
          request.onsuccess = request.onerror = request.onblocked = done;
        });
  });
  await page.goto('./#/test-builds');
  await page.reload();
  await expect(main(page).getByText('No test builds yet.')).toBeVisible();
  await page.goto('./#/settings');
  const chooser = page.waitForEvent('filechooser');
  await main(page).getByRole('button', { name: 'Restore from backup' }).click();
  await (await chooser).setFiles(backupPath);
  const dialog = page.getByRole('dialog', { name: 'Restore from backup?' });
  await expect(dialog).toContainText('New: 1');
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Restored 1 character.')).toBeVisible();
  await page.goto('./#/test-builds');
  await expect(main(page).getByRole('link', { name: /Backed Up Build/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a test build row's menu copies, exports, and deletes it", async ({ page }) => {
  // Force the download path: the share sheet cannot be driven in a test.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
  const problems = await watch(page);
  await makeTestBuild(page, 'Menu Build');
  await page.goto('./#/test-builds');
  await page.reload(); // clears the toast before the checks
  const more = (name: string) =>
    main(page).getByRole('button', { name: `More for ${name}`, exact: true });
  const actions = (name: string) => main(page).getByRole('list', { name: `Actions for ${name}` });

  // Opens and closes; Escape puts focus back on the button.
  await more('Menu Build').click();
  await expect(more('Menu Build')).toHaveAttribute('aria-expanded', 'true');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(actions('Menu Build')).toHaveCount(0);
  await expect(more('Menu Build')).toBeFocused();

  // Copy.
  await more('Menu Build').click();
  await actions('Menu Build').getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Copied Menu Build as Menu Build (copy).')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Menu Build \(copy\)/ })).toBeVisible();

  // Export: a backup file with only that build.
  await more('Menu Build (copy)').click();
  const download = page.waitForEvent('download');
  await actions('Menu Build (copy)').getByRole('button', { name: 'Export' }).click();
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8')) as {
    characters: { id: string }[];
  };
  expect(file.characters).toHaveLength(1);

  // Delete, behind a confirm.
  await more('Menu Build (copy)').click();
  await actions('Menu Build (copy)').getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Menu Build (copy)?' });
  await confirm.getByRole('button', { name: 'Delete test build' }).click();
  await expect(page.getByText('Deleted Menu Build (copy).')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Menu Build \(copy\)/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /Menu Build/ })).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('the calculator opens from the header, with Totals and Character tabs', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('./#/test-builds');
  await page.getByRole('banner').getByRole('link', { name: 'Soak and Damage Calculator' }).click();
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Soak and Damage Calculator' }),
  ).toBeVisible();
  const health = page
    .getByRole('region', { name: 'Health', exact: true })
    .locator('[aria-live="polite"]')
    .first();
  // The page always opens on Totals; skills are on the Character tab.
  await expect(page.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
  await expect(health).toHaveText('Health 10');
  await page.getByRole('tab', { name: 'Character' }).click();
  await page.getByRole('button', { name: 'Raise Toughness (Warrior)', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('tab', { name: 'Totals' }).click();
  await expect(health).toHaveText('Health 20');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Back on Totals after a reload, even when left on Character.
  await page.getByRole('tab', { name: 'Character' }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Totals' })).toHaveAttribute('aria-selected', 'true');
  await expect(health).toHaveText('Health 20');
  expect(problems).toEqual([]);
});

test('the public build ships no server code', () => {
  // Built by playwright.public.config.ts before the tests run.
  const assets = new URL('../../dist-e2e-public/assets/', import.meta.url);
  const code = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(new URL(name, assets), 'utf8'))
    .join('\n');
  expect(code.length).toBeGreaterThan(0);
  // The privacy scan (scripts/privacy-scan.mjs) checks the built site for private details.
  for (const marker of ['/api/', 'Staff sign-in', 'Staff Tools'])
    expect(code, marker).not.toContain(marker);
});
