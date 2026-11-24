// What the .xlsx import found: the character facts and every warning.
import type { SheetImport } from '../../xlsx-import/index.ts';
import styles from './SheetImport.module.css';

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Preview({ found }: { found: SheetImport }) {
  const p = found.preview;
  const ancestry = p.subtypeName ? `${p.ancestryName}, ${p.subtypeName}` : p.ancestryName;
  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Character</dt>
          <dd>{p.characterName}</dd>
        </div>
        <div>
          <dt>Player</dt>
          <dd>{p.playerName}</dd>
        </div>
        {p.playerEmail ? (
          <div>
            <dt>Email</dt>
            <dd className={styles.wrap}>{p.playerEmail}</dd>
          </div>
        ) : null}
        <div>
          <dt>Ancestry</dt>
          <dd>{ancestry}</dd>
        </div>
        <div>
          <dt>CXP total</dt>
          <dd className="num">{p.cxpTotal}</dd>
        </div>
        <div>
          <dt>Skills</dt>
          <dd>{count(p.skills, 'skill', 'skills')}</dd>
        </div>
        <div>
          <dt>Spells</dt>
          <dd>{count(p.spells, 'spell', 'spells')}</dd>
        </div>
        <div>
          <dt>Recipes</dt>
          <dd>{count(p.recipes, 'recipe', 'recipes')}</dd>
        </div>
        <div>
          <dt>Profession</dt>
          <dd>{p.profession ?? 'None'}</dd>
        </div>
        <div>
          <dt>Familiar</dt>
          <dd>{p.familiar ?? 'None'}</dd>
        </div>
      </dl>
      <section aria-labelledby="sheet-import-warnings" className={styles.warnings}>
        <h3 id="sheet-import-warnings" className={styles.warningsTitle}>
          {found.warnings.length === 0
            ? 'No warnings'
            : count(found.warnings.length, 'warning', 'warnings')}
        </h3>
        {found.warnings.length === 0 ? (
          <p>Everything on the sheet was read.</p>
        ) : (
          <ul className={styles.warningList}>
            {found.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
