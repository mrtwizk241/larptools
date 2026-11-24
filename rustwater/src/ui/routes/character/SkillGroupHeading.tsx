import styles from './character.module.css';

/** "Warrior  12 AP left": one Skills card group heading with what is left to spend. */
export function SkillGroupHeading({ title, left }: { title: string; left: string | null }) {
  return (
    <h3 className={styles.groupHeading}>
      <span>{title}</span>
      {left ? (
        <>
          {' '}
          <span className={styles.groupLeft}>{left}</span>
        </>
      ) : null}
    </h3>
  );
}
