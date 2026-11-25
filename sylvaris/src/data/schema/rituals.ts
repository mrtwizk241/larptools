// rituals.json: Ritualism rules, the 12 rituals, and the planar chart.
import { z } from 'zod';
import {
  ByNamedLevel,
  Id,
  NamedLevel,
  PositiveInt,
  Source,
  Technique,
  Text,
  uniqueList,
} from './common.ts';

export const Ritual = z
  .strictObject({
    id: Id,
    name: Text,
    level: NamedLevel,
    uses: PositiveInt,
    castMinutes: PositiveInt,
    /** Magic skills the caster needs, each with `requiredTechnique`. */
    requiredMagic: z.array(Id).min(1).optional(),
    /** The needed magic depends on the plane (planar chart) or the imbued element. */
    requiredMagicRule: z.enum(['planar-chart', 'imbued-element']).optional(),
    requiredTechnique: Technique,
    enhancement: z.boolean(),
    aliases: z.array(Text).min(1).optional(),
    elementBonus: z
      .strictObject({ air: Text, death: Text, earth: Text, fire: Text, life: Text, water: Text })
      .optional(),
    summary: Text,
    source: Source,
  })
  .refine((r) => (r.requiredMagic === undefined) !== (r.requiredMagicRule === undefined), {
    message: 'set exactly one of requiredMagic and requiredMagicRule',
  });
export type Ritual = z.infer<typeof Ritual>;

export const PlanarChartEntry = z.strictObject({
  id: Id,
  name: Text,
  parent: Id.optional(),
  /** Magic skills needed; empty with requiredMagicVaries for unlisted realms. */
  requiredMagic: z.array(Id),
  requiredMagicVaries: z.literal(true).optional(),
  note: Text.optional(),
});

export const RitualsFile = z.strictObject({
  rules: z.strictObject({
    usesByLevel: ByNamedLevel(PositiveInt),
    castMinutesPerNamedLevel: PositiveInt,
    requiredTechniqueInEachMagic: Technique,
    consumesRitualScript: z.boolean(),
    enhancementNote: Text,
    source: Source,
  }),
  rituals: uniqueList(Ritual),
  planarChart: uniqueList(PlanarChartEntry),
  planarChartSource: Source,
});
export type RitualsFile = z.infer<typeof RitualsFile>;
