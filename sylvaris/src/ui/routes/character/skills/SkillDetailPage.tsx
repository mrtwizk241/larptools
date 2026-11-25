// `#/c/:id/skills/:skillId`: one skill. Level and uses, a card per named ability with whether
// it is unlocked, passives, requirement, prerequisites, the Calling Technique rules, and the
// Log of Learning. Staff learn and refund here; players send a request.
import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CircleAlert, CircleCheck, Lock, Plus, Undo2 } from 'lucide-react';
import { type CallingSection, type SheetSkill } from '../../../../engine/index.ts';
import { previewCommand } from '../../../data/engineHooks.ts';
import type { SkillStep } from '../../../../engine/model.ts';
import { Button, Card, LevelStepper } from '../../../components/index.ts';
import { costText, dateText } from '../../../lib/names.ts';
import type { CharacterScreenProps } from '../screen.tsx';
import type { CharacterView } from '../view.ts';
import { RequestSkillDialog } from './RequestSkillDialog.tsx';
import { LOCAL_MODE } from '../../../../localMode.ts';
import { SkillControls } from './SkillControls.tsx';
import { LearnDialog, RefundDialog } from './SkillDialogs.tsx';
import {
  abilityCards,
  abilityCostText,
  categoryLabel,
  eventName,
  isLockedSkill,
  kindText,
  namedLabel,
  ownedSkill,
  passiveLines,
  passiveOwned,
  prereqGroups,
  requestable,
  skillName,
  type Skill,
} from './skillInfo.ts';
import characterStyles from '../character.module.css';
import styles from './skills.module.css';

type DialogState = { kind: 'learn' | 'refund'; step: SkillStep } | null;

export function SkillDetailPage({ view }: CharacterScreenProps) {
  const { skillId = '' } = useParams();
  const [search] = useSearchParams();
  const skill = view.ruleset.skillsById[skillId];
  const [dialog, setDialog] = useState<DialogState>(null);
  const [requesting, setRequesting] = useState(false);
  const owned = search.get('owned');

  if (!skill) {
    return (
      <section aria-labelledby="skill-heading" className={styles.detail}>
        <BackToSkills view={view} owned={owned} />
        <h2 id="skill-heading">Skill not found</h2>
        <Card>
          <p>There is no skill with this link.</p>
        </Card>
      </section>
    );
  }

  const mine = ownedSkill(view.sheet, skill.id);
  const locked = isLockedSkill(view.sheet, skill);
  const onLearn = (step: SkillStep) => setDialog({ kind: 'learn', step });
  const onRefund = (step: SkillStep) => setDialog({ kind: 'refund', step });
  return (
    <section aria-labelledby="skill-heading" className={styles.detail}>
      <BackToSkills view={view} category={skill.category} owned={owned} />
      <h2 id="skill-heading" className={styles.title}>
        {skillName(view.ruleset, view.sheet, skill.id)}
      </h2>
      <p className={styles.metaLine}>
        <span className={styles.tag}>{categoryLabel(skill.category)}</span>
        {skill.advanced ? <span className={styles.tag}>Advanced</span> : null}
        {skill.defenseType ? (
          <span className={styles.tag}>
            {skill.defenseType === 'avoidance' ? 'Avoidance' : 'Resistance'}
          </span>
        ) : null}
        {locked ? (
          <span className={styles.tag}>
            <Lock aria-hidden="true" className={styles.tagIcon} />
            Locked
          </span>
        ) : null}
      </p>
      <LevelCard
        view={view}
        skill={skill}
        mine={mine}
        onLearn={onLearn}
        onRefund={onRefund}
        onRequest={() => setRequesting(true)}
      />
      {skill.requirement ? (
        <Card title="Requirement" headingLevel={3}>
          <p className={characterStyles.text}>{skill.requirement}</p>
        </Card>
      ) : null}
      {skill.advanced ? <PrereqCard view={view} skill={skill} /> : null}
      {skill.category === 'calling' ? <CallingCard view={view} skill={skill} /> : null}
      <AbilitiesSection view={view} skill={skill} />
      <PassivesCard skill={skill} mine={mine} />
      {LOCAL_MODE ? null : <LearningCard view={view} mine={mine} />}
      {dialog?.kind === 'learn' ? (
        <LearnDialog view={view} skill={skill} step={dialog.step} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'refund' ? (
        <RefundDialog
          view={view}
          skill={skill}
          step={dialog.step}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {requesting ? (
        <RequestSkillDialog view={view} skill={skill} onClose={() => setRequesting(false)} />
      ) : null}
    </section>
  );
}

function BackToSkills({
  view,
  category,
  owned,
}: {
  view: CharacterView;
  category?: string;
  owned: string | null;
}) {
  const params = new URLSearchParams();
  if (category) params.set('tab', category);
  if (owned === '1' || owned === '0') params.set('owned', owned);
  const query = params.toString();
  return (
    <Link to={`/c/${view.id}/skills${query ? `?${query}` : ''}`} className={styles.back}>
      <ArrowLeft aria-hidden="true" className={styles.backIcon} />
      All skills
    </Link>
  );
}

function LevelCard({
  view,
  skill,
  mine,
  onLearn,
  onRefund,
  onRequest,
}: {
  view: CharacterView;
  skill: Skill;
  mine: SheetSkill | undefined;
  onLearn: (step: SkillStep) => void;
  onRefund: (step: SkillStep) => void;
  onRequest: () => void;
}) {
  const { ruleset, sheet } = view;
  const level = mine?.level ?? 0;
  const max = ruleset.ruleset.skills.maxLevel;
  const techniques = mine?.techniques ?? [];
  const currency = skill.category === 'calling' ? 'CXP' : 'XP';
  return (
    <Card title="Level and uses" headingLevel={3}>
      <div className={styles.block}>
        <dl className={characterStyles.facts}>
          <div>
            <dt>Level</dt>
            <dd>
              <span className="num">{level}</span> of {max}
            </dd>
          </div>
          <div>
            <dt>Uses per re-pop</dt>
            <dd>
              <span className="num">{mine?.maxUses ?? 0}</span> (one per level)
            </dd>
          </div>
          <div>
            <dt>Techniques</dt>
            <dd>{techniques.length > 0 ? techniques.map(namedLabel).join(', ') : 'None'}</dd>
          </div>
          {mine && mine.spent > 0 ? (
            <div>
              <dt>Paid</dt>
              <dd>{`${mine.spent} ${currency}`}</dd>
            </div>
          ) : null}
        </dl>
        {skill.category === 'calling' ? (
          <p className={styles.hint}>
            Calling skills spend CXP, and their uses come back only at re-pop.
          </p>
        ) : null}
        {/* The no-login builds: the same round controls as the skill rows, one tap with Undo. */}
        {LOCAL_MODE ? (
          <SkillControls view={view} skill={skill} />
        ) : view.isStaff ? (
          <StaffControls
            view={view}
            skill={skill}
            mine={mine}
            onLearn={onLearn}
            onRefund={onRefund}
          />
        ) : null}
        {requestable(view, skill) ? (
          <div className={styles.actions}>
            <Button
              variant="primary"
              icon={<Plus />}
              aria-label={`Request ${skillName(view.ruleset, view.sheet, skill.id)}`}
              onClick={onRequest}
            >
              Request
            </Button>
          </div>
        ) : null}
        {sheet.retired && !view.isStaff ? (
          <p className={styles.hint}>This character is retired.</p>
        ) : null}
      </div>
    </Card>
  );
}

function StaffControls({
  view,
  skill,
  mine,
  onLearn,
  onRefund,
}: {
  view: CharacterView;
  skill: Skill;
  mine: SheetSkill | undefined;
  onLearn: (step: SkillStep) => void;
  onRefund: (step: SkillStep) => void;
}) {
  const { ruleset, sheet } = view;
  const level = mine?.level ?? 0;
  const max = ruleset.ruleset.skills.maxLevel;
  const levelPreview =
    level < max
      ? previewCommand(ruleset, sheet, {
          type: 'learnSkill',
          skillId: skill.id,
          step: { level: level + 1 },
        })
      : null;
  const next = level > 0 ? (mine?.nextTechnique ?? null) : null;
  const techniqueStep: SkillStep | null = next ? { technique: next.technique } : null;
  const techPreview = techniqueStep
    ? previewCommand(ruleset, sheet, { type: 'learnSkill', skillId: skill.id, step: techniqueStep })
    : null;
  const refundTechnique = mine?.refundable.find((s) => 'technique' in s);
  return (
    <div className={styles.block}>
      <LevelStepper
        label={skillName(view.ruleset, view.sheet, skill.id)}
        value={level}
        min={0}
        max={max}
        onChange={(n) => (n > level ? onLearn({ level: n }) : onRefund({ level }))}
        {...(levelPreview?.cost
          ? { nextCostLabel: `Next level: ${costText(ruleset, levelPreview.cost)}` }
          : {})}
        {...(levelPreview && !levelPreview.allowed
          ? { blockedReason: levelPreview.reasons.join(' ') }
          : {})}
      />
      <div className={styles.actions}>
        {techPreview && techniqueStep && next ? (
          <Button
            icon={<Plus />}
            disabled={!techPreview.allowed}
            disabledReason={techPreview.reasons.join(' ')}
            onClick={() => onLearn(techniqueStep)}
          >
            {`Add ${namedLabel(next.technique)} Technique${
              techPreview.cost ? `: ${costText(ruleset, techPreview.cost)}` : ''
            }`}
          </Button>
        ) : null}
        {refundTechnique && 'technique' in refundTechnique ? (
          <Button variant="ghost" icon={<Undo2 />} onClick={() => onRefund(refundTechnique)}>
            {`Refund ${namedLabel(refundTechnique.technique)} Technique`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StateLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <p className={`${styles.state} ${ok ? styles.ok : styles.missing}`}>
      <Icon aria-hidden="true" className={styles.stateIcon} />
      <span className={styles.stateText}>{children}</span>
    </p>
  );
}

function PrereqCard({ view, skill }: { view: CharacterView; skill: Skill }) {
  const groups = prereqGroups(view.ruleset, view.sheet, skill);
  const allMet = groups.every((g) => g.met);
  return (
    <Card title="Prerequisites" headingLevel={3}>
      <div className={styles.block}>
        <StateLine ok={allMet}>
          {allMet ? 'All prerequisites met.' : 'Cannot be learned yet: prerequisites missing.'}
        </StateLine>
        <ul className={styles.plainList}>
          {groups.map((group, i) => (
            <li key={i}>
              <p className={characterStyles.lead}>{group.lead}</p>
              <ul className={styles.plainList}>
                {group.items.map((item) => (
                  <li key={`${item.skillId}-${item.technique}`}>
                    <StateLine ok={item.met}>
                      {`${item.name}, ${namedLabel(item.technique)} Technique: ${
                        item.met ? 'met' : 'missing'
                      }`}
                    </StateLine>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {skill.prereqsPrinted ? (
          <p className={styles.hint}>As printed: {skill.prereqsPrinted}</p>
        ) : null}
      </div>
    </Card>
  );
}

function callingOf(view: CharacterView, skill: Skill): CallingSection | null {
  if (!('callingId' in skill)) return null;
  const { sheet } = view;
  if (sheet.calling?.callingId === skill.callingId) return sheet.calling;
  return sheet.formerCallings.find((c) => c.callingId === skill.callingId) ?? null;
}

const TIER_TEXT = ['Basic only', 'Expert Technique', 'Master Technique', 'Grandmaster Technique'];

function tierText(tier: number): string {
  return TIER_TEXT[tier] ?? `Tier ${tier}`;
}

function CallingCard({ view, skill }: { view: CharacterView; skill: Skill }) {
  const { ruleset, sheet } = view;
  const calling = callingOf(view, skill);
  const rules = ruleset.ruleset.calling;
  const name =
    'callingId' in skill ? (ruleset.callingsById[skill.callingId]?.name ?? skill.callingId) : '';
  return (
    <Card title="Calling Technique rules" headingLevel={3}>
      <div className={styles.block}>
        {!calling ? (
          <p>{`A ${name} skill. Start ${name} to learn it.`}</p>
        ) : calling.status === 'left' ? (
          <StateLine ok={false}>
            {`${name} was left${calling.leftAt ? ` on ${dateText(calling.leftAt)}` : ''}. Its skills stay on the sheet, locked.`}
          </StateLine>
        ) : (
          <>
            <ul className={characterStyles.warningList}>
              {LOCAL_MODE ? null : (
                <li>{`At most ${rules.techniquesPerEvent} Calling Technique per event.`}</li>
              )}
              {rules.noTechniqueAtStartEvent && !LOCAL_MODE ? (
                <li>
                  {`None at the event the Calling started${
                    calling.startedEventKey ? ` (${eventName(sheet, calling.startedEventKey)})` : ''
                  }.`}
                </li>
              ) : null}
              <li>{`The two Calling skills stay within ${rules.maxTechniqueGap} Technique of each other.`}</li>
            </ul>
            <dl className={characterStyles.facts}>
              {Object.entries(calling.balance.tiers).map(([id, tier]) => (
                <div key={id}>
                  <dt>{skillName(ruleset, sheet, id)}</dt>
                  <dd>{tierText(tier)}</dd>
                </div>
              ))}
              <div>
                <dt>CXP available</dt>
                <dd className="num">{sheet.points.cxp.available}</dd>
              </div>
            </dl>
            <StateLine ok={calling.balance.ok}>
              {calling.balance.ok ? 'Balance kept.' : 'Out of balance.'}
            </StateLine>
            {calling.techniqueEvents.length > 0 && !LOCAL_MODE ? (
              <ul className={styles.plainList} aria-label="Calling Techniques by event">
                {calling.techniqueEvents.map((t) => (
                  <li key={`${t.skillId}-${t.technique}`}>
                    {`${skillName(ruleset, sheet, t.skillId)} ${namedLabel(t.technique)} Technique: ${
                      t.eventKey ? eventName(sheet, t.eventKey) : 'no event recorded'
                    }`}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function AbilitiesSection({ view, skill }: { view: CharacterView; skill: Skill }) {
  const cards = abilityCards(view.ruleset, view.sheet, skill);
  return (
    <>
      {cards.map((a) => (
        <Card key={a.named} title={`${namedLabel(a.named)} (level ${a.level})`} headingLevel={3}>
          <div className={styles.block}>
            <StateLine ok={a.unlocked}>
              {a.unlocked ? 'Unlocked' : `Locked. ${a.lockedReason ?? ''}`}
            </StateLine>
            <dl className={characterStyles.facts}>
              <div>
                <dt>Cost</dt>
                <dd>{abilityCostText(a)}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{kindText(a.kind)}</dd>
              </div>
            </dl>
            <p className={characterStyles.text}>{a.summary}</p>
          </div>
        </Card>
      ))}
    </>
  );
}

function PassivesCard({ skill, mine }: { skill: Skill; mine: SheetSkill | undefined }) {
  const lines = passiveLines(skill);
  if (lines.length === 0) return null;
  return (
    <Card title="Passives on the sheet" headingLevel={3}>
      <ul className={styles.plainList}>
        {lines.map((line, i) => (
          <li key={i}>
            <span className={characterStyles.lead}>{line.atText}:</span> {line.text}
            {passiveOwned(mine, line.at) ? '' : ' (not yet)'}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LearningCard({ view, mine }: { view: CharacterView; mine: SheetSkill | undefined }) {
  const records = mine?.teaching ?? [];
  return (
    <Card title="Log of Learning" headingLevel={3}>
      {records.length === 0 ? (
        <p>Nothing recorded yet. Basic and each Technique need a teacher.</p>
      ) : (
        <ul className={styles.records}>
          {records.map((r) => {
            const what = r.step === 'basic' ? 'Basic' : `${namedLabel(r.step)} Technique`;
            const teacher = r.teacher
              ? r.teacher
              : r.viaMt
                ? 'Mist Token teaching'
                : r.atCreation
                  ? 'At character creation'
                  : 'None recorded';
            return (
              <li key={r.actionId}>
                <div className={styles.record}>
                  <p className={styles.recordHead}>
                    <span>{what}</span>
                    {r.unverified ? (
                      <span className={styles.tag}>
                        <CircleAlert aria-hidden="true" className={styles.tagIcon} />
                        Unverified
                      </span>
                    ) : null}
                  </p>
                  <dl className={characterStyles.facts}>
                    <div>
                      <dt>Teacher</dt>
                      <dd className={characterStyles.wrap}>{teacher}</dd>
                    </div>
                    <div>
                      <dt>Event</dt>
                      <dd>{r.eventKey ? eventName(view.sheet, r.eventKey) : 'None recorded'}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
