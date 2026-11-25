// Check-in awards from awards.json ([PTS-MT-EARN], [PTS-XP-EVENT], [PTS-CXP-EVENT], [PTS-AXP-EVENT])
// and the XP and CXP earned caps ([PTS-XP-MAX], [PTS-CXP-MAX]).
// - NPC time: XP and CXP per hour up to maxHours; MT per hour past that, capped. Full-event NPC
//   bundles get NPC time at its maximum. Check-in assistance counts as NPC hours.
// - Q-PTS-2: any attended event earns the full awards; staff adjust with a reason.
// - Q-PTS-9: full-event NPCs and staff get the bundles as printed (no extra event CXP).
import type { SyAttendanceBundle, SyRuleset } from '../../data/index.ts';
import type { Award, LedgerCurrency } from '../sheet.ts';

/** NPC time rewards for `hours`, or at the maximum. */
export function npcTimeRewards(
  ruleset: SyRuleset,
  hours: number,
  atMaximum = false,
): { xp: number; cxp: number; mt: number } {
  const t = ruleset.awards.npcTime;
  if (atMaximum)
    return { xp: t.maxHours * t.xpPerHour, cxp: t.maxHours * t.cxpPerHour, mt: t.mtCap };
  const capped = Math.min(Math.max(0, hours), t.maxHours);
  return {
    xp: capped * t.xpPerHour,
    cxp: capped * t.cxpPerHour,
    mt: Math.min(t.mtCap, Math.max(0, hours - t.maxHours) * t.mtPerHourAfterMax),
  };
}

/** Hours of NPC time the extras count as (check-in assistance). */
export function extrasNpcHours(ruleset: SyRuleset, extras: readonly string[]): number {
  let hours = 0;
  for (const id of extras) hours += ruleset.extrasById[id]?.npcHours ?? 0;
  return hours;
}

/** Every award a check-in would credit before caps, in ledger order. */
export function attendanceAwards(
  ruleset: SyRuleset,
  bundle: SyAttendanceBundle,
  npcHours: number,
  extras: readonly string[],
): Award[] {
  const out: Award[] = [];
  for (const g of bundle.grants) out.push({ currency: g.currency, amount: g.amount, kind: g.kind });
  const hours = npcHours + extrasNpcHours(ruleset, extras);
  const atMax = bundle.npcTimeMax === true;
  if (atMax || hours > 0) {
    const npc = npcTimeRewards(ruleset, hours, atMax);
    const kind = ruleset.awards.npcTime.ledgerKind;
    out.push({ currency: 'xp', amount: npc.xp, kind });
    out.push({ currency: 'cxp', amount: npc.cxp, kind });
    out.push({ currency: 'mt', amount: npc.mt, kind });
  }
  for (const id of extras)
    for (const g of ruleset.extrasById[id]?.grants ?? [])
      out.push({ currency: g.currency, amount: g.amount, kind: g.kind });
  return out.filter((a) => a.amount > 0);
}

/** Room left under the XP and CXP earned caps. */
export interface CapRoom {
  xp: number;
  cxp: number;
}

/**
 * Applies the earned caps in order. XP and CXP above the cap are returned as not credited
 * ([PTS-XP-MAX], Q-PTS-8); AXP and MT have no cap.
 */
export function applyCaps(
  awards: readonly Award[],
  room: CapRoom,
): { credited: Award[]; notCredited: Award[] } {
  const left: Record<LedgerCurrency, number> = {
    xp: Math.max(0, room.xp),
    cxp: Math.max(0, room.cxp),
    axp: Infinity,
    mt: Infinity,
  };
  const credited: Award[] = [];
  const notCredited: Award[] = [];
  for (const a of awards) {
    const amount = Math.min(a.amount, left[a.currency]);
    left[a.currency] -= amount;
    if (amount > 0) credited.push({ ...a, amount });
    if (amount < a.amount) notCredited.push({ ...a, amount: a.amount - amount });
  }
  return { credited, notCredited };
}

/** Silver a check-in hands over: the bundle's silver, or the paid NPC's silver choice. */
export function attendanceSilver(
  bundle: SyAttendanceBundle,
  paidChoice: 'skills' | 'silver' | undefined,
  xpEarned: number,
): number {
  let silver = bundle.silver ?? 0;
  if (bundle.paidChoice && paidChoice === 'silver')
    silver += Math.floor(xpEarned / bundle.paidChoice.silverPerXp);
  return silver;
}
