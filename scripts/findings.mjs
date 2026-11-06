// Compute every number the captions use, into data/findings.json, and run the
// spot checks (results appended to data/quality-report.md). Captions in src/main.js
// only ever read from this file.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed', f), 'utf8'));
const films = P('films.json');
const eras = P('eras.json');
const meta = P('meta.json');
const services = P('services.json');

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (a, b) => Math.round((100 * a) / b);
const pick = (r) => ({ title: r.title, year: r.film_year_label, ceremony: r.ceremony });
const winners = films.filter((r) => r.winner);
const byCeremony = new Map();
for (const r of films) (byCeremony.get(r.ceremony) ?? byCeremony.set(r.ceremony, []).get(r.ceremony)).push(r);
const ceremonies = [...byCeremony.keys()].sort((a, b) => a - b);
const latestC = ceremonies.at(-1);
const latestWinner = winners.find((r) => r.ceremony === latestC);
const F = {};

// ---------- headline ----------
const nomineeCounts = ceremonies.map((c) => byCeremony.get(c).length);
F.headline = {
  first_label: films.find((r) => r.ceremony === 1).film_year_label,
  latest_label: latestWinner.film_year_label,
  ceremonies: ceremonies.length,
  nominations: films.length,
  winners: winners.length,
  latest_winner: pick(latestWinner),
  first_winner: pick(winners.find((r) => r.ceremony === 1)),
  names: eras.length,
  most_nominees: { n: Math.max(...nomineeCounts), ceremonies: ceremonies.filter((c) => byCeremony.get(c).length === Math.max(...nomineeCounts)) },
  fewest_nominees: { n: Math.min(...nomineeCounts), ceremonies: ceremonies.filter((c) => byCeremony.get(c).length === Math.min(...nomineeCounts)) },
};

// ---------- name eras ----------
F.eras = eras.map((e) => {
  const cs = ceremonies.filter((c) => c >= e.from_ceremony && (e.to_ceremony === null || c <= e.to_ceremony));
  const w = winners.filter((r) => cs.includes(r.ceremony)).sort((a, b) => a.ceremony - b.ceremony);
  return { ...e, ceremonies: cs.length, first_winner: pick(w[0]), last_winner: pick(w.at(-1)), winners: w.length };
});
const current = F.eras.at(-1);
F.eras_summary = { longest: F.eras.reduce((a, b) => (b.ceremonies > a.ceremonies ? b : a)).name, current_share: pct(current.ceremonies, ceremonies.length), current_from: current.from_label, before_current: ceremonies.length - current.ceremonies };

// ---------- runtime ----------
const withRt = films.filter((r) => r.runtime);
const wRt = winners.filter((r) => r.runtime);
const byDecade = (rs, f) => { const m = new Map(); for (const r of rs) (m.get(r.decade) ?? m.set(r.decade, []).get(r.decade)).push(f(r)); return m; };
const wDec = byDecade(wRt, (r) => r.runtime);
const fDec = byDecade(withRt, (r) => r.runtime);
const longerThanField = wRt.filter((w) => { const field = byCeremony.get(w.ceremony).filter((r) => r.runtime && !r.winner); return field.length && w.runtime > median(field.map((r) => r.runtime)); });
const longest = wRt.reduce((a, b) => (b.runtime > a.runtime ? b : a));
const shortest = wRt.reduce((a, b) => (b.runtime < a.runtime ? b : a));
const decades = [...fDec.keys()].sort((a, b) => a - b);
F.runtime = {
  winners_with_runtime: wRt.length,
  nominees_with_runtime: withRt.length,
  winner_median: median(wRt.map((r) => r.runtime)),
  field_median: median(withRt.filter((r) => !r.winner).map((r) => r.runtime)),
  winner_longer_than_field_median: { n: longerThanField.length, of: wRt.filter((w) => byCeremony.get(w.ceremony).some((r) => r.runtime && !r.winner)).length },
  longest: { ...pick(longest), runtime: longest.runtime },
  shortest: { ...pick(shortest), runtime: shortest.runtime },
  by_decade: decades.map((d) => ({ decade: d, winner_median: median(wDec.get(d) ?? []), field_median: median(fDec.get(d)), n: fDec.get(d).length })),
};
const rtLast = F.runtime.by_decade.at(-1), rt1930 = F.runtime.by_decade.find((d) => d.decade === 1930);
F.runtime.decade_change = { from: rt1930, to: rtLast };

// ---------- genres ----------
const genreCount = new Map();
for (const r of films) for (const g of r.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
const topGenres = [...genreCount].sort((a, b) => b[1] - a[1]).map(([g]) => g);
const withGenre = films.filter((r) => r.genres.length);
const shareIn = (rs, g) => (rs.length ? rs.filter((r) => r.genres.includes(g)).length / rs.length : null);
F.genres = {
  films_with_genres: withGenre.length,
  ranking: topGenres.slice(0, 12).map((g) => ({ genre: g, nominees: genreCount.get(g), share_nominees: pct(genreCount.get(g), withGenre.length), share_winners: pct(winners.filter((r) => r.genres.includes(g)).length, winners.filter((r) => r.genres.length).length) })),
  by_decade: decades.map((d) => {
    const rs = withGenre.filter((r) => r.decade === d);
    return { decade: d, n: rs.length, shares: Object.fromEntries(topGenres.slice(0, 8).map((g) => [g, shareIn(rs, g)])) };
  }),
};
// Which genre gained / lost the most between the first three and last three decades?
const early = withGenre.filter((r) => r.decade <= 1950), late = withGenre.filter((r) => r.decade >= 2000);
F.genres.shift = topGenres.slice(0, 10).map((g) => ({ genre: g, early: Math.round(100 * shareIn(early, g)), late: Math.round(100 * shareIn(late, g)) }))
  .map((x) => ({ ...x, change: x.late - x.early })).sort((a, b) => b.change - a.change);
F.genres.windows = { early: '1920s–1950s', late: '2000s–2020s' };
// Genre "over-performance": winner share minus nominee share
F.genres.edge = F.genres.ranking.filter((g) => g.nominees >= 30).map((g) => ({ genre: g.genre, edge: g.share_winners - g.share_nominees })).sort((a, b) => b.edge - a.edge);

// ---------- box office ----------
// Only ceremonies where every nominee has a TMDB revenue figure are compared, so
// the winner's rank is never computed against a partial field.
const complete = ceremonies.filter((c) => byCeremony.get(c).every((r) => r.revenue_adj));
const ranks = complete.map((c) => {
  const rs = [...byCeremony.get(c)].sort((a, b) => b.revenue_adj - a.revenue_adj);
  const w = rs.find((r) => r.winner);
  return { ceremony: c, label: w.film_year_label, film_year: w.film_year, winner: w.title, rank: rs.indexOf(w) + 1, field: rs.length, top: rs[0].title, winner_adj: w.revenue_adj, top_adj: rs[0].revenue_adj };
});
const topWins = ranks.filter((r) => r.rank === 1);
const split = (r) => r.film_year < 1990;
const pre = ranks.filter(split), post = ranks.filter((r) => !split(r));
const richest = winners.filter((r) => r.revenue_adj).reduce((a, b) => (b.revenue_adj > a.revenue_adj ? b : a));
F.boxoffice = {
  complete_ceremonies: complete.length,
  of: ceremonies.length,
  top_grosser_won: topWins.length,
  top_grosser_won_pct: pct(topWins.length, ranks.length),
  before_1990: { n: pre.length, top_won: pre.filter((r) => r.rank === 1).length },
  since_1990: { n: post.length, top_won: post.filter((r) => r.rank === 1).length },
  last_top_grosser_winner: topWins.at(-1) ?? null,
  lowest_rank_wins: ranks.filter((r) => r.rank === r.field && r.field >= 5).map((r) => ({ winner: r.winner, label: r.label, field: r.field })),
  median_rank_since_2009: median(ranks.filter((r) => r.film_year >= 2009).map((r) => r.rank)),
  median_field_since_2009: median(ranks.filter((r) => r.film_year >= 2009).map((r) => r.field)),
  richest_winner: { ...pick(richest), revenue_adj: richest.revenue_adj },
  cpi_base_year: meta.cpi_base_year,
  ranks,
};

// ---------- countries ----------
const nonUS = (r) => r.countries.length && r.countries.some((c) => c !== 'US');
const noUS = (r) => r.countries.length && !r.countries.includes('US');
const wc = films.filter((r) => r.countries.length);
const countryCount = new Map();
for (const r of wc) for (const c of r.countries) countryCount.set(c, (countryCount.get(c) ?? 0) + 1);
const nonEnglishWinners = winners.filter((r) => r.original_language && !['en', 'xx'].includes(r.original_language)).sort((a, b) => a.ceremony - b.ceremony);
F.countries = {
  films_with_countries: wc.length,
  distinct: countryCount.size,
  top: [...countryCount].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => ({ country: c, n })),
  by_decade: decades.map((d) => { const rs = wc.filter((r) => r.decade === d); return { decade: d, n: rs.length, any_foreign: pct(rs.filter(nonUS).length, rs.length), no_us: pct(rs.filter(noUS).length, rs.length), countries: new Set(rs.flatMap((r) => r.countries)).size }; }),
  counts_by_decade: Object.fromEntries(decades.map((d) => { const m = {}; for (const r of wc.filter((x) => x.decade === d)) for (const c of r.countries) m[c] = (m[c] ?? 0) + 1; return [d, m]; })),
  all: Object.fromEntries(countryCount),
  non_english_winners: nonEnglishWinners.map((r) => ({ ...pick(r), language: r.original_language })),
  non_english_nominees: films.filter((r) => r.original_language && !['en', 'xx'].includes(r.original_language)).length,
  silent_winner_override: winners.filter((r) => r.original_language === 'xx').map(pick),
};

// ---------- memory (pageviews) ----------
const pvC = ceremonies.filter((c) => byCeremony.get(c).every((r) => r.pageviews !== null));
const mem = pvC.map((c) => {
  const rs = [...byCeremony.get(c)].sort((a, b) => b.pageviews - a.pageviews);
  const w = rs.find((r) => r.winner);
  const total = rs.reduce((a, r) => a + r.pageviews, 0);
  return { ceremony: c, label: w.film_year_label, film_year: w.film_year, winner: w.title, rank: rs.indexOf(w) + 1, field: rs.length, top: rs[0].title, top_views: rs[0].pageviews, winner_views: w.pageviews, winner_share: total ? w.pageviews / total : null };
});
const memTop = mem.filter((m) => m.rank === 1);
const upsets = mem.filter((m) => m.rank > 1).map((m) => ({ ...m, ratio: m.top_views / m.winner_views })).sort((a, b) => b.ratio - a.ratio);
const mostViewed = films.filter((r) => r.pageviews).reduce((a, b) => (b.pageviews > a.pageviews ? b : a));
F.memory = {
  through: meta.pageviews_through,
  ceremonies: mem.length,
  winner_most_read: memTop.length,
  winner_most_read_pct: pct(memTop.length, mem.length),
  biggest_upsets: upsets.slice(0, 6).map((u) => ({ label: u.label, winner: u.winner, top: u.top, ratio: Math.round(u.ratio * 10) / 10 })),
  most_viewed_nominee: { ...pick(mostViewed), winner: mostViewed.winner, views: mostViewed.pageviews },
  rows: mem,
};

// ---------- streaming ----------
const svcCount = new Map();
const has = (r, k) => r.watch && r.watch[k]?.length;
for (const r of winners) for (const s of r.watch?.subscription ?? []) svcCount.set(s.name, (svcCount.get(s.name) ?? 0) + 1);
const wWatch = winners.filter((r) => r.watch);
const status = (r) => (has(r, 'subscription') ? 'subscription' : has(r, 'free') || has(r, 'library') ? 'free' : has(r, 'live') ? 'live' : has(r, 'rent') || has(r, 'buy') ? 'store' : 'none');
const statusCount = (rs) => Object.fromEntries(['subscription', 'free', 'live', 'store', 'none'].map((k) => [k, rs.filter((r) => status(r) === k).length]));
const svcRank = [...svcCount].sort((a, b) => b[1] - a[1]);
const nowhere = winners.filter((r) => status(r) === 'none');
F.streaming = {
  as_of: meta.streaming_as_of,
  winners_checked: wWatch.length,
  winners: statusCount(winners),
  nominees: statusCount(films),
  nominees_total: films.length,
  services: svcRank.map(([name, n]) => ({ name, winners: n, logo: services.find((s) => s.name === name)?.logo ?? null })),
  leader: svcRank[0] ? { name: svcRank[0][0], winners: svcRank[0][1] } : null,
  nowhere: nowhere.map(pick),
  free_winners: winners.filter((r) => has(r, 'free') || has(r, 'library')).length,
  streaming_era_winner: winners.find((r) => r.title === 'CODA') ? pick(winners.find((r) => r.title === 'CODA')) : null,
};

// ---------- spot checks ----------
const find = (title, c) => films.find((r) => r.title === title && r.ceremony === c);
const checks = [
  ['1st ceremony winner is Wings', find('Wings', 1)?.winner === true],
  ['89th ceremony winner is Moonlight, not La La Land', find('Moonlight', 89)?.winner === true && find('La La Land', 89)?.winner === false],
  ['92nd ceremony winner is Parasite (Korean-language)', find('Parasite', 92)?.winner === true && find('Parasite', 92)?.original_language === 'ko'],
  ['82nd ceremony (2009 films) had 10 nominees', byCeremony.get(82)?.length === 10],
  ['17th–81st ceremonies each had 5 nominees', ceremonies.filter((c) => c >= 17 && c <= 81).every((c) => byCeremony.get(c).length === 5)],
  ['Gone with the Wind runs over 220 minutes', (find('Gone with the Wind', 12)?.runtime ?? 0) > 220],
  ['Titanic (1997) grossed over $1.8B nominal', (find('Titanic', 70)?.revenue ?? 0) > 1.8e9],
  ['Every ceremony has exactly one winner', ceremonies.every((c) => byCeremony.get(c).filter((r) => r.winner).length === 1)],
  ['Total nominations match the Wikipedia article (621)', films.length === 621],
].map(([check, pass]) => ({ check, pass: !!pass }));
F.spot_checks = checks;
F.spot_rows = ['Wings', 'Casablanca', 'The Godfather', 'Titanic', 'Parasite', 'CODA'].map((t) => films.find((r) => r.title === t && r.winner)).filter(Boolean)
  .map((r) => ({ title: r.title, ceremony: r.ceremony, year: r.film_year_label, runtime: r.runtime, genres: r.genres, countries: r.countries, language: r.original_language, tmdb: r.tmdb_id }));

F.meta = meta;
fs.writeFileSync(path.join(ROOT, 'data/findings.json'), JSON.stringify(F, null, 1) + '\n');

// append to quality report
const qr = path.join(ROOT, 'data/quality-report.md');
const text = fs.readFileSync(qr, 'utf8').replace(/## Spot checks[\s\S]*$/, '');
const spot = ['## Spot checks', '', 'Known facts, checked automatically:', '', ...checks.map((c) => `- [${c.pass ? 'x' : ' '}] ${c.check}`), '',
  'Processed rows to compare against Wikipedia, TMDB and the Academy database by hand:', '', '| Film | Ceremony | Year | Runtime | Genres | Countries | Lang | TMDB |', '|---|---|---|---|---|---|---|---|',
  ...F.spot_rows.map((r) => `| ${r.title} | ${r.ceremony} | ${r.year} | ${r.runtime} | ${r.genres.join(', ')} | ${r.countries.join(', ')} | ${r.language} | ${r.tmdb} |`), ''];
fs.writeFileSync(qr, text + spot.join('\n') + '\n');
console.log(checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'}  ${c.check}`).join('\n'));
