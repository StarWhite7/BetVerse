import { TEAM_LOGO_MAP } from '../team-logos';
import { officialTeamName } from '../team-names';
export const normalizeTeamName = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
export const displayTeamName = (name: string) => officialTeamName(name, normalizeTeamName);
export function teamLogoUrl(name: string) {
  const logo = TEAM_LOGO_MAP[normalizeTeamName(displayTeamName(name))];
  if (logo) return logo;
  // Local SVG fallback: no request or user data sent to a third-party image service.
  return '/team-placeholder.svg';
}
