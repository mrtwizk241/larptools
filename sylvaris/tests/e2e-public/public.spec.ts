// The public site build (docs/PUBLIC-SITE-PLAN.md): no sign-in, test builds saved in the browser,
// offline after one visit, and never a request to a server API.
import { readdirSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function main(page: Page) {
  return page.getByRole('main');
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .options({ rules: { 'label-content-name-mismatch': { enabled: true } } })
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Collects page errors, CSP violations, brand images, and any request to `/api/`. */
async function watch(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    // No Sylvaris logo or site art on the public site.
    if (pathname.includes('/brand/')) problems.push(`Brand image: ${request.url()}`);
    if (pathname.includes('/api/')) problems.push(`API call: ${request.url()}`);
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

/** Forces the download path: the share sheet cannot be driven in a test. */
async function noShareSheet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
}

/** Runs the new test build wizard: a Human with Toughness 1. */
async function makeTestBuild(page: Page, name: string): Promise<void> {
  await page.goto('./#/test-builds');
  await main(page).getByRole('link', { name: 'New test build' }).click();
  await expect(main(page).getByRole('heading', { level: 1, name: 'New test build' })).toBeVisible();
  await main(page)
    .getByLabel(/Character name/)
    .fill(name);
  await main(page).getByRole('button', { name: 'Next' }).click();
  await main(page).getByRole('radio', { name: 'Human' }).check();
  await main(page).getByRole('button', { name: 'Next' }).click();
  await main(page).getByRole('tab', { name: 'Defensive' }).click();
  await main(page).getByRole('button', { name: 'Raise Toughness' }).click();
  await main(page).getByRole('button', { name: 'Next' }).click();
  await main(page).getByRole('button', { name: 'Create test build' }).click();
  await expect(page).toHaveURL(/#\/c\//);
  await expect(main(page).getByRole('heading', { level: 1, name })).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`opens with the header links and footer, no sign-in, and no accessibility problems (${theme})`, async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('./');
    await expect(
      main(page).getByRole('heading', { level: 1, name: 'Life and Damage Calculator' }),
    ).toBeVisible();
    const banner = page.getByRole('banner');
    await expect(banner.getByText('Sylvaris', { exact: true })).toBeVisible();
    await expect(banner.getByText('Unofficial Player Tools')).toBeVisible();
    // The LARP Tools button goes back to the larptools hub at the site root.
    const hub = banner.getByRole('link', { name: 'LARP Tools' });
    await expect(hub).toBeVisible();
    await expect(hub).toHaveAttribute('href', '/');
    await expect(banner.getByRole('link', { name: 'Settings' })).toBeVisible();
    // Header links, left to right: the calculator, Test Builds, the Rules Wiki.
    await expect(banner.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
      /Life and Damage Calculator|Calculator/,
      'Test Builds',
      'Rules Wiki',
    ]);
    await expect(
      banner.getByRole('link', { name: 'Life and Damage Calculator', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Offline use' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/i })).toHaveCount(0);
    await expect(
      page.getByText(
        'Unofficial fan tool, not affiliated with Sylvaris LARP or Sylvaris Games, LLC.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/mrtwizk241/larptools',
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expectNoAxeViolations(page);

    // Test Builds has its own page, with the storage and privacy notes.
    await banner.getByRole('link', { name: 'Test Builds' }).click();
    await expect(page).toHaveURL(/#\/test-builds$/);
    await expect(main(page).getByRole('heading', { level: 1, name: 'Test Builds' })).toBeVisible();
    await expect(main(page).getByText('Unofficial, player-made tool')).toBeVisible();
    await expect(main(page).getByText('No sign-in, no tracking, and no analytics')).toBeVisible();
    await expect(
      main(page).getByText('Your test builds are saved only in this browser'),
    ).toBeVisible();
    await expect(main(page).getByText('No test builds yet.')).toBeVisible();
    await expectNoAxeViolations(page);

    // The Rules Wiki and Settings.
    await banner.getByRole('link', { name: 'Rules Wiki' }).click();
    await expect(page).toHaveURL(/#\/wiki$/);
    await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);
    await banner.getByRole('link', { name: 'Settings' }).click();
    await expect(main(page).getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Make available offline' })).toBeVisible();
    await expectNoAxeViolations(page);

    // The build ships the security headers file and no brand images.
    expect((await page.request.get('./_headers')).ok()).toBe(true);
    const logo = await page.request.get('./brand/logo-96.webp');
    expect(logo.headers()['content-type'] ?? '').not.toMatch(/^image\//);
    expect(problems).toEqual([]);
  });
}

test('a test build made with the wizard is kept after a reload', async ({ page }) => {
  const problems = await watch(page);
  await makeTestBuild(page, 'Wren Public');
  await page.reload();
  await expect(main(page).getByRole('heading', { level: 1, name: 'Wren Public' })).toBeVisible();
  await page.goto('./#/test-builds');
  const row = main(page).getByRole('link', { name: /Wren Public/ });
  await expect(row).toBeVisible();
  // hand-derived: the 150 starting XP
  await expect(row).toContainText('XP 150 total');
  await expect(row).toContainText('Human');
  await page.reload();
  await expect(main(page).getByRole('link', { name: /Wren Public/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test("a test build row's menu copies, exports, and deletes it", async ({ page }) => {
  await noShareSheet(page);
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
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(actions('Menu Build')).toHaveCount(0);
  await expect(more('Menu Build')).toBeFocused();

  // Copy: "(copy)" through a rename in the log.
  await more('Menu Build').click();
  await actions('Menu Build').getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Copied Menu Build as Menu Build (copy).')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Menu Build \(copy\)/ })).toBeVisible();

  // Export: a backup file with only that build, which Restore from backup reads.
  await more('Menu Build (copy)').click();
  const download = page.waitForEvent('download');
  await actions('Menu Build (copy)').getByRole('button', { name: 'Export' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.sybackup\.json$/);
  const exported = JSON.parse(readFileSync(await file.path(), 'utf8')) as {
    characters: { id: string }[];
  };
  expect(exported.characters).toHaveLength(1);

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

test('test builds are backed up to a file and restored from it', async ({ page }) => {
  await noShareSheet(page);
  const problems = await watch(page);
  await makeTestBuild(page, 'Backed Up Build');
  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await main(page).getByRole('button', { name: 'Back up all characters' }).click();
  const backupPath = await (await download).path();
  const backup = JSON.parse(readFileSync(backupPath, 'utf8')) as { characters: unknown[] };
  expect(backup.characters).toHaveLength(1);

  // Clear this browser's saved test builds, then restore from the file.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('sylvaris-builder:')) localStorage.removeItem(key);
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

test('server-only screens are not on the public site', async ({ page }) => {
  for (const path of ['login', 'signup', 'staff', 'staff/login', 'admin', 'events', 'requests']) {
    await page.goto(`./#/${path}`);
    await expect(
      main(page).getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible();
  }
  await expect(main(page).getByRole('link', { name: 'Back to test builds' })).toBeVisible();
});

test('after Make available offline, test builds and the wiki work with no signal', async ({
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
  await expect(main(page).getByRole('heading', { level: 1, name: 'Offline Build' })).toBeVisible();
  await expect(bar).toHaveCount(0);
  await page.goto('./');
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Life and Damage Calculator' }),
  ).toBeVisible();
  await page.goto('./#/wiki');
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
  // Settings still offers it, already done.
  await page.goto('./#/settings');
  await expect(main(page).getByText('Ready to use offline')).toBeVisible();
  expect(problems).toEqual([]);
});

test('the public build ships no server calls', () => {
  // Built by playwright.public.config.ts before the tests run.
  const assets = new URL('../../dist-e2e-public/assets/', import.meta.url);
  const code = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(new URL(name, assets), 'utf8'))
    .join('\n');
  expect(code.length).toBeGreaterThan(0);
  for (const marker of ['/api/', 'Staff sign-in']) expect(code, marker).not.toContain(marker);
});

// ---- Life and Damage Calculator (the start page) ----

/** The text of a calculator's button on Totals, for example "Life 10". */
function calcButton(page: Page, name: 'Life' | 'Armor' | 'Damage') {
  return main(page).getByRole('button', { name: new RegExp(`^${name} `) });
}

async function calcTab(page: Page, name: 'Totals' | 'Character'): Promise<void> {
  await main(page).getByRole('tab', { name }).click();
}

test('the calculator: Totals and Character tabs, a Character input changes a total, Reset', async ({
  page,
}) => {
  const problems = await watch(page);
  await page.goto('./');
  await expect(
    main(page).getByRole('heading', { level: 1, name: 'Life and Damage Calculator' }),
  ).toBeVisible();
  await expect(main(page).getByText('Unofficial, player-made tool')).toBeVisible();
  // Always opens on Totals.
  await expect(main(page).getByRole('tab', { name: 'Totals' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(main(page).getByRole('tab', { name: 'Character' })).toBeVisible();
  // hand-derived: base 10 Life, 0 Armor
  await expect(calcButton(page, 'Life')).toHaveText('Life 10');
  await expect(calcButton(page, 'Armor')).toHaveText('Armor 0');

  // Toughness 3 with Expert: 10 + 20.
  await calcTab(page, 'Character');
  for (let n = 0; n < 3; n += 1)
    await main(page).getByRole('button', { name: 'Raise Toughness', exact: true }).click();
  await main(page).getByRole('checkbox', { name: 'Toughness Expert' }).check();
  await calcTab(page, 'Totals');
  await expect(calcButton(page, 'Life')).toHaveText('Life 30');

  // Kept after a reload, and still opens on Totals.
  await page.reload();
  await expect(main(page).getByRole('tab', { name: 'Totals' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(calcButton(page, 'Life')).toHaveText('Life 30');

  // Reset asks first, then clears everything.
  await main(page).getByRole('button', { name: 'Reset calculator' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset the calculator?' });
  await dialog.getByRole('button', { name: 'Reset calculator' }).click();
  await expect(calcButton(page, 'Life')).toHaveText('Life 10');
  expect(problems).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`the calculator passes axe and fits 375px, ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('./');
    await expect(
      main(page).getByRole('heading', { level: 1, name: 'Life and Damage Calculator' }),
    ).toBeVisible();
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false);

    // Character: a race with a natural weapon, a Calling, skills with a Technique, a spell, a power.
    await calcTab(page, 'Character');
    await main(page).getByRole('combobox', { name: 'Race' }).selectOption('beast-kin');
    await main(page).getByRole('combobox', { name: 'Calling' }).selectOption('warblade');
    for (let n = 0; n < 3; n += 1)
      await main(page).getByRole('button', { name: 'Raise Precision', exact: true }).click();
    await main(page).getByRole('checkbox', { name: 'Precision Expert' }).check();
    await main(page).getByRole('checkbox', { name: 'Chain Lightning' }).check();
    await main(page).getByRole('checkbox', { name: 'Short Claws' }).check();
    await expectNoAxeViolations(page);
    await noOverflow();

    // Totals with every calculator open.
    await calcTab(page, 'Totals');
    for (const name of ['Life', 'Armor', 'Damage'] as const) await calcButton(page, name).click();
    await expect(main(page).getByRole('combobox', { name: 'Weapon' })).toBeVisible();
    await expectNoAxeViolations(page);
    await noOverflow();
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a test build's points, banner, overspend pop-up, and skill controls (${theme})`, async ({
    page,
  }) => {
    const problems = await watch(page);
    await page.emulateMedia({ colorScheme: theme });
    await makeTestBuild(page, `Tiles ${theme}`);
    const points = main(page).getByRole('list', { name: 'Points', exact: true });
    // hand-derived: Toughness 1 is 5 XP of the 150 starting XP
    await expect(points).toContainText('XP 145 / 150 left');
    await expect(points).toContainText('MT');
    const banner = main(page).getByRole('region', { name: /Test build\./ });
    await expect(banner).toContainText(
      'Test build. Saved only in this browser. Back up in Settings to keep a copy.',
    );
    await expect(main(page).getByRole('heading', { name: 'Points budget' })).toHaveCount(0);

    // Remove 140 XP with the banner, with Undo in the toast.
    await expect(banner.getByRole('radio', { name: 'XP', exact: true })).toBeChecked();
    const amount = banner.getByRole('textbox', { name: 'Amount to add or remove' });
    await amount.fill('-140');
    await banner.getByRole('button', { name: 'Add or remove points' }).click();
    await expect(page.getByText('Removed 140 XP.')).toBeVisible();
    await expect(points).toContainText('XP 5 / 10 left');

    // Skills: round - and + under the part names; raising past what is left overspends.
    await page.goto(page.url().replace(/#\/c\/([^/]+).*$/, '#/c/$1/skills?tab=defensive'));
    const level = main(page).getByRole('group', { name: 'Toughness level' });
    await expect(level).toContainText('Level');
    const raise = level.getByRole('button', { name: 'Raise Toughness (10 XP)' });
    const box = await raise.boundingBox();
    expect(box?.width).toBe(40);
    expect(box?.height).toBe(40);
    const labelBox = await level.getByText('Level', { exact: true }).boundingBox();
    expect((labelBox?.y ?? 0) + (labelBox?.height ?? 0)).toBeLessThanOrEqual(box?.y ?? 0);
    await raise.click();
    // hand-derived: 5 left - 10 for level 2 is 5 over; 1 event at 60 XP
    const xpTile = points.getByRole('listitem').filter({ hasText: /^XP/ });
    await expect(xpTile).toContainText('XP (overspent) -5 / 10 left');
    await expect(xpTile.locator('svg')).toBeVisible();
    await expect(
      page.getByText(
        'You have spent 5 more XP than you have. Earning it takes 1 event (60 XP an event).',
      ),
    ).toBeVisible();
    await expect(main(page)).toContainText(
      'Over: about 1 more event would earn this build (60 XP an event).',
    );
    // Undo takes the level back.
    await page
      .getByRole('status')
      .locator('div')
      .filter({ hasText: 'Learned Toughness level 2.' })
      .getByRole('button', { name: 'Undo' })
      .click();
    await expect(points).toContainText('XP 5 / 10 left');
    await expect(main(page)).not.toContainText('Over: about');
    // A blocked button says why when tapped.
    await main(page).getByRole('button', { name: 'Lower Evasion' }).click({ force: true });
    await expect(page.getByText('Evasion is not learned.')).toBeVisible();

    // No horizontal scroll at phone width, and no accessibility problems (toasts cleared).
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(main(page).getByRole('group', { name: 'Toughness level' })).toBeVisible();
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
    expect(await overflow()).toBe(false);
    await expectNoAxeViolations(page);
    await main(page).getByRole('button', { name: 'Raise Toughness (10 XP)' }).click();
    await page.goto(page.url().replace(/#\/c\/([^/]+).*$/, '#/c/$1'));
    await page.reload();
    await expect(points).toContainText('XP (overspent) -5 / 10 left');
    expect(await overflow()).toBe(false);
    await expectNoAxeViolations(page);

    // Delete test build, behind a confirm, goes back to Test Builds.
    await banner.getByRole('button', { name: 'Delete test build' }).click();
    await page
      .getByRole('dialog', { name: `Delete Tiles ${theme}?` })
      .getByRole('button', { name: 'Delete test build' })
      .click();
    await expect(page).toHaveURL(/#\/test-builds$/);
    await expect(main(page).getByText('No test builds yet.')).toBeVisible();
    expect(problems).toEqual([]);
  });
}
