// Privacy scan for the public site (docs/PUBLIC-SITE-PLAN.md, Phase 2):
//   node scripts/privacy-scan.mjs [folder ...]
// Fails (exit code 1) when a text file under a folder holds
// - an email address outside the reserved test domains (example.com, example.org, example.net,
//   and names ending in .example, .test, .invalid, or .localhost),
// - a Tailscale machine name (*.ts.net) or a Tailscale address (100.64.0.0 to 100.127.255.255),
// - a home folder path (C:\Users\..., /Users/..., /home/...) or this computer's user name,
// - a trace of the private server's test accounts or live data (testAccounts, server-data), or
// - a name from the local list in `.privacy-names.local` (never committed, one name per line,
//   `#` starts a comment). Set PR_PRIVACY_NAMES to use another file. Without the list the scan
//   still runs but warns that names were not checked.
// Skips node_modules, .git, build and test output folders, binary files, and package-lock.json.
// Node built-ins only, so the same file runs in the private repo and in the public one.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(self), '..');
const folders = process.argv.slice(2).map((folder) => path.resolve(folder));
if (folders.length === 0) folders.push(repoRoot);
const namesFile = process.env.PR_PRIVACY_NAMES
  ? path.resolve(process.env.PR_PRIVACY_NAMES)
  : path.join(repoRoot, '.privacy-names.local');

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '.tools',
  '.venv',
  'test-results',
  'playwright-report',
  'dev-dist',
  'coverage',
]);
const SKIPPED_FILES = new Set(['package-lock.json']);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeWords(text) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${text.split(/\s+/).map(escapeRegExp).join('\\s+')}(?![\\p{L}\\p{N}])`,
    'iu',
  );
}

let userName = '';
try {
  userName = userInfo().username;
} catch {
  // No user name available (some CI runners): the home folder check still runs.
}

/** Each rule: what it finds, and a pattern for one line of text. */
const RULES = [
  { what: 'Tailscale machine name', pattern: /[A-Za-z0-9-]+\.[A-Za-z0-9-]+\.ts\.net\b/i },
  {
    what: 'Tailscale address',
    pattern: /(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d.])/,
  },
  {
    what: 'home folder path',
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"`]+|\/(?:Users|home)\/[a-z]/i,
  },
  { what: 'private server test accounts or data', pattern: /testAccounts|server-data/ },
  ...(userName.length >= 3
    ? [{ what: "this computer's user name", pattern: wholeWords(userName) }]
    : []),
];

function allowedEmail(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (/^(?:.+\.)?example\.(?:com|org|net)$/.test(domain)) return true;
  const top = domain.slice(domain.lastIndexOf('.') + 1);
  return ['example', 'test', 'invalid', 'localhost'].includes(top);
}

function loadNames() {
  if (!existsSync(namesFile)) return [];
  return readFileSync(namesFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line !== '')
    .map((name) => ({ name, pattern: wholeWords(name) }));
}

function* walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('dist')) yield* walk(full);
    } else if (entry.isFile() && !SKIPPED_FILES.has(entry.name) && full !== self) yield full;
  }
}

const names = loadNames();
const problems = [];
let scanned = 0;
for (const folder of folders) {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    problems.push(`${folder}: not a folder`);
    continue;
  }
  for (const file of walk(folder)) {
    const buffer = readFileSync(file);
    if (buffer.subarray(0, 8000).includes(0)) continue; // Binary (images, fonts).
    scanned += 1;
    const shown = path.relative(process.cwd(), file);
    buffer
      .toString('utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        const where = `${shown}:${index + 1}`;
        for (const match of line.matchAll(EMAIL))
          if (!allowedEmail(match[0])) problems.push(`${where}: email ${match[0]}`);
        for (const { what, pattern } of RULES)
          if (pattern.test(line)) problems.push(`${where}: ${what}`);
        for (const { name, pattern } of names)
          if (pattern.test(line)) problems.push(`${where}: listed name "${name}"`);
      });
  }
}

const namesNote = existsSync(namesFile)
  ? `${names.length} listed name${names.length === 1 ? '' : 's'}`
  : 'no name list';
if (problems.length > 0) {
  console.error(`Privacy scan: ${problems.length} problem(s) in ${scanned} files (${namesNote}).`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Privacy scan: no problems in ${scanned} files (${namesNote}).`);
if (!existsSync(namesFile))
  console.warn(
    [
      `WARNING: real player names were NOT checked: ${path.basename(namesFile)} does not exist.`,
      '  To check names, create it next to package.json (never commit it): one name per line,',
      '  # starts a comment, matching ignores case. PR_PRIVACY_NAMES=<file> uses another file.',
    ].join('\n'),
  );
