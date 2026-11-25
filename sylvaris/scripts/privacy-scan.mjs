// Privacy scan, in two modes:
//   node scripts/privacy-scan.mjs              (`npm run privacy-scan`) this repo: every file git
//                                               would commit, checked for emails and listed names.
//   node scripts/privacy-scan.mjs <folder ...>  the public site (docs/PUBLIC-SITE-PLAN.md): every
//                                               text file under the folders, with all the checks.
// Fails (exit code 1) when a file holds
// - an email address outside the reserved test domains (example.com, example.org, example.net,
//   and names ending in .example, .test, .invalid, or .localhost),
// - a name from the local list in `.privacy-names.local` (git-ignored, one name per line, `#`
//   starts a comment; the owner fills it in). Set SY_PRIVACY_NAMES to use another file.
// Folder mode also fails on
// - a Tailscale machine name (*.ts.net), tailnet name (tail plus 6 hex digits), or address
//   (the 100.64/10 range),
// - a private word: the owner's machine and tailnet names, kept below only as SHA-256 hashes so
//   this file (which the public repo also holds) does not name them,
// - a home folder path (a drive letter and Users, /Users/..., /home/...) or this computer's user
//   name, and
// - a trace of the private server's data folder or its test accounts.
// Skips binary files (images, fonts) and package-lock.json (npm package authors); folder mode also
// skips node_modules, .git, and build and test output folders. Node built-ins (and git) only, so the
// same file runs in the private repo and in the public one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(self), '..');
const folders = process.argv.slice(2).map((folder) => path.resolve(folder));
const namesFile = process.env.SY_PRIVACY_NAMES
  ? path.resolve(process.env.SY_PRIVACY_NAMES)
  : path.join(root, '.privacy-names.local');

const SKIPPED_FILES = new Set(['package-lock.json']);
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
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

function allowedEmail(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (/^(?:.+\.)?example\.(?:com|org|net)$/.test(domain)) return true;
  const top = domain.slice(domain.lastIndexOf('.') + 1);
  return ['example', 'test', 'invalid', 'localhost'].includes(top);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeWords(text) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${text.split(/\s+/).map(escapeRegExp).join('\\s+')}(?![\\p{L}\\p{N}])`,
    'iu',
  );
}

function loadNames() {
  if (!existsSync(namesFile)) return [];
  return readFileSync(namesFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line !== '')
    .map((name) => ({ name, pattern: wholeWords(name) }));
}

let userName = '';
try {
  userName = userInfo().username;
} catch {
  // No user name available (some CI runners): the home folder check still runs.
}

/** Folder mode only. Each rule: what it finds, and a pattern for one line of text. */
const PUBLIC_RULES = [
  { what: 'Tailscale machine name', pattern: /[A-Za-z0-9-]+\.[A-Za-z0-9-]+\.ts\.net\b/i },
  { what: 'Tailscale tailnet name', pattern: /\btail[0-9a-f]{6}\b/i },
  {
    what: 'Tailscale address',
    pattern: /(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d.])/,
  },
  {
    what: 'home folder path',
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"`]+|\/(?:Users|home)\/[a-z]/i,
  },
  // Spelled so this file's own text does not match the public repo's other privacy scan.
  { what: 'private server data or test accounts', pattern: /server[-]data|test[A]ccounts/ },
  ...(userName.length >= 3
    ? [{ what: "this computer's user name", pattern: wholeWords(userName) }]
    : []),
];

/** SHA-256 of private words (lowercase), checked against every word in folder mode. */
const PRIVATE_WORD_HASHES = new Set([
  '2d2a029366a12ff5fbaaf8506fb4a398c6ebbfe19418f1837310769a0424176a',
  'afdff64e8879b29c83fa41015f3fac3373d20341871546ed722d7607a1aeeed5',
]);
const WORD = /[a-z0-9]+/g;
const hashes = new Map();

function sha256(word) {
  let hash = hashes.get(word);
  if (hash === undefined) {
    hash = createHash('sha256').update(word).digest('hex');
    hashes.set(word, hash);
  }
  return hash;
}

function privateWord(line) {
  for (const [word] of line.toLowerCase().matchAll(WORD))
    if (word.length >= 6 && word.length <= 32 && PRIVATE_WORD_HASHES.has(sha256(word))) return true;
  return false;
}

/** Repo mode: tracked files plus new files that are not git-ignored. */
function gitFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(out.split('\0').filter((file) => file !== ''))]
    .sort()
    .map((file) => path.join(root, file));
}

function* walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('dist')) yield* walk(full);
    } else if (entry.isFile()) yield full;
  }
}

const names = loadNames();
const rules = folders.length > 0 ? PUBLIC_RULES : [];
const problems = [];
let scanned = 0;

function scan(file) {
  if (SKIPPED_FILES.has(path.basename(file)) || file === self) return;
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    return; // Deleted in the working tree.
  }
  if (buffer.subarray(0, 8000).includes(0)) return; // Binary (images, fonts).
  scanned += 1;
  const shown = path.relative(process.cwd(), file);
  buffer
    .toString('utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const where = `${shown}:${index + 1}`;
      for (const match of line.matchAll(EMAIL))
        if (!allowedEmail(match[0])) problems.push(`${where}: email ${match[0]}`);
      for (const { what, pattern } of rules)
        if (pattern.test(line)) problems.push(`${where}: ${what}`);
      if (rules.length > 0 && privateWord(line)) problems.push(`${where}: private word`);
      for (const { name, pattern } of names)
        if (pattern.test(line)) problems.push(`${where}: listed name "${name}"`);
    });
}

if (folders.length === 0) {
  for (const file of gitFiles()) scan(file);
} else {
  for (const folder of folders) {
    if (!existsSync(folder)) problems.push(`${folder}: not found`);
    else if (statSync(folder).isDirectory()) for (const file of walk(folder)) scan(file);
    else scan(folder);
  }
}

const namesNote = existsSync(namesFile)
  ? `${names.length} listed name${names.length === 1 ? '' : 's'}`
  : `no name list (${path.basename(namesFile)} not found)`;
if (problems.length > 0) {
  console.error(`Privacy scan: ${problems.length} problem(s) in ${scanned} files (${namesNote}).`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Privacy scan: no problems in ${scanned} files (${namesNote}).`);
