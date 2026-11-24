/** Names of the character sub-screens, by the first path segment after `/c/:id/`. */
const SUB_SCREENS = new Map<string, string>(
  Object.entries({
    '': 'Sheet',
    skills: 'Skills',
    play: 'Play Tracker',
    log: 'Log',
    memory: 'Spells',
    spells: 'Spells',
    recipes: 'Recipes',
    profession: 'Professions',
    extras: 'Familiars and Boons',
    checkin: 'Check-in',
    points: 'Points',
    requests: 'Requests',
    share: 'Share',
    print: 'Print',
  }),
);

/** The sub-screen name for `document.title`, from the route's splat (`skills/assault` gives "Skills"). */
export function characterScreenName(rest: string): string {
  const segment = rest.split('/')[0] ?? '';
  return SUB_SCREENS.get(segment) ?? 'Page not found';
}
