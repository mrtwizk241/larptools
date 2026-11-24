// The level controls on a skill row: a round - and + around the level of each part (the skill,
// Adept, Advanced, and Mastery once the skill reaches the level it needs).
// - Test builds: + and - change the level at once, with no teacher or reason to type. Only a
//   multi-archetype skill bought for the first time asks which archetype.
// - Staff on a real character: + and - open the Learn and Refund dialogs (teacher, reason).
// - Players on a real character: the level, and a + that sends a learning request.
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { maxLevelOf, preview } from '../../../../engine/index.ts';
import type { SkillPart } from '../../../../engine/model.ts';
import { IconButton, useToast } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import type { CharacterView } from '../view.ts';
import { controlParts, isTestView, TEST_BUILD_REFUND_REASON } from './controlParts.ts';
import { RequestSkillDialog } from './RequestSkillDialog.tsx';
import { canRequest, requestableParts } from './requestParts.ts';
import { LearnDialog, RefundDialog } from './SkillDialogs.tsx';
import {
  costText,
  needsArchetypeChoice,
  ownedPart,
  partLabel,
  partTitle,
  previewLearn,
  type Skill,
} from './skillInfo.ts';
import styles from './skills.module.css';

type DialogState = { kind: 'learn' | 'refund' | 'request'; part: SkillPart } | null;

export function SkillControls({ view, skill }: { view: CharacterView; skill: Skill }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const command = useCommand(view.id);
  const toast = useToast();
  const { ruleset, sheet } = view;
  const owned = sheet.skills.find((s) => s.skillId === skill.id);
  const testBuild = isTestView(view);
  const requestable = canRequest(view) ? requestableParts(view, skill) : [];
  const parts = controlParts(view, skill);

  async function raise(part: SkillPart) {
    if (!testBuild || needsArchetypeChoice(sheet, skill)) {
      setDialog({ kind: 'learn', part });
      return;
    }
    const outcome = await command.run({ type: 'learnSkill', skillId: skill.id, part });
    if (!outcome.ok) toast.show(outcome.errors.map((e) => e.message).join(' '));
  }

  async function lower(part: SkillPart) {
    if (!testBuild) {
      setDialog({ kind: 'refund', part });
      return;
    }
    const outcome = await command.run({
      type: 'refundSkill',
      skillId: skill.id,
      part,
      reason: TEST_BUILD_REFUND_REASON,
    });
    if (!outcome.ok) toast.show(outcome.errors.map((e) => e.message).join(' '));
  }

  return (
    <>
      <div className={styles.controls}>
        {parts.map((part) => {
          const def = skill.parts[part];
          if (!def) return null;
          const level = ownedPart(owned, part)?.level ?? 0;
          const label = partLabel(ruleset, skill, part);
          const title = part === 'main' ? null : partTitle(skill, part);
          const max = maxLevelOf(ruleset, def.costKind) ?? Number.POSITIVE_INFINITY;
          const single = max === 1;
          const shown = single ? (level > 0 ? 'Yes' : 'No') : String(level);

          if (!view.isStaff) {
            const canAsk = requestable.some((r) => r.part === part);
            return (
              <div key={part} className={styles.control} role="group" aria-label={label}>
                {title ? <span className={styles.controlLabel}>{title}</span> : null}
                <span className={styles.controlValue}>
                  <span className="visually-hidden">Level </span>
                  {shown}
                </span>
                {canAsk ? (
                  <IconButton
                    variant="ghost"
                    className={styles.circle}
                    aria-label={`I learned ${label}`}
                    icon={<Plus />}
                    onClick={() => setDialog({ kind: 'request', part })}
                  />
                ) : null}
              </div>
            );
          }

          const learn = previewLearn(ruleset, sheet, skill, part);
          const refund =
            level > 0
              ? preview(ruleset, sheet, { type: 'refundSkill', skillId: skill.id, part })
              : null;
          const atMax = level >= max;
          const raiseBlock = atMax
            ? `${label} is at its highest level.`
            : learn.allowed
              ? null
              : learn.reasons.join(' ');
          const lowerBlock =
            level === 0
              ? `${label} is not learned.`
              : refund && !refund.allowed
                ? refund.reasons.join(' ')
                : null;
          const busy = command.running;
          return (
            <div key={part} className={styles.control} role="group" aria-label={label}>
              {title ? <span className={styles.controlLabel}>{title}</span> : null}
              <IconButton
                variant="ghost"
                className={styles.circle}
                aria-label={`Lower ${label}`}
                aria-disabled={lowerBlock || busy ? true : undefined}
                {...(lowerBlock ? { title: lowerBlock } : {})}
                icon={<Minus />}
                onClick={() => {
                  if (busy) return;
                  if (lowerBlock) {
                    if (level > 0) toast.show(lowerBlock);
                    return;
                  }
                  void lower(part);
                }}
              />
              <output className={styles.controlValue} aria-live="polite">
                {shown}
              </output>
              <IconButton
                variant="ghost"
                className={styles.circle}
                aria-label={
                  learn.cost && !atMax
                    ? `Raise ${label} (${costText(ruleset, learn.cost)})`
                    : `Raise ${label}`
                }
                aria-disabled={raiseBlock || busy ? true : undefined}
                {...(raiseBlock ? { title: raiseBlock } : {})}
                icon={<Plus />}
                onClick={() => {
                  if (busy) return;
                  if (raiseBlock) {
                    toast.show(raiseBlock);
                    return;
                  }
                  void raise(part);
                }}
              />
            </div>
          );
        })}
      </div>
      {dialog?.kind === 'learn' ? (
        <LearnDialog view={view} skill={skill} part={dialog.part} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'refund' ? (
        <RefundDialog
          view={view}
          skill={skill}
          part={dialog.part}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'request' ? (
        <RequestSkillDialog
          view={view}
          skill={skill}
          part={dialog.part}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
