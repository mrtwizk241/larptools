// A test build may spend more XP, CXP, or AXP than it has. Each time a balance drops further
// below zero (not on load), a toast says how far over it is and what would earn the rest.
import { useEffect, useRef } from 'react';
import { useToast } from '../../../components/index.ts';
import { BUDGET_CURRENCIES, overspendText } from '../playground.ts';
import type { CharacterView } from '../view.ts';

export function OverspendNotice({ view }: { view: CharacterView }) {
  const toast = useToast();
  const { ruleset } = view;
  const { xp, cxp, axp } = view.sheet.points;
  const now = { xp: xp.available, cxp: cxp.available, axp: axp.available };
  const last = useRef(now);

  useEffect(() => {
    const before = last.current;
    const current = { xp: xp.available, cxp: cxp.available, axp: axp.available };
    last.current = current;
    for (const c of BUDGET_CURRENCIES)
      if (current[c] < 0 && current[c] < before[c])
        toast.show(overspendText(ruleset, c, -current[c]));
  }, [xp.available, cxp.available, axp.available, ruleset, toast]);

  return null;
}
