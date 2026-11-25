/** Names of the character sub-screens, by the first path segment after `/c/:id/`. */
const SUB_SCREENS = new Map<string, string>(
  Object.entries({
    '': 'Sheet',
    skills: 'Skills',
    journals: 'Magic',
    calling: 'Calling',
    extras: 'Extras',
    log: 'Log',
    points: 'Points',
    checkin: 'Check-in',
    retire: 'Retirement',
    play: 'Play',
    print: 'Print',
    more: 'More',
    share: 'Share',
  }),
);

/** The sub-screen name for `document.title`, from the route's splat (`skills/stun` gives "Skills"). */
export function characterScreenName(rest: string): string {
  const segment = rest.split('/')[0] ?? '';
  return SUB_SCREENS.get(segment) ?? 'Page not found';
}
