import * as Plot from '@observablehq/plot';
import * as topojson from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';
import F from '../data/findings.json';
import films from '../data/processed/films.json';
import services from '../data/processed/services.json';
import { initWatch } from './watch.js';

countries.registerLocale(en);
const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const money = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)} billion` : `$${Math.round(n / 1e6)} million`);
const t = (s) => `<i>${s}</i>`;
const list = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1 && n % 10) || 0] || 'th'}`;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = () => ({
  text: css('--text-primary'), text2: css('--text-secondary'), muted: css('--text-muted'), grid: css('--grid'),
  surface: css('--surface-1'), surface2: css('--surface-2'), rule: css('--rule'), winner: css('--winner'), field: css('--field'), s1: css('--series-1'),
  seq: ['--seq-100', '--seq-250', '--seq-450', '--seq-650'].map(css),
});
const SRC = {
  wiki: 'Wikipedia, “Academy Award for Best Picture” (nominee tables)',
  tmdb: 'TMDB (runtime, genres, countries, revenue)',
};
const winners = films.filter((r) => r.winner);
const H = F.headline;

// ---------- hero ----------
document.querySelectorAll('[data-f="first"]').forEach((el) => (el.textContent = H.first_label.slice(0, 4)));
document.querySelectorAll('[data-f="latest"]').forEach((el) => (el.textContent = H.latest_label));
$('#dek').innerHTML = `Over ${H.ceremonies} ceremonies, ${fmt(H.nominations)} films have been nominated for the top prize in American film, and ${H.winners} have won it, from ${t(H.first_winner.title)} to ${t(H.latest_winner.title)}. The prize has changed its name ${H.names - 1} times. Here's what the winners have in common, what the box office has to do with it, and where you can watch every one of them tonight.`;
$('#stats').innerHTML = [
  ['Ceremonies', H.ceremonies],
  ['Nominations', fmt(H.nominations)],
  ['Winners you can stream', `${F.streaming.winners.subscription + F.streaming.winners.free}<small style="font-size:.5em;color:var(--text-muted)"> / ${H.winners}</small>`],
  ['Names for the prize', H.names],
].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

// Original art-deco sunburst (no trophy, no official marks).
(function sunburst() {
  const svg = $('.sunburst');
  const cx = 400, cy = 400, rays = 36;
  let s = '<defs><linearGradient id="ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d8b46a" stop-opacity=".0"/><stop offset=".6" stop-color="#d8b46a" stop-opacity=".18"/><stop offset="1" stop-color="#d8b46a" stop-opacity="0"/></linearGradient></defs>';
  for (let i = 0; i <= rays; i++) {
    const a = Math.PI + (Math.PI * i) / rays, w = i % 2 ? 0.012 : 0.022;
    const p = (ang, r) => `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
    s += `<polygon points="${p(a - w, 60)} ${p(a - w * 2, 420)} ${p(a + w * 2, 420)} ${p(a + w, 60)}" fill="url(#ray)"/>`;
  }
  for (const r of [70, 82]) s += `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#d8b46a" stroke-opacity=".35"/>`;
  svg.innerHTML = s;
})();

// ---------- helpers ----------
function section(id, { title, caption, source }) {
  const el = document.getElementById(id);
  $('[data-title]', el).innerHTML = title;
  $('[data-caption]', el).innerHTML = caption;
  $('[data-source]', el).innerHTML = source;
  return el;
}
function table(el, cols, rows) {
  $('details.table > div', el).innerHTML = `<table><thead><tr>${cols.map((c) => `<th${c[2] ? ' class="num"' : ''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${cols.map((c) => `<td${c[2] ? ' class="num"' : ''}>${c[1](r) ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function legend(el, items) {
  $('.legend', el).innerHTML = items.map(([label, color, shape = '']) => `<span><i class="${shape}" style="background:${color}"></i>${label}</span>`).join('');
}
const charts = [];
function chart(el, label, draw) {
  const box = $('.plot', el);
  const render = () => {
    const width = Math.max(300, box.clientWidth || 860);
    const svg = draw(width, C());
    svg.setAttribute('aria-label', label);
    box.replaceChildren(svg);
  };
  charts.push(render);
  render();
}
let resizeT;
new ResizeObserver(() => { clearTimeout(resizeT); resizeT = setTimeout(() => charts.forEach((f) => f()), 120); }).observe(document.body);
const base = (c, width) => ({
  width, style: { background: 'transparent', color: c.text2, fontSize: '12px', overflow: 'visible' },
  marginLeft: 48, marginRight: 16, marginBottom: 36,
});
const tipStyle = (c) => ({ fill: c.surface2, stroke: c.grid, textPadding: 8, fontSize: 13, lineHeight: 1.3 });

// ---------- 0. names ----------
{
  const E = F.eras;
  const cur = E.at(-1);
  const el = section('names', {
    title: `One prize, ${E.length} names: it has only been “${cur.name}” since ${cur.from_label}`,
    caption: `The top award started life as <b>${E[0].name}</b>. It was renamed ${E.length - 1} times before settling on <b>${cur.name}</b> at the ${ord(cur.from_ceremony)} ceremony. ${F.eras_summary.before_current} winners, from ${t(E[0].first_winner.title)} to ${t(E.at(-2).last_winner.title)}, took home a prize with a different name. At the first ceremony there were even two top prizes: ${t(E[0].first_winner.title)} won Outstanding Picture and ${t('Sunrise')} won Unique and Artistic Picture, which the Academy then dropped.`,
    source: `Source: ${SRC.wiki}, “Category name changes.” Band widths are proportional to the number of ceremonies under each name.`,
  });
  $('.era-strip', el).innerHTML = E.map((e, i) => `<span class="${i === E.length - 1 ? 'now' : ''}" style="flex:${e.ceremonies} 1 0">${i + 1}</span>`).join('');
  $('.era-strip', el).insertAdjacentHTML('afterend', `<div class="era-axis" aria-hidden="true"><span>${E[0].from_label}</span><span>1st ceremony → ${ord(E.at(-1).to_ceremony ?? H.ceremonies)}</span><span>${H.latest_label}</span></div>`);
  $('.eras', el).innerHTML = E.map((e, i) => `<li>
    <div class="no">${i + 1}</div><div class="nm">${e.name}</div>
    <div class="yr">${e.from_label}–${e.to_label} · ${e.ceremonies} ceremon${e.ceremonies === 1 ? 'y' : 'ies'}</div>
    <div class="ex">${e.first_winner.title === e.last_winner.title ? `Winner: <b>${e.first_winner.title}</b>` : `First winner: <b>${e.first_winner.title}</b><br>Last: <b>${e.last_winner.title}</b>`}</div></li>`).join('');
}

// ---------- 0b. envelopes and oddities ----------
{
  const O = F.meta.oddities;
  const el = section('oddities', {
    title: 'Only once did they read out the wrong winner',
    caption: `The 2017 envelope mix-up is the one true on-stage blunder in ${H.ceremonies} ceremonies. The rest of the prize's history has plenty of stranger rules: ${O.length - 1} more below. Tap a film to find it in the where-to-watch list.`,
    source: `Source: ${SRC.wiki}, including its footnotes and “2017 ceremony mistake” section. Counts of nominees computed from the same tables.`,
  });
  const lead = O.find((o) => o.id === 'envelope');
  const rest = O.filter((o) => o !== lead);
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const when = (o) => (Number.isInteger(o.ceremony) && !/,| and | to /.test(o.label) ? `${o.label} films · ${ord(o.ceremony)} ceremony` : o.label);
  const card = (o, cls = '') => `<li class="odd ${cls}"><div class="when">${esc(when(o))}</div><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p>${o.films.length ? `<div class="go">${o.films.map((f) => `<button type="button" data-film="${esc(f)}">${esc(f)} →</button>`).join('')}</div>` : ''}</li>`;
  $('.odd-list', el).innerHTML = (lead ? card(lead, 'lead') : '') + rest.map((o) => card(o)).join('');
  $('.odd-list', el).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-film]'); if (!b) return;
    const film = films.find((r) => r.title === b.dataset.film);
    const search = $('#w-search'); const nom = $('#w-nominees');
    if (film && !film.winner && !nom.checked) { nom.checked = true; nom.dispatchEvent(new Event('change')); }
    search.value = b.dataset.film; search.dispatchEvent(new Event('input'));
    document.getElementById('watch').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}

// ---------- 1. runtime ----------
{
  const R = F.runtime;
  const longer = R.winner_longer_than_field_median;
  const el = section('runtime', {
    title: `Winners run long: ${longer.n} of ${longer.of} outlasted the typical film they beat`,
    caption: `The median winner runs <b>${R.winner_median} minutes</b>, against <b>${R.field_median}</b> for the films that lost. The longest, ${t(R.longest.title)} (${R.longest.year}), runs ${R.longest.runtime} minutes; the shortest, ${t(R.shortest.title)} (${R.shortest.year}), runs ${R.shortest.runtime}.`,
    source: `Source: ${SRC.wiki}; runtimes from TMDB (${R.nominees_with_runtime} of ${H.nominations} films). Lines show the median by decade.`,
  });
  legend(el, [['Winner', C().winner, 'dot'], ['Other nominee', C().field, 'dot'], ['Winners’ median by decade', C().winner, 'line'], ['Nominees’ median by decade', C().text2, 'line']]);
  const data = films.filter((r) => r.runtime);
  const med = R.by_decade.flatMap((d) => [{ x: d.decade, w: d.winner_median, f: d.field_median }, { x: d.decade + 9.99, w: d.winner_median, f: d.field_median }]);
  chart(el, `Scatter of runtime by film year for ${data.length} nominees; winners highlighted.`, (width, c) => Plot.plot({
    ...base(c, width), height: Math.max(300, Math.min(460, width * 0.6)),
    x: { label: null, tickFormat: 'd' }, y: { label: 'Minutes', grid: true, domain: [60, 250] },
    marks: [
      Plot.gridY({ stroke: c.grid, strokeOpacity: 1 }),
      Plot.dot(data.filter((r) => !r.winner), { x: 'film_year', y: 'runtime', r: 3, fill: c.field, fillOpacity: 0.7 }),
      Plot.line(med, { x: 'x', y: 'f', stroke: c.text2, strokeWidth: 2, curve: 'step-after' }),
      Plot.line(med, { x: 'x', y: 'w', stroke: c.winner, strokeWidth: 2, curve: 'step-after' }),
      Plot.dot(data.filter((r) => r.winner), { x: 'film_year', y: 'runtime', r: 4.5, fill: c.winner, stroke: c.surface, strokeWidth: 2 }),
      Plot.text([R.longest], { x: (d) => films.find((r) => r.title === d.title && r.winner).film_year, y: 'runtime', text: (d) => d.title, dx: 8, textAnchor: 'start', fill: c.text, fontSize: 12 }),
      Plot.tip(data, Plot.pointer({ x: 'film_year', y: 'runtime', title: (r) => `${r.title}\n${r.film_year_label} · ${r.winner ? 'Winner' : 'Nominee'}\n${r.runtime} min`, ...tipStyle(c) })),
    ],
  }));
  table(el, [['Decade', (d) => `${d.decade}s`], ['Winners’ median (min)', (d) => d.winner_median, 1], ['All nominees’ median', (d) => d.field_median, 1], ['Films', (d) => d.n, 1]], R.by_decade);
}

// ---------- 2. genres ----------
{
  const G = F.genres;
  const up = G.shift[0], down = G.shift.at(-1);
  const edge = G.edge[0];
  const el = section('genres', {
    title: `Drama never left; ${up.genre.toLowerCase()} moved in and ${down.genre.toLowerCase()} moved out`,
    caption: `${G.ranking[0].genre} is tagged on <b>${G.ranking[0].share_nominees}%</b> of nominees. ${up.genre} went from ${up.early}% of nominees in the ${G.windows.early} to ${up.late}% in the ${G.windows.late}; ${down.genre.toLowerCase()} fell from ${down.early}% to ${down.late}%. The genre with the biggest edge at the finish line is ${edge.genre.toLowerCase()}: ${G.ranking.find((g) => g.genre === edge.genre).share_winners}% of winners against ${G.ranking.find((g) => g.genre === edge.genre).share_nominees}% of nominees.`,
    source: `Source: ${SRC.wiki}; genres from TMDB. A film can carry several genres, so shares don't add to 100%.`,
  });
  const genres = G.ranking.slice(0, 6).map((g) => g.genre);
  const data = G.by_decade.flatMap((d) => genres.map((g) => ({ decade: d.decade, genre: g, share: d.shares[g] ?? 0, n: d.n })));
  legend(el, [['Share of that decade’s nominees', C().s1, 'line']]);
  chart(el, `Small multiples: share of nominees tagged with each of ${genres.join(', ')}, by decade.`, (width, c) => {
    const cols = width < 560 ? 2 : 3;
    return Plot.plot({
      ...base(c, width), height: (Math.ceil(genres.length / cols)) * 150 + 30, marginTop: 20,
      fx: { axis: null }, fy: { axis: null },
      x: { label: null, tickFormat: (d) => `’${String(d).slice(2)}`, ticks: [1930, 1970, 2010] },
      y: { label: null, domain: [0, 1], ticks: [0, 0.5, 1], tickFormat: (d) => `${Math.round(d * 100)}%`, grid: true },
      marks: [
        Plot.frame({ stroke: c.grid }),
        Plot.areaY(data, { x: 'decade', y: 'share', fx: (d) => genres.indexOf(d.genre) % cols, fy: (d) => Math.floor(genres.indexOf(d.genre) / cols), fill: c.s1, fillOpacity: 0.15 }),
        Plot.lineY(data, { x: 'decade', y: 'share', fx: (d) => genres.indexOf(d.genre) % cols, fy: (d) => Math.floor(genres.indexOf(d.genre) / cols), stroke: c.s1, strokeWidth: 2 }),
        Plot.text(genres.map((g, i) => ({ g, i })), { fx: (d) => d.i % cols, fy: (d) => Math.floor(d.i / cols), frameAnchor: 'top-left', dx: 6, dy: 6, text: 'g', fill: c.text, fontWeight: 600, fontSize: 13 }),
        Plot.tip(data, Plot.pointerX({ x: 'decade', y: 'share', fx: (d) => genres.indexOf(d.genre) % cols, fy: (d) => Math.floor(genres.indexOf(d.genre) / cols), title: (d) => `${d.genre}, ${d.decade}s\n${Math.round(d.share * 100)}% of ${d.n} nominees`, ...tipStyle(c) })),
      ],
    });
  });
  table(el, [['Genre', (g) => g.genre], ['Nominees', (g) => g.nominees, 1], ['% of nominees', (g) => `${g.share_nominees}%`, 1], ['% of winners', (g) => `${g.share_winners}%`, 1]], G.ranking);
}

// ---------- 3. box office ----------
{
  const B = F.boxoffice;
  const el = section('boxoffice', {
    title: `The year’s biggest hit won only ${B.top_grosser_won} of ${B.complete_ceremonies} times`,
    caption: `Where every nominee has a box-office figure (${B.complete_ceremonies} of ${B.of} ceremonies), the nominee that earned the most won <b>${B.top_grosser_won} times</b>, about one in four, and that hasn't changed much: ${B.before_1990.top_won} of ${B.before_1990.n} before 1990, ${B.since_1990.top_won} of ${B.since_1990.n} since. Since the field grew in 2009, the typical winner ranks <b>${ord(B.median_rank_since_2009)}</b> of ${B.median_field_since_2009} at the box office. ${B.last_top_grosser_winner ? `The last top grosser to win was ${t(B.last_top_grosser_winner.winner)} (${B.last_top_grosser_winner.label}).` : ''}`,
    source: `Source: ${SRC.wiki}; worldwide gross from TMDB, adjusted to ${B.cpi_base_year} dollars with BLS CPI-U. Ceremonies with any nominee missing a gross are left out.`,
  });
  const data = B.ranks;
  chart(el, `Dot chart: the winner's box-office rank among its fellow nominees for ${data.length} ceremonies.`, (width, c) => Plot.plot({
    ...base(c, width), height: 340,
    x: { label: null, tickFormat: 'd' },
    y: { label: 'Winner’s box-office rank among nominees', reverse: true, domain: [1, 10], ticks: [1, 3, 5, 7, 10], tickFormat: (d) => (d === 1 ? '#1' : `#${d}`), grid: true },
    marks: [
      Plot.gridY({ stroke: c.grid, strokeOpacity: 1 }),
      Plot.ruleY([1], { stroke: c.winner, strokeOpacity: 0.4, strokeDasharray: '4 4' }),
      Plot.ruleX(data, { x: 'film_year', y1: 'field', y2: 1, stroke: c.rule, strokeWidth: 2 }),
      Plot.dot(data, { x: 'film_year', y: 'rank', r: (d) => (d.rank === 1 ? 7.5 : 5), fill: (d) => (d.rank === 1 ? c.winner : c.field), stroke: c.surface, strokeWidth: 1.5, symbol: (d) => (d.rank === 1 ? 'star' : 'circle') }),
      Plot.tip(data, Plot.pointer({ x: 'film_year', y: 'rank', title: (d) => `${d.winner} (${d.label})\nRanked #${d.rank} of ${d.field} at the box office\nTop grosser: ${d.top}`, ...tipStyle(c) })),
    ],
  }));
  const svg = el.querySelector('.plot');
  svg.insertAdjacentHTML('beforebegin', `<div class="legend"><span><i class="dot" style="background:${C().winner}"></i>★ Top grosser won</span><span><i class="dot" style="background:${C().field}"></i>Winner wasn’t the top grosser</span><span><i class="line" style="background:${C().grid};height:4px"></i>Size of the field</span></div>`);
  table(el, [['Year', (d) => d.label], ['Winner', (d) => d.winner], ['Rank', (d) => `${d.rank} of ${d.field}`, 1], ['Winner gross (adj.)', (d) => money(d.winner_adj), 1], ['Top grosser', (d) => d.top]], [...data].reverse());
}

// ---------- 4. map ----------
{
  const K = F.countries;
  const decLast = K.by_decade.at(-1), dec50 = K.by_decade.find((d) => d.decade === 1950);
  const ne = K.non_english_winners;
  const el = section('map', {
    title: `Hollywood still dominates, but ${decLast.any_foreign}% of this decade’s nominees were made partly abroad`,
    caption: `Nominees have come from <b>${K.distinct} countries</b>. In the 1950s, ${dec50.any_foreign}% of nominees had any non-U.S. producing country; in the ${decLast.decade}s it's <b>${decLast.any_foreign}%</b>. ${ne.length ? `Only ${ne.length} winner${ne.length === 1 ? '' : 's'} ${ne.length === 1 ? 'was' : 'were'} in a language other than English: ${list(ne.map((w) => `${t(w.title)} (${w.year})`))}${K.silent_winner_override.length ? `; ${list(K.silent_winner_override.map((w) => `${t(w.title)} (${w.year})`))}, a French production, is silent` : ''}.` : ''} ${K.non_english_nominees} nominees in all were mainly in another language.`,
    source: `Source: ${SRC.wiki}; production countries and original language from TMDB. A film counts once for each producing country.`,
  });
  const eras = [['All years', () => true], ['Before 1960', (d) => d < 1960], ['1960–1999', (d) => d >= 1960 && d < 2000], ['2000 on', (d) => d >= 2000]];
  let current = 0;
  $('#map-controls').innerHTML = eras.map(([l], i) => `<button type="button" aria-pressed="${i === 0}" data-i="${i}">${l}</button>`).join('');
  const land = topojson.feature(world, world.objects.countries);
  const counts = () => {
    const m = new Map();
    for (const [d, cs] of Object.entries(K.counts_by_decade)) if (eras[current][1](+d)) for (const [c, n] of Object.entries(cs)) m.set(c, (m.get(c) ?? 0) + n);
    return m;
  };
  const num2a2 = (id) => countries.numericToAlpha2(String(id).padStart(3, '0'));
  const draw = (width, c) => {
    const m = counts();
    const max = Math.max(...m.values());
    return Plot.plot({
      width, height: width * 0.5, projection: { type: 'equal-earth', domain: { type: 'Sphere' } },
      style: { background: 'transparent', color: c.text2, fontSize: '12px' },
      color: { type: 'log', domain: [1, max], range: [c.seq[1], c.seq[3]], legend: true, label: 'Nominations with that producing country', tickFormat: 'd' },
      marks: [
        Plot.sphere({ stroke: c.grid }),
        Plot.geo(land, { fill: (f) => { const n = m.get(num2a2(f.id)); return n ? n : null; }, stroke: c.surface, strokeWidth: 0.5 }),
        Plot.geo(land, { fill: c.surface2, fillOpacity: (f) => (m.get(num2a2(f.id)) ? 0 : 1), stroke: c.grid, strokeWidth: 0.5 }),
        Plot.tip(land.features.filter((f) => m.get(num2a2(f.id))), Plot.pointer(Plot.centroid({ title: (f) => `${countries.getName(num2a2(f.id), 'en') ?? f.properties.name}\n${m.get(num2a2(f.id))} nomination${m.get(num2a2(f.id)) === 1 ? '' : 's'}`, ...tipStyle(c) }))),
      ],
    });
  };
  chart(el, 'World map shaded by number of Best Picture nominations with each producing country.', draw);
  $('#map-controls').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    current = +b.dataset.i;
    $('#map-controls').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    charts.forEach((f) => f === charts[mapIndex] && f());
  });
  const mapIndex = charts.length - 1;
  table(el, [['Country', (d) => countries.getName(d.country, 'en') ?? d.country], ['Nominations', (d) => d.n, 1]], Object.entries(K.all).map(([country, n]) => ({ country, n })).sort((a, b) => b.n - a.n));
}

// ---------- 5. memory ----------
{
  const M = F.memory;
  const u = M.biggest_upsets[0];
  const through = M.through ? `${M.through.slice(0, 4)}-${M.through.slice(4, 6)}` : '';
  const el = section('memory', {
    title: `Today, the winner is the most-read nominee only ${M.winner_most_read_pct}% of the time`,
    caption: `Counting Wikipedia pageviews since July 2015, the winner is still the most-looked-up film of its year in <b>${M.winner_most_read} of ${M.ceremonies}</b> ceremonies. The widest gap: ${t(u.top)} now draws ${u.ratio}× the readers of ${t(u.winner)}, the film that beat it in ${u.label}. The most-read nominee of all is ${t(M.most_viewed_nominee.title)} (${M.most_viewed_nominee.year}), ${M.most_viewed_nominee.winner ? 'a winner' : 'which lost'}.`,
    source: `Source: Wikimedia pageviews API, English Wikipedia, user traffic, July 2015 to ${through}.`,
  });
  const data = M.rows;
  chart(el, `Dot chart: each winner's rank in Wikipedia pageviews among its year's nominees, for ${data.length} ceremonies.`, (width, c) => Plot.plot({
    ...base(c, width), height: 340,
    x: { label: null, tickFormat: 'd' },
    y: { label: 'Winner’s rank in pageviews among nominees', reverse: true, domain: [1, 12], ticks: [1, 3, 5, 10], tickFormat: (d) => `#${d}`, grid: true },
    marks: [
      Plot.gridY({ stroke: c.grid, strokeOpacity: 1 }),
      Plot.ruleX(data, { x: 'film_year', y1: 'field', y2: 1, stroke: c.rule, strokeWidth: 2 }),
      Plot.dot(data, { x: 'film_year', y: 'rank', r: (d) => (d.rank === 1 ? 7.5 : 5), fill: (d) => (d.rank === 1 ? c.winner : c.field), stroke: c.surface, strokeWidth: 1.5, symbol: (d) => (d.rank === 1 ? 'star' : 'circle') }),
      Plot.tip(data, Plot.pointer({ x: 'film_year', y: 'rank', title: (d) => `${d.winner} (${d.label})\n#${d.rank} of ${d.field} in pageviews\nMost read: ${d.top}`, ...tipStyle(c) })),
    ],
  }));
  el.querySelector('.plot').insertAdjacentHTML('beforebegin', `<div class="legend"><span><i class="dot" style="background:${C().winner}"></i>★ Winner is still the most read</span><span><i class="dot" style="background:${C().field}"></i>A loser draws more readers</span></div>`);
  table(el, [['Year', (d) => d.label], ['Winner', (d) => d.winner], ['Rank', (d) => `${d.rank} of ${d.field}`, 1], ['Winner views', (d) => fmt(d.winner_views), 1], ['Most read', (d) => d.top], ['Its views', (d) => fmt(d.top_views), 1]], [...data].reverse());
}

// ---------- 6. services ----------
{
  const S = F.streaming;
  const asOf = new Date(`${S.as_of}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const el = section('services', {
    title: `${S.leader.name} holds the most winners, ${S.leader.winners} of ${H.winners}`,
    caption: `As of ${asOf}, <b>${S.winners.subscription}</b> winners are included with at least one U.S. subscription, and ${S.free_winners} can be watched free (with ads or a library card). ${S.winners.store} are rent-or-buy only${S.nowhere.length ? `, and ${S.nowhere.length} ${S.nowhere.length === 1 ? 'isn’t' : 'aren’t'} available anywhere: ${list(S.nowhere.map((w) => t(w.title)))}` : ''}.`,
    source: `Streaming data: JustWatch, via the TMDB API, U.S. availability as of ${asOf}. Counts include a service's add-on channels (e.g. through Prime Video or Roku).`,
  });
  const top = S.services.slice(0, 12);
  const max = top[0].winners;
  $('.bars', el).setAttribute('aria-label', `Bar list: winners included with each subscription service. ${top.map((s) => `${s.name} ${s.winners}`).join(', ')}.`);
  $('.bars', el).innerHTML = top.map((s) => `<div class="bar-row">${s.logo ? `<img src="./logos/${s.logo}" alt="" width="36" height="36" loading="lazy">` : `<span class="logo-fallback">${s.name.slice(0, 2)}</span>`}
    <span>${s.name}</span><span class="bar-track"><span class="bar-fill" style="width:${(s.winners / max) * 85}%"></span><span class="bar-val" style="left:${(s.winners / max) * 85}%">${s.winners}</span></span></div>`).join('');
  table(el, [['Service', (s) => s.name], ['Winners included', (s) => s.winners, 1]], S.services);
}

// ---------- 7. where to watch ----------
{
  const S = F.streaming;
  const el = section('watch', {
    title: 'What can you watch tonight?',
    caption: `Tick the services you pay for to see which of the ${H.winners} winners are already included. <b>Gold</b> logos are yours. Free options with ads or a library card are listed too, and rent-or-buy stores as a last resort.`,
    source: `Where-to-watch data: <b>JustWatch</b>, via TMDB, U.S. only, as of ${S.as_of}. Availability changes often; each film links to its full, current listing.`,
  });
  initWatch({ films, services, el });
}

// ---------- credits ----------
$('#credits').innerHTML = `Nominees and winners: ${SRC.wiki}, cross-checked against Wikidata. Film details and where-to-watch data from <a href="https://www.themoviedb.org/">TMDB</a>; this product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability is provided by <a href="https://www.justwatch.com/">JustWatch</a>. Pageviews: Wikimedia. Inflation: U.S. Bureau of Labor Statistics CPI-U via FRED.`;
