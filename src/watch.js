// "What can you watch tonight?" — every winner (optionally every nominee) with its
// U.S. streaming options. The viewer's ticked services are highlighted in gold and
// remembered in this browser (localStorage, best effort).

const KEY = 'best-picture:my-services';
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return new Set(); } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* storage unavailable */ } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function initWatch({ films, services, el }) {
  const logo = new Map(services.map((s) => [s.name, s.logo]));
  const mine = load();

  // Services offered as pickers: subscription + live services that carry at least 3 winners.
  const count = new Map();
  for (const f of films) if (f.winner) for (const s of [...(f.watch?.subscription ?? []), ...(f.watch?.live ?? [])]) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  const pickers = [...count].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([name]) => name);

  const box = el.querySelector('#w-services');
  box.innerHTML = pickers.map((name) => `<label class="svc">
      <input type="checkbox" value="${esc(name)}" ${mine.has(name) ? 'checked' : ''}>
      <span class="tick" aria-hidden="true"></span>
      ${logo.get(name) ? `<img src="./logos/${logo.get(name)}" alt="" width="32" height="32" loading="lazy">` : ''}${esc(name)}</label>`).join('');

  const search = el.querySelector('#w-search');
  const nomineesBox = el.querySelector('#w-nominees');
  const listEl = el.querySelector('#w-list');
  const summary = el.querySelector('#w-summary');
  let limit = 40;

  const icon = (s, hl) => {
    const id = logo.get(s.name);
    const label = `${s.name}${s.via ? ` (via ${s.via})` : ''}`;
    return id ? `<span class="${hl ? 'hl' : ''}" title="${esc(label)}"><img src="./logos/${id}" alt="${esc(label)}" width="30" height="30" loading="lazy"></span>`
      : `<span class="${hl ? 'hl' : ''}">${esc(label)}</span>`;
  };
  const group = (cls, label, items, hlSet) => (items?.length ? `<span class="grp ${cls}"><span class="lbl">${label}</span>${items.map((s) => icon(s, hlSet?.has(s.name))).join('')}</span>` : '');

  function whereHtml(f) {
    const w = f.watch;
    if (!w) return '<span class="none">No U.S. availability data</span>';
    const stores = [...new Map([...(w.rent ?? []), ...(w.buy ?? [])].map((s) => [s.name, s])).values()].slice(0, 4);
    const parts = [
      group('stream', 'Stream', [...w.subscription, ...w.live], mine),
      group('free', 'Free', [...w.free, ...w.library]),
      group('store', w.rent?.length ? 'Rent/buy' : 'Buy', stores),
    ].filter(Boolean);
    return parts.length ? parts.join('') : '<span class="none">Not streaming, renting or selling in the U.S. right now</span>';
  }

  // Film-specific notes only (skip footnotes that apply to every film that year).
  const yearCount = new Map();
  for (const f of films) for (const n of f.notes) yearCount.set(n, (yearCount.get(n) ?? 0) + 1);
  const noteFor = (f) => f.notes.filter((n) => yearCount.get(n) === 1).join(' ');

  function render() {
    const q = fold(search.value.trim());
    const pool = films.filter((f) => nomineesBox.checked || f.winner);
    const shown = pool.filter((f) => !q || fold(f.title).includes(q) || f.film_year_label.includes(q));
    const onMine = (f) => [...(f.watch?.subscription ?? []), ...(f.watch?.live ?? [])].some((s) => mine.has(s.name));
    // Films on your services first, then newest first.
    shown.sort((a, b) => (mine.size ? onMine(b) - onMine(a) : 0) || b.ceremony - a.ceremony || b.winner - a.winner);
    const winnersOnMine = films.filter((f) => f.winner && onMine(f)).length;
    summary.innerHTML = mine.size
      ? `<b>${winnersOnMine}</b> of ${films.filter((f) => f.winner).length} winners are included with ${mine.size === 1 ? 'your service' : `your ${mine.size} services`}. They're listed first.`
      : `Showing ${shown.length} ${nomineesBox.checked ? 'films' : 'winners'}, newest first.`;
    listEl.innerHTML = shown.slice(0, limit).map((f) => `<li class="film${f.winner ? ' winner' : ''}">
      <div class="yr">${esc(f.film_year_label)}<small>${esc(f.category_name ?? '')}</small></div>
      <div><h3>${f.watch_link ? `<a href="${esc(f.watch_link)}" target="_blank" rel="noopener" style="color:inherit">${esc(f.title)}</a>` : esc(f.title)}<span class="badge${f.winner ? '' : ' nom'}">${f.winner ? 'Winner' : 'Nominee'}</span></h3>
      <div class="meta">${[f.runtime ? `${f.runtime} min` : null, f.genres.slice(0, 3).join(', ') || null].filter(Boolean).map(esc).join(' · ')}</div></div>
      ${noteFor(f) ? `<div class="note">${esc(noteFor(f))}</div>` : ''}
      <div class="where">${whereHtml(f)}</div></li>`).join('')
      + (shown.length > limit ? `<li><button type="button" class="more">Show ${Math.min(40, shown.length - limit)} more of ${shown.length - limit}</button></li>` : '');
  }

  box.addEventListener('change', (e) => {
    if (!e.target.matches('input')) return;
    e.target.checked ? mine.add(e.target.value) : mine.delete(e.target.value);
    save(mine); render();
  });
  search.addEventListener('input', () => { limit = 40; render(); });
  nomineesBox.addEventListener('change', () => { limit = 40; render(); });
  listEl.addEventListener('click', (e) => { if (e.target.closest('.more')) { limit += 40; render(); } });
  render();
}
