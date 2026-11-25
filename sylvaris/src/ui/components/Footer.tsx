import { PUBLIC_MODE, PUBLIC_REPO_URL } from '../../publicMode.ts';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>Unofficial fan tool, not affiliated with Sylvaris LARP or Sylvaris Games, LLC.</p>
      {PUBLIC_MODE ? (
        <p>
          <a href={PUBLIC_REPO_URL} rel="noreferrer">
            Source code on GitHub
          </a>
        </p>
      ) : null}
    </footer>
  );
}
