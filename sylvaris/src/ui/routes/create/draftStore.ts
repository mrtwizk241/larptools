// The wizard's draft on this device, so a reload does not lose it. A per-device convenience:
// storage can be missing or blocked, so every read and write is wrapped in try/catch.
import { asDraft, type WizardDraft } from './steps.ts';

export interface SavedWizard {
  draft: WizardDraft;
  step: number;
  /** The character id a player sends (kept so a resend replaces the same submission). */
  characterId: string | null;
}

export { clearAllWizards, draftKey } from './draftKeys.ts';

export function loadWizard(key: string): SavedWizard | null {
  try {
    const text = localStorage.getItem(key);
    if (!text) return null;
    const raw = JSON.parse(text) as Record<string, unknown>;
    return {
      draft: asDraft(raw.draft),
      step: typeof raw.step === 'number' && raw.step >= 0 ? Math.floor(raw.step) : 0,
      characterId: typeof raw.characterId === 'string' ? raw.characterId : null,
    };
  } catch {
    return null;
  }
}

export function saveWizard(key: string, saved: SavedWizard): void {
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the wizard still works, only the reload safety net is lost.
  }
}

export function clearWizard(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
