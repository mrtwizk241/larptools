// A test build (ADR 0007) may spend more CXP or PXP than it has. Each time a balance drops
// further below zero, a toast says how far over it is and what would earn the rest.
import { useEffect, useRef } from 'react';
import { useToast } from '../../components/index.ts';
import type { CharacterView } from '../character/view.ts';
import { overspendText } from './testBuilds.ts';

export function OverspendNotice({ view }: { view: CharacterView }) {
  const toast = useToast();
  const { ruleset } = view;
  const cxp = view.sheet.points.cxp.available;
  const pxp = view.sheet.points.pxp.available;
  const last = useRef({ cxp, pxp });

  useEffect(() => {
    const before = last.current;
    last.current = { cxp, pxp };
    if (cxp < 0 && cxp < before.cxp) toast.show(overspendText(ruleset, 'cxp', -cxp));
    if (pxp < 0 && pxp < before.pxp) toast.show(overspendText(ruleset, 'pxp', -pxp));
  }, [cxp, pxp, ruleset, toast]);

  return null;
}
