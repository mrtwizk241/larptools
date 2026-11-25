// Storage keys of the create wizard's draft, kept apart from the wizard code so sign-out can clear
// the drafts without loading the wizard (audit S-13).

const PREFIX = 'sy.createDraft.';

/** One draft per account on this device. */
export function draftKey(accountId: string | null | undefined): string {
  return `${PREFIX}${accountId ?? 'local'}`;
}

/** Removes every account's wizard draft from this device (sign-out, audit S-13). */
export function clearAllWizards(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was kept.
  }
}
