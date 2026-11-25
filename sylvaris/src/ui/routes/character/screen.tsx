// Shared by the character sub-screens: the props every screen gets, the staff-only notice, and
// the not-found card for an unknown sub-route.
import type { ComponentType } from 'react';
import { PUBLIC_MODE } from '../../../publicMode.ts';
import { Card } from '../../components/index.ts';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/** Props of every character sub-screen (`#/c/:id/...`), from CharacterLayout. */
export interface CharacterScreenProps {
  view: CharacterView;
}

/** A character sub-screen component. */
export type CharacterScreen = ComponentType<CharacterScreenProps>;

/** An unknown character sub-route (`#/c/:id/nowhere`). */
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

/** Staff-only sub-screens (points, check-in) show this to players. */
export function StaffOnlyNotice({ title }: { title: string }) {
  return (
    <section aria-labelledby="staff-only-heading" className={styles.section}>
      <h2 id="staff-only-heading">{title}</h2>
      <Card>
        <p>This page is for staff.</p>
      </Card>
    </section>
  );
}

/** Event and staff screens in the no-login builds, which have no events: points go in the banner. */
export function NotInBuilderNotice({ title }: { title: string; view?: CharacterView }) {
  return (
    <section aria-labelledby="not-in-builder-heading" className={styles.section}>
      <h2 id="not-in-builder-heading">{title}</h2>
      <Card>
        <p>
          {PUBLIC_MODE ? 'Test builds have' : 'The Character Playground has'} no events. Add or
          remove points in the test build box at the top of the page.
        </p>
      </Card>
    </section>
  );
}
