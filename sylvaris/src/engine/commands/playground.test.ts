// The build playground (PlanContext.playground): the no-login builder skips the rules about
// events and teachers, and keeps every cost, prerequisite, and balance rule.
import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../data/index.ts';
import { preview } from './plan.ts';
import { grant, learn, withCharacter } from '../testkit.ts';

const rs = loadRuleset();

function playground() {
  const h = withCharacter();
  h.playground(true);
  return h;
}

describe('build playground', () => {
  it('learns a Basic with no teacher and no "unverified" notice', () => {
    const h = playground();
    const result = h.plan({ type: 'learnSkill', skillId: 'toughness', step: { level: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notices.map((n) => n.code)).not.toContain('TEACHER_MISSING');

    const normal = withCharacter();
    const strict = normal.plan({ type: 'learnSkill', skillId: 'toughness', step: { level: 1 } });
    if (strict.ok) expect(strict.notices.map((n) => n.code)).toContain('TEACHER_MISSING');
  });

  it('starts a Calling with no events, recording the CXP even past the budget', () => {
    const h = playground();
    h.run({ type: 'startCalling', callingId: 'protector' });
    expect(h.sheet().calling?.callingId).toBe('protector');
    // hand-derived: 10 CXP for level 1 in both Calling skills, with no CXP budget: 10 over
    expect(h.sheet().points.cxp).toMatchObject({ spent: 10, available: -10 });

    const normal = withCharacter();
    grant(normal, 'cxp', 10);
    expect(normal.fail({ type: 'startCalling', callingId: 'protector' })).toEqual([
      'EVENT_REQUIRED',
    ]);
  });

  it('learns Calling Techniques with no event, keeping the two skills in balance', () => {
    const h = playground();
    // hand-derived: start 10 + Protection levels 2 to 6 (10 + 15 + 20 + 25 + 30) + Expert 5
    // + Master 10 = 125, so the Master Technique is refused for balance, not for CXP
    grant(h, 'cxp', 125);
    h.run({ type: 'startCalling', callingId: 'protector' });
    learn(h, 'protector-protection', 3);
    h.run({ type: 'learnSkill', skillId: 'protector-protection', step: { technique: 'expert' } });
    expect(h.sheet().skills.find((s) => s.skillId === 'protector-protection')?.techniques).toEqual([
      'expert',
    ]);
    // A second Technique on the same skill would leave Guardianship two behind.
    learn(h, 'protector-protection', 6);
    expect(
      h.fail({
        type: 'learnSkill',
        skillId: 'protector-protection',
        step: { technique: 'master' },
      }),
    ).toEqual(['CALLING_TECHNIQUE_BALANCE']);
  });

  it('takes Artifact powers off any number of times, with no GM or event notices', () => {
    const h = playground();
    grant(h, 'xp', 500);
    grant(h, 'axp', 20);
    h.run({ type: 'awakenArtifact', name: 'Test relic' });
    const set = h.plan({ type: 'setArtifactPower', powerId: 'art-life-20' });
    expect(set.ok).toBe(true);
    if (set.ok) expect(set.notices).toEqual([]);
    h.run({ type: 'setArtifactPower', powerId: 'art-life-20' });
    const first = h.sheet().artifact?.powers[0]?.entryId ?? '';
    h.run({ type: 'removeArtifactPowers', entryIds: [first], reason: 'trying builds' });
    h.run({ type: 'setArtifactPower', powerId: 'art-life-20' });
    const second = h.sheet().artifact?.powers[0]?.entryId ?? '';
    h.run({ type: 'removeArtifactPowers', entryIds: [second], reason: 'trying builds' });
    expect(h.sheet().artifact?.powers).toEqual([]);
  });

  it('spends XP and AXP past the budget; costs and prerequisites still apply', () => {
    const h = playground();
    const xp = h.sheet().points.xp.available;
    learn(h, 'toughness', 10);
    // hand-derived: levels 1 to 10 cost 5 x (1 + ... + 10) = 275 XP
    expect(h.sheet().points.xp.available).toBe(xp - 275);
    expect(
      h.fail({ type: 'learnSkill', skillId: 'defensive-stance', step: { level: 1 } }),
    ).toContain('PREREQ_NOT_MET');
    h.run({ type: 'awakenArtifact', name: 'Test relic' });
    expect(h.sheet().artifact?.name).toBe('Test relic');
  });

  it('preview checks the same way when asked', () => {
    const h = withCharacter();
    grant(h, 'cxp', 10);
    const cmd = { type: 'startCalling', callingId: 'protector' } as const;
    // Without the event, an ordinary preview still allows it (the event is "not filled in yet").
    expect(preview(rs, h.sheet(), cmd).allowed).toBe(true);
    expect(preview(rs, h.sheet(), cmd, { playground: true }).allowed).toBe(true);
    const learnCmd = { type: 'learnSkill', skillId: 'toughness', step: { level: 1 } } as const;
    expect(preview(rs, h.sheet(), learnCmd).teacherRequired).toBe(true);
    expect(preview(rs, h.sheet(), learnCmd, { playground: true }).teacherRequired).toBe(false);
  });
});
