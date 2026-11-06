// Fetch every raw input for the Best Picture data story into data/raw/.
//
//   npm run fetch-data            # fetch only what isn't cached yet
//   npm run fetch-data -- --force # refetch everything (e.g. to refresh streaming)
//   npm run fetch-data -- --force=tmdb,pageviews
//
// Sources (see data/SOURCES.md):
//   wikipedia.json   wikitext of "Academy Award for Best Picture": the nominee list (primary)
//   films.json       each nominated film's enwiki title -> Wikidata item -> TMDB/IMDb IDs
//   wikidata.json    Wikidata's own Best Picture nominations/wins (cross-check only)
//   tmdb.json        TMDB movie details + US watch providers (JustWatch data), one entry per film
//   providers.json   TMDB list of US movie watch providers (names, logos, display priority)
//   pageviews.json   monthly enwiki pageviews per film since July 2015
//   cpi.csv          US CPI-U, not seasonally adjusted (FRED series CPIAUCNS, from BLS)
//   ../../public/logos/<provider_id>.jpg  provider logos (TMDB image CDN, w92)
//
// Every network response is cached; reruns only fill gaps. Needs TMDB_READ_TOKEN in .env.

import fs from 'node:fs';
import path from 'node:path';
import { parseNominees } from './lib/wikipedia.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'data/raw');
const LOGOS = path.join(ROOT, 'public/logos');
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(LOGOS, { recursive: true });

const UA = 'best-picture-data-story/1.0 (https://briandaviddavidson.com/oscars/; https://github.com/briandaviddavidson/best-picture)';
const forceArg = process.argv.find((a) => a.startsWith('--force'));
const force = (name) => forceArg === '--force' || (forceArg?.startsWith('--force=') && forceArg.slice(8).split(',').includes(name));
// Load .env without a dependency (works on any Node 18+).
if (fs.existsSync(path.join(ROOT, '.env'))) {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const TOKEN = process.env.TMDB_READ_TOKEN;

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rawPath = (f) => path.join(RAW, f);
const readJson = (f, dflt) => (fs.existsSync(rawPath(f)) ? JSON.parse(fs.readFileSync(rawPath(f), 'utf8')) : dflt);
const writeJson = (f, obj) => fs.writeFileSync(rawPath(f), JSON.stringify(obj, null, 1) + '\n');
const fetchLog = readJson('fetch-log.json', {});
const note = (source, info) => { fetchLog[source] = { ...info, at: new Date().toISOString() }; writeJson('fetch-log.json', fetchLog); };

async function get(url, { headers = {}, as = 'json', tries = 8 } = {}) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...headers } });
    if (res.ok) return as === 'json' ? res.json() : as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
    if (res.status === 404) return null;
    if (i >= tries || ![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * i;
    log(`  ${res.status}, retrying in ${wait} ms`);
    await sleep(wait);
  }
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      if (++done % 50 === 0) log(`  ${done}/${items.length}`);
    }
  }));
}

// ---------- Wikidata ---------------------------------------------------------
const SPARQL = 'https://query.wikidata.org/sparql';
const sparql = async (q) => (await get(`${SPARQL}?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;

// Property IDs are verified live against their English labels before use; the award
// item is found by its label rather than hardcoded. If any check fails, stop.
const PROPS = {
  P1411: 'nominated for', P166: 'award received', P4947: 'TMDB movie ID', P345: 'IMDb ID',
  P805: 'statement is subject of', P585: 'point in time', P577: 'publication date',
};

async function fetchWikidata() {
  if (!force('wikidata') && fs.existsSync(rawPath('wikidata.json'))) return log('wikidata: cached');
  log('wikidata: verifying IDs');
  const labels = await sparql(`SELECT ?p ?l WHERE { VALUES ?p { ${Object.keys(PROPS).map((p) => `wd:${p}`).join(' ')} } ?p rdfs:label ?l FILTER(lang(?l)="en") }`);
  for (const [pid, want] of Object.entries(PROPS)) {
    const got = labels.find((b) => b.p.value.endsWith(`/${pid}`))?.l.value;
    if (got !== want) throw new Error(`Wikidata ${pid} is labelled "${got}", expected "${want}". Check the property before continuing.`);
  }
  const award = await sparql(`SELECT ?a WHERE { ?a rdfs:label "Academy Award for Best Picture"@en }`);
  if (award.length !== 1) throw new Error(`Expected one Wikidata item labelled "Academy Award for Best Picture", found ${award.length}`);
  const AWARD = award[0].a.value.split('/').pop();
  log(`wikidata: award item is ${AWARD}`);

  const rows = await sparql(`
SELECT ?film ?filmLabel ?kind ?ceremony ?ceremonyLabel ?time ?tmdb ?imdb ?article ?pub WHERE {
  { ?film p:P1411 ?st . ?st ps:P1411 wd:${AWARD} . BIND("nominated" AS ?kind) }
  UNION
  { ?film p:P166 ?st . ?st ps:P166 wd:${AWARD} . BIND("won" AS ?kind) }
  OPTIONAL { ?st pq:P805 ?ceremony }
  OPTIONAL { ?st pq:P585 ?time }
  OPTIONAL { ?film wdt:P4947 ?tmdb }
  OPTIONAL { ?film wdt:P345 ?imdb }
  OPTIONAL { ?film wdt:P577 ?pub }
  OPTIONAL { ?article schema:about ?film ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`);
  const flat = rows.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  writeJson('wikidata.json', { award: AWARD, verified_properties: PROPS, rows: flat });
  note('wikidata', { rows: flat.length, award: AWARD });
  log(`wikidata: ${flat.length} rows`);
}


// ---------- Films: Wikipedia article -> Wikidata item -> TMDB/IMDb IDs -------
async function fetchFilms() {
  const wt = readJson('wikipedia.json')['Academy Award for Best Picture'].wikitext;
  const { films } = parseNominees(wt);
  const cache = force('films') ? {} : readJson('films.json', {});
  const todo = films.map((f) => f.article).filter((a) => !cache[a]);
  log(`films: ${films.length} nominees, ${todo.length} to resolve`);
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(batch.join('|'))}`;
    const j = await get(url);
    const norm = new Map((j.query.normalized ?? []).map((n) => [n.from, n.to]));
    const redir = new Map((j.query.redirects ?? []).map((n) => [n.from, n.to]));
    const pages = new Map(j.query.pages.map((p) => [p.title, p]));
    for (const a of batch) {
      const n = norm.get(a) ?? a;
      const canonical = redir.get(n) ?? n;
      const page = pages.get(canonical);
      cache[a] = { article: canonical, qid: page?.pageprops?.wikibase_item ?? null, missing: !!page?.missing };
    }
    writeJson('films.json', cache); // save each batch so a rate-limited run resumes
    await sleep(1000);
  }
  const qids = [...new Set(Object.values(cache).filter((c) => c.qid && !c.ids_checked).map((c) => c.qid))];
  for (let i = 0; i < qids.length; i += 150) {
    const batch = qids.slice(i, i + 150);
    const rows = await sparql(`SELECT ?film ?tmdb ?imdb ?pub WHERE { VALUES ?film { ${batch.map((q) => `wd:${q}`).join(' ')} }
      OPTIONAL { ?film wdt:P4947 ?tmdb } OPTIONAL { ?film wdt:P345 ?imdb } OPTIONAL { ?film wdt:P577 ?pub } }`);
    const by = new Map();
    for (const b of rows) {
      const q = b.film.value.split('/').pop();
      const e = by.get(q) ?? { tmdb: new Set(), imdb: new Set(), pub: new Set() };
      if (b.tmdb) e.tmdb.add(b.tmdb.value); if (b.imdb) e.imdb.add(b.imdb.value); if (b.pub) e.pub.add(b.pub.value.slice(0, 10));
      by.set(q, e);
    }
    for (const c of Object.values(cache)) {
      const e = c.qid && by.get(c.qid);
      if (!e) continue;
      Object.assign(c, { tmdb: [...e.tmdb], imdb: [...e.imdb], pub: [...e.pub].sort(), ids_checked: true });
    }
  }
  writeJson('films.json', cache);
  note('films', { nominees: films.length, resolved: Object.values(cache).filter((c) => c.qid).length });
  log('films: done');
}

// ---------- Wikipedia (primary nominee list + category names) ----------------
async function fetchWikipedia() {
  if (!force('wikipedia') && fs.existsSync(rawPath('wikipedia.json'))) return log('wikipedia: cached');
  const pages = ['Academy Award for Best Picture'];
  const out = {};
  for (const title of pages) {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext|revid&redirects=1&page=${encodeURIComponent(title)}`;
    const j = await get(url);
    out[title] = { revid: j.parse.revid, wikitext: j.parse.wikitext };
    await sleep(500);
  }
  writeJson('wikipedia.json', out);
  note('wikipedia', { pages, revids: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.revid])) });
  log('wikipedia: done');
}

// ---------- TMDB -------------------------------------------------------------
const TMDB = 'https://api.themoviedb.org/3';
const tmdb = (p) => get(`${TMDB}${p}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });

async function fetchTmdb() {
  if (!TOKEN) throw new Error('TMDB_READ_TOKEN is not set. Copy .env.example to .env and add your TMDB API Read Access Token.');
  const films = readJson('films.json');
  const cache = force('tmdb') ? {} : readJson('tmdb.json', {});
  // Keyed by enwiki article title (the same key transform uses). Earlier runs keyed by
  // Wikidata URL; those entries are ignored.
  for (const k of Object.keys(cache)) if (k.startsWith('http')) delete cache[k];
  const todo = Object.values(films).filter((f) => !cache[f.article]);
  log(`tmdb: ${Object.keys(films).length} films, ${todo.length} to fetch`);
  await pool(todo, 6, async (r) => {
    const key = r.article;
    let id = r.tmdb?.length === 1 ? r.tmdb[0] : null, via = 'wikidata:P4947';
    if (r.tmdb?.length > 1) via = `wikidata:P4947 had ${r.tmdb.length} values`;
    const imdb = r.imdb?.find((x) => x.startsWith('tt'));
    if (!id && imdb) {
      const f = await tmdb(`/find/${imdb}?external_source=imdb_id`);
      id = f?.movie_results?.[0]?.id; via = 'imdb:find';
    }
    if (!id) { cache[key] = { status: 'unmatched', qid: r.qid, tmdb_candidates: r.tmdb ?? [] }; return; }
    const m = await tmdb(`/movie/${id}?language=en-US&append_to_response=watch/providers,release_dates`);
    if (!m) { cache[key] = { status: 'not_found', tmdb_id: id, via, qid: r.qid }; return; }
    const us = m['watch/providers']?.results?.US ?? null;
    const usCert = m.release_dates?.results?.find((x) => x.iso_3166_1 === 'US');
    cache[key] = {
      status: 'ok', via, qid: r.qid, tmdb_id: m.id, imdb_id: m.imdb_id, title: m.title, original_title: m.original_title,
      original_language: m.original_language, release_date: m.release_date, runtime: m.runtime,
      budget: m.budget, revenue: m.revenue, genres: m.genres?.map((g) => g.name),
      production_countries: m.production_countries?.map((c) => c.iso_3166_1),
      spoken_languages: m.spoken_languages?.map((l) => l.iso_639_1),
      vote_average: m.vote_average, vote_count: m.vote_count, popularity: m.popularity,
      us_providers: us, us_certification: usCert?.release_dates?.find((d) => d.certification)?.certification ?? null,
    };
    if (Object.keys(cache).length % 25 === 0) writeJson('tmdb.json', cache);
  });
  writeJson('tmdb.json', cache);

  const prov = await tmdb('/watch/providers/movie?language=en-US&watch_region=US');
  writeJson('providers.json', prov);
  note('tmdb', { films: Object.keys(cache).length, unmatched: Object.values(cache).filter((c) => c.status !== 'ok').length, watch_region: 'US', providers_snapshot: new Date().toISOString().slice(0, 10) });
  log('tmdb: done');
}

async function fetchLogos() {
  const cache = readJson('tmdb.json', {});
  const logos = new Map();
  for (const f of Object.values(cache)) {
    for (const kind of ['flatrate', 'free', 'ads', 'rent', 'buy']) for (const p of f.us_providers?.[kind] ?? []) logos.set(p.provider_id, p.logo_path);
  }
  let n = 0;
  for (const [id, lp] of logos) {
    const file = path.join(LOGOS, `${id}${path.extname(lp ?? '') || '.jpg'}`);
    if (!lp || (fs.existsSync(file) && !force('logos'))) continue;
    fs.writeFileSync(file, await get(`https://image.tmdb.org/t/p/w92${lp}`, { as: 'buffer' }));
    n++;
  }
  log(`logos: ${n} downloaded, ${logos.size} providers in use`);
}

// ---------- Wikimedia pageviews ----------------------------------------------
async function fetchPageviews() {
  const titles = [...new Set(Object.values(readJson('films.json')).filter((f) => !f.missing).map((f) => f.article))];
  const cache = force('pageviews') ? {} : readJson('pageviews.json', {});
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // first of this month (exclusive)
  const endStr = `${end.toISOString().slice(0, 10).replace(/-/g, '')}00`;
  const todo = titles.filter((t) => !cache[t] || cache[t].end !== endStr);
  log(`pageviews: ${titles.length} articles, ${todo.length} to fetch`);
  let n = 0;
  await pool(todo, 2, async (t) => {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(t.replace(/ /g, '_'))}/monthly/2015070100/${endStr}`;
    const j = await get(url);
    cache[t] = { end: endStr, months: (j?.items ?? []).map((i) => [i.timestamp.slice(0, 6), i.views]) };
    if (++n % 25 === 0) writeJson('pageviews.json', cache); // save progress so an interrupted run resumes
    await sleep(150);
  });
  writeJson('pageviews.json', cache);
  note('pageviews', { articles: titles.length, through: endStr });
}

// ---------- CPI --------------------------------------------------------------
async function fetchCpi() {
  if (!force('cpi') && fs.existsSync(rawPath('cpi.csv'))) return log('cpi: cached');
  const csv = await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS', { as: 'text' });
  fs.writeFileSync(rawPath('cpi.csv'), csv);
  note('cpi', { source: 'FRED CPIAUCNS', lines: csv.split('\n').length });
  log('cpi: done');
}

const steps = [fetchWikipedia, fetchFilms, fetchWikidata, fetchTmdb, fetchLogos, fetchPageviews, fetchCpi];
for (const step of steps) {
  try { await step(); } catch (e) {
    console.error(`\n${step.name} failed: ${e.message}`);
    note(step.name, { error: e.message });
    if ([fetchWikipedia, fetchFilms, fetchTmdb].includes(step)) process.exit(1);
  }
}
log('\nAll done. Raw data is in data/raw/.');
