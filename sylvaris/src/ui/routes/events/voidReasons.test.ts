import { describe, expect, it } from 'vitest';
import { loadRuleset, preview } from '../../../engine/index.ts';
import { attend, learn, withCharacter } from '../../../engine/testkit.ts';
import { voidBlockReasons } from './voidReasons.ts';

const ruleset = loadRuleset();

// Brief item 7: a blocked void names what depends on the check-in and when.
describe('voidBlockReasons', () => {
  it('names the entries that spent the points from the check-in', () => {
    const h = withCharacter();
    learn(h, 'toughness', 5); // 75 XP of the starting 150
    const [key] = attend(h, 1);
    learn(h, 'weapon-proficiency', 6); // 105 XP: uses the event's 60 XP
    const sheet = h.sheet();
    const checkIn = sheet.events.find((e) => e.key === key);
    expect(checkIn).toBeTruthy();
    const check = preview(ruleset, sheet, {
      type: 'voidCheckIn',
      checkInActionId: checkIn?.actionId ?? '',
      reason: 'Wrong event',
    });
    expect(check.allowed).toBe(false);
    const reasons = voidBlockReasons(
      ruleset,
      h.actions,
      sheet,
      checkIn?.actionId ?? '',
      check.errors,
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/^Cannot void the check-in to Game 1 \(/);
    expect(reasons[0]).toContain('it takes back 60 XP, but only 30 XP is unspent');
    expect(reasons[0]).toMatch(/Spent since: .*Weapon Proficiency.*\(30 XP, /);
    // Spends from before the check-in are not blamed.
    expect(reasons[0]).not.toContain('Toughness');
  });

  it('keeps the engine messages for other dependents', () => {
    const errors = [{ code: 'CHECK_IN_IN_USE', message: 'Cannot void: X was started at Y.' }];
    const h = withCharacter();
    expect(voidBlockReasons(ruleset, h.actions, h.sheet(), 'none', errors)).toEqual([
      'Cannot void: X was started at Y.',
    ]);
  });
});
