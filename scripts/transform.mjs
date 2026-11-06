// Build data/processed/*.json from data/raw/ and write data/quality-report.md.
// One row in films.json = one Best Picture nomination (621 rows; each film was
// nominated once). See data/SCHEMA.md.

import fs from 'node:fs';
import path from 'node:path';
import { parseNominees, parseCategoryNames } from './lib/wikipedia.mjs';
import { canonical, LIVE_TV, LIBRARY } from './providers.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const raw = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw', f), 'utf8'));
const out = (f, obj) => fs.writeFileSync(path.join(ROOT, 'data/processed', f), JSON.stringify(obj) + '\n');
fs.mkdirSync(path.join(ROOT, 'data/processed'), { recursive: true });

const wikitext = raw('wikipedia.json')['Academy Award for Best Picture'].wikitext;
const { films: nominees, problems } = parseNominees(wikitext);
const eras = parseCategoryNames(wikitext);
const filmIds = raw('films.json');
const tmdb = raw('tmdb.json');
const providerList = raw('providers.json').results ?? [];
const pageviews = fs.existsSync(path.join(ROOT, 'data/raw/pageviews.json')) ? raw('pageviews.json') : {};
const fetchLog = raw('fetch-log.json');
const wikidata = fs.existsSync(path.join(ROOT, 'data/raw/wikidata.json')) ? raw('wikidata.json') : null;

const Q = { problems: [...problems], unmatched: [], multi_tmdb: [], no_runtime: [], no_revenue: [], unknown_providers: new Set(), pageview_gaps: [], wikidata: [] };

// ---------- CPI (annual average of monthly CPI-U) ----------
const cpi = {};
const cpiPartial = [];
if (fs.existsSync(path.join(ROOT, 'data/raw/cpi.csv'))) {
  const lines = fs.readFileSync(path.join(ROOT, 'data/raw/cpi.csv'), 'utf8').trim().split('\n').slice(1);
  const by = {};
  for (const l of lines) { const [d, v] = l.split(','); const y = +d.slice(0, 4); if (v && v !== '.') (by[y] ??= []).push(+v); }
  // A year counts if it has at least 10 monthly readings. (October 2025 CPI was never
// published because of that autumn's federal shutdown, so 2025 has 11.)
for (const [y, vs] of Object.entries(by)) if (vs.length >= 10) { cpi[y] = vs.reduce((a, b) => a + b) / vs.length; if (vs.length < 12) cpiPartial.push(`${y} (${vs.length} months)`); }
}
const cpiYears = Object.keys(cpi).map(Number);
const cpiBase = cpiYears.length ? Math.max(...cpiYears) : null;

// ---------- film year ----------
// "1927/28" -> 1928 (the eligibility period ended that year); "2020/21" -> 2020
// (the COVID-extended year: films are 2020 releases plus Jan–Feb 2021).
function filmYear(label) {
  const m = label.match(/^(\d{4})(?:\/(\d{2}))?$/);
  if (!m) return null;
  if (!m[2]) return +m[1];
  return label === '2020/21' ? 2020 : +(m[1].slice(0, 2) + m[2]);
}

// ---------- providers ----------
const logoFileById = new Map(fs.existsSync(path.join(ROOT, 'public/logos')) ? fs.readdirSync(path.join(ROOT, 'public/logos')).map((f) => [+f.split('.')[0], f]) : []);
const logoFiles = new Set(logoFileById.keys());
const services = new Map(); // canonical name -> {name, logo, ids:Set, kind}
function service(p, offer) {
  const { name, via } = canonical(p.provider_name);
  const kind = offer === 'rent' || offer === 'buy' ? 'store'
    : LIBRARY.has(name) ? 'library'
      : offer === 'free' || offer === 'ads' || name === 'Prime Video (free)' ? 'free'
        : LIVE_TV.has(name) ? 'live' : 'subscription';
  let s = services.get(name);
  if (!s) { s = { name, logo: null, ids: new Set(), kinds: new Set(), priority: 999 }; services.set(name, s); }
  s.ids.add(p.provider_id); s.kinds.add(kind);
  // Prefer the logo of the exact-name provider (the parent service), else any variant's.
  const exact = canonical(p.provider_name).name === p.provider_name.trim() || p.provider_name.replace(/ Plus$/, '+') === name;
  if (logoFiles.has(p.provider_id) && (!s.logo || (exact && !s.logoExact))) { s.logo = p.provider_id; s.logoExact = exact; }
  s.priority = Math.min(s.priority, p.display_priority ?? 999);
  if (name === p.provider_name && !via) {/* plain */}
  return { name, via, kind };
}
// Look for parent logos in TMDB's full provider list too (e.g. a film only on the
// Amazon channel of Paramount+ still shows the Paramount+ logo).
const parentLogo = new Map();
for (const p of providerList) { const c = canonical(p.provider_name); if (!c.via && logoFiles.has(p.provider_id) && !parentLogo.has(c.name)) parentLogo.set(c.name, p.provider_id); }

function streaming(us) {
  if (!us) return null;
  const groups = { subscription: new Map(), free: new Map(), library: new Map(), live: new Map(), rent: new Map(), buy: new Map() };
  for (const offer of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
    for (const p of us[offer] ?? []) {
      const s = service(p, offer);
      const g = offer === 'rent' ? groups.rent : offer === 'buy' ? groups.buy : groups[s.kind];
      const prev = g.get(s.name);
      // Keep "direct" over "via a channel" when both exist.
      if (!prev || (prev.via && !s.via)) g.set(s.name, { name: s.name, via: s.via });
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([k, m]) => [k, [...m.values()]]));
}

// ---------- rows ----------
const rows = nominees.map((n) => {
  const ids = filmIds[n.article] ?? {};
  const t = tmdb[ids.article ?? n.article] ?? tmdb[n.article];
  const fy = filmYear(n.film_year_label);
  if (fy === null) Q.problems.push({ kind: 'unparsed_film_year', ceremony: n.ceremony, label: n.film_year_label });
  if (!t || t.status !== 'ok') Q.unmatched.push({ ceremony: n.ceremony, title: n.title, article: n.article, qid: ids.qid ?? null, status: t?.status ?? 'not fetched', tmdb_candidates: t?.tmdb_candidates });
  if (ids.tmdb?.length > 1) Q.multi_tmdb.push({ title: n.title, tmdb: ids.tmdb, used: t?.tmdb_id ?? null });
  const ok = t?.status === 'ok' ? t : null;
  const era = eras.find((e) => n.ceremony >= e.from_ceremony && (e.to_ceremony === null || n.ceremony <= e.to_ceremony));
  const runtime = ok?.runtime || null;
  if (ok && !runtime) Q.no_runtime.push(n.title);
  const revenue = ok?.revenue > 0 ? ok.revenue : null;
  if (ok && !revenue) Q.no_revenue.push(`${n.title} (${n.film_year_label})`);
  const releaseYear = ok?.release_date ? +ok.release_date.slice(0, 4) : fy;
  const adjYear = cpi[releaseYear] ? releaseYear : cpi[fy] ? fy : null;
  const revenue_adj = revenue && adjYear && cpiBase ? Math.round(revenue * (cpi[cpiBase] / cpi[adjYear])) : null;
  const pv = pageviews[ids.article];
  if (!pv) Q.pageview_gaps.push(n.title);
  const pvTotal = pv ? pv.months.reduce((a, [, v]) => a + v, 0) : null;
  return {
    id: `${n.ceremony}-${n.article.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    ceremony: n.ceremony,
    film_year: fy,
    film_year_label: n.film_year_label,
    decade: fy ? Math.floor(fy / 10) * 10 : null,
    category_name: era?.name ?? null,
    title: n.title,
    winner: n.winner,
    credits: n.credits,
    notes: [...n.year_notes, ...n.notes],
    wikipedia: ids.article ?? n.article,
    wikidata: ids.qid ?? null,
    tmdb_id: ok?.tmdb_id ?? null,
    imdb_id: ok?.imdb_id ?? null,
    release_date: ok?.release_date || null,
    runtime,
    genres: ok?.genres ?? [],
    countries: ok?.production_countries ?? [],
    original_language: ok?.original_language ?? null,
    revenue,
    revenue_adj,
    budget: ok?.budget > 0 ? ok.budget : null,
    tmdb_rating: ok?.vote_count >= 50 ? ok.vote_average : null,
    tmdb_votes: ok?.vote_count ?? null,
    pageviews: pvTotal,
    watch: ok ? streaming(ok.us_providers) : null,
    watch_link: ok?.us_providers?.link ?? null,
  };
});

// ---------- special cases, stated explicitly ----------
// TMDB gives The Artist (2011) original_language "fr" because it is a French
// production, but it is a silent film. Treat it as silent rather than non-English.
const LANGUAGE_OVERRIDES = { 'The Artist|84': { language: 'xx', why: 'Silent film; TMDB lists French because it is a French production.' } };
for (const r of rows) {
  const o = LANGUAGE_OVERRIDES[`${r.title}|${r.ceremony}`];
  if (o) { r.original_language = o.language; r.notes.push(o.why); }
}
const byTitle = (title, ceremony) => rows.find((r) => r.title === title && r.ceremony === ceremony);
const special = [];
function flag(row, text) { if (row) { row.notes.push(text); special.push(`${row.title} (${row.ceremony}): ${text}`); } else Q.problems.push({ kind: 'special_case_row_missing', text }); }
flag(byTitle('Wings', 1), 'Won Outstanding Picture at the 1st ceremony. That night a second top prize, Unique and Artistic Picture, went to Sunrise; the Academy later dropped that award and counts Wings as the first Best Picture. Sunrise is not counted as a Best Picture nominee.');
flag(byTitle('La La Land', 89), 'Announced as the winner by mistake after the wrong envelope was handed to the presenters; Moonlight was the actual winner.');
flag(byTitle('Moonlight', 89), 'The real winner, announced minutes after La La Land was read out in error.');
const second = rows.filter((r) => r.ceremony === 2);
if (second.length) special.push('2nd ceremony (1928/29): no official nominees were announced; the five films are the de facto nominees the Academy later reconstructed.');

// ---------- checks ----------
const perCeremony = new Map();
for (const r of rows) (perCeremony.get(r.ceremony) ?? perCeremony.set(r.ceremony, []).get(r.ceremony)).push(r);
for (const [c, rs] of perCeremony) {
  const w = rs.filter((r) => r.winner).length;
  if (w !== 1) Q.problems.push({ kind: 'winner_count', ceremony: c, winners: w });
}
const ceremonies = [...perCeremony.keys()].sort((a, b) => a - b);
for (let c = 1; c <= ceremonies.at(-1); c++) if (!perCeremony.has(c)) Q.problems.push({ kind: 'missing_ceremony', ceremony: c });

// Wikidata cross-check: does Wikidata record the same winner per ceremony?
if (wikidata) {
  const wdWins = new Map();
  for (const r of wikidata.rows) {
    if (r.kind !== 'won' || !r.article || !r.ceremonyLabel) continue;
    const c = +(r.ceremonyLabel.match(/^(\d+)/)?.[1] ?? 0);
    if (!c) continue;
    const art = decodeURIComponent(r.article.split('/wiki/')[1]).replace(/_/g, ' ');
    (wdWins.get(c) ?? wdWins.set(c, new Set()).get(c)).add(art);
  }
  for (const [c, rs] of perCeremony) {
    const w = rs.find((r) => r.winner);
    const wd = wdWins.get(c);
    if (!wd) { Q.wikidata.push(`${c}: Wikidata has no winner statement with a ceremony qualifier`); continue; }
    if (!wd.has(w.wikipedia)) Q.wikidata.push(`${c}: Wikipedia winner "${w.wikipedia}", Wikidata winner(s) ${[...wd].map((x) => `"${x}"`).join(', ')}`);
  }
}

// ---------- services ----------
const serviceList = [...services.values()].map((s) => ({
  name: s.name,
  logo: logoFileById.get(parentLogo.get(s.name) ?? s.logo) ?? null,
  kinds: [...s.kinds].sort(),
  priority: s.priority,
})).sort((a, b) => a.priority - b.priority);
const known = new Set(['subscription', 'free', 'library', 'live', 'store']);
for (const s of serviceList) if (!s.logo) Q.unknown_providers.add(`${s.name} (no logo file)`);

// ---------- write ----------
out('films.json', rows);
out('services.json', serviceList);
out('eras.json', eras);
out('meta.json', {
  built: new Date().toISOString().slice(0, 10),
  wikipedia_revid: fetchLog.wikipedia?.revids?.['Academy Award for Best Picture'] ?? null,
  streaming_as_of: fetchLog.tmdb?.providers_snapshot ?? null,
  pageviews_through: fetchLog.pageviews?.through ?? null,
  cpi_base_year: cpiBase,
  special_cases: special,
});

// ---------- quality report ----------
const ok = rows.filter((r) => r.tmdb_id).length;
const md = [];
md.push('# Data quality report', '', `Generated by \`npm run transform\` on ${new Date().toISOString().slice(0, 10)}.`, '');
md.push('## Coverage', '');
md.push(`| Item | Count |`, `|---|---|`);
md.push(`| Nominations parsed from Wikipedia | ${rows.length} |`, `| Winners | ${rows.filter((r) => r.winner).length} |`, `| Ceremonies | ${ceremonies.length} (1–${ceremonies.at(-1)}) |`);
md.push(`| Matched to TMDB | ${ok} |`, `| With runtime | ${rows.filter((r) => r.runtime).length} |`, `| With box office (TMDB revenue > 0) | ${rows.filter((r) => r.revenue).length} |`);
md.push(`| With US watch-provider data | ${rows.filter((r) => r.watch).length} |`, `| With pageviews | ${rows.filter((r) => r.pageviews !== null).length} |`, '');
md.push('## Special cases handled', '', ...special.map((s) => `- ${s}`), '- Category name changes come from the "Category name changes" list in the same Wikipedia article: ' + eras.map((e) => `${e.name} (${e.from_label}–${e.to_label})`).join('; ') + '.', '- Split-year eligibility (1927/28 to 1932/33) is mapped to the later year; 2020/21 (COVID-extended) is mapped to 2020.', '- CPI years averaged from fewer than 12 months: ' + (cpiPartial.join(', ') || 'none') + `. Box office is adjusted to ${cpiBase} dollars.`, '- Language override: The Artist (2011) is silent; TMDB lists French (production country), so it is not counted as a non-English winner.', '- Each film appears once; no film has been nominated twice. Remakes are distinct films and are matched by Wikidata item, not title.', '');
md.push('## Parser problems', '', Q.problems.length ? Q.problems.map((p) => `- ${JSON.stringify(p)}`).join('\n') : 'None.', '');
md.push('## Films not matched to TMDB', '', Q.unmatched.length ? Q.unmatched.map((u) => `- ${u.title} (${u.ceremony}), ${u.article}, ${u.qid ?? 'no Wikidata item'}: ${u.status}`).join('\n') : 'None.', '');
md.push('## Wikidata had more than one TMDB ID', '', Q.multi_tmdb.length ? Q.multi_tmdb.map((m) => `- ${m.title}: ${m.tmdb.join(', ')} (used ${m.used ?? 'IMDb lookup / none'})`).join('\n') : 'None.', '');
md.push('## Wikidata cross-check of winners', '', Q.wikidata.length ? Q.wikidata.map((s) => `- ${s}`).join('\n') : 'All ceremonies agree.', '');
md.push('## Missing runtime', '', Q.no_runtime.length ? Q.no_runtime.map((s) => `- ${s}`).join('\n') : 'None.', '');
md.push(`## Missing box office (${Q.no_revenue.length})`, '', 'TMDB revenue is crowd-sourced and sparse before about 1970. These films are left out of box-office comparisons rather than guessed.', '', Q.no_revenue.join('; ') || 'None.', '');
md.push('## Missing pageviews', '', Q.pageview_gaps.length ? Q.pageview_gaps.join('; ') : 'None.', '');
md.push('## Streaming services without a logo', '', [...Q.unknown_providers].map((s) => `- ${s}`).join('\n') || 'None.', '');
md.push('## Spot checks', '', '_Filled in by `npm run findings`; see data/findings.json → spot_checks._', '');
fs.writeFileSync(path.join(ROOT, 'data/quality-report.md'), md.join('\n') + '\n');
console.log(`films: ${rows.length}, tmdb matched: ${ok}, problems: ${Q.problems.length}, unmatched: ${Q.unmatched.length}, services: ${serviceList.length}`);
