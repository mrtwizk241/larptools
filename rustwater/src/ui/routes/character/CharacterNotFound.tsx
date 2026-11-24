import { Card } from '../../components/index.ts';
import styles from './character.module.css';

/** A character address with no screen behind it. */
export function CharacterNotFound() {
  return (
    <section aria-labelledby="not-found-heading" className={styles.section}>
      <h2 id="not-found-heading">Page not found</h2>
      <Card>
        <p>There is nothing at this address.</p>
      </Card>
    </section>
  );
}
