import type { FileKind } from './files.ts';

export const FILE_EXTENSIONS: Record<FileKind, string> = {
  character: '.sychar.json',
  requests: '.syreq.json',
  backup: '.sybackup.json',
};

const FALLBACK_NAMES: Record<FileKind, string> = {
  character: 'character',
  requests: 'requests',
  backup: 'sylvaris-backup',
};

// Names Windows refuses as file names, with or without an extension.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * Safe download name such as `Mara-Vex.sychar.json`: accents folded to ASCII, every run of other
 * characters (spaces, dots, slashes, colons, emoji) becomes one `-`, at most 60 characters.
 */
export function fileNameFor(kind: FileKind, name: string): string {
  let base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  if (base === '') base = FALLBACK_NAMES[kind];
  if (RESERVED.test(base)) base = `${base}-file`;
  return `${base}${FILE_EXTENSIONS[kind]}`;
}
