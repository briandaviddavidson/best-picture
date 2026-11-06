// Fold TMDB/JustWatch provider variants into the service a viewer would recognise.
// e.g. "Netflix Standard with Ads" -> Netflix, "HBO Max Amazon Channel" -> HBO Max (via Amazon).
// Every raw name maps through here; unknown names pass through unchanged and are
// listed in the quality report so new variants get noticed.

const CHANNEL = / (Amazon Channel|Roku Premium Channel|Apple TV [Cc]hannel)$/;
const TIER = / (Standard with Ads|Basic with Ads|with Ads|Free with Ads|Premium Plus|Premium|Essential)$/;

const RENAME = {
  'Paramount Plus': 'Paramount+', 'Disney Plus': 'Disney+', 'MGM Plus': 'MGM+', 'Lionsgate Plus': 'Lionsgate+',
  'Peacock': 'Peacock', 'Tubi TV': 'Tubi', 'Amazon Video': 'Prime Video Store', 'Amazon Prime Video': 'Prime Video',
  'Apple TV Store': 'Apple TV Store', 'Fandango At Home': 'Fandango at Home', 'YouTube Free': 'YouTube',
  'Starz': 'Starz', 'Cinemax': 'Cinemax', 'Britbox': 'BritBox',
};

// Services that carry live cable channels rather than an on-demand library of their own.
export const LIVE_TV = new Set(['fuboTV', 'YouTube TV', 'Philo', 'Sling TV', 'DIRECTV', 'Spectrum On Demand', 'TNT', 'TBS', 'tru TV', 'AMC', 'FXNow', 'TCM', 'History Vault', 'Hulu Live TV']);

// Free services that need a library card rather than a subscription.
export const LIBRARY = new Set(['Kanopy', 'Hoopla']);

export function canonical(rawName) {
  let name = rawName.trim();
  let via = null;
  const ch = name.match(CHANNEL);
  if (ch) { via = ch[1].replace(/ (Channel|channel|Premium Channel)$/, '').replace('Apple TV', 'Apple TV').trim(); name = name.replace(CHANNEL, ''); }
  // "Amazon Prime Video Free with Ads" is Prime Video's free tier, a separate thing from Prime
  if (/^Amazon Prime Video Free with Ads$/.test(rawName)) return { name: 'Prime Video (free)', via: null };
  name = name.replace(TIER, '');
  name = RENAME[name] ?? name;
  return { name, via };
}
