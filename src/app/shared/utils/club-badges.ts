import { displayTeamName, normalizeTeamName } from './team-presentation';

import catalog from '../../../../public/club-badges/catalog.json';

const badgeUrls = new Map<string, string>();
for (const [path, names] of Object.entries(catalog)) {
  for (const name of names) badgeUrls.set(normalizeTeamName(name), 'club-badges/' + path);
}

export function clubBadgeUrl(team: string): string | undefined {
  return (
    badgeUrls.get(normalizeTeamName(team)) ?? badgeUrls.get(normalizeTeamName(displayTeamName(team)))
  );
}
