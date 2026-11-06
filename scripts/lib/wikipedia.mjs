// Parse the nominee tables and the category-name list out of the wikitext of
// "Academy Award for Best Picture". Used by fetch-data (to know which films to
// look up) and transform (to build the dataset). Anything the parser can't read
// is returned in `problems`, never dropped silently.

const strip = (s) => s
  .replace(/\{\{efn[^{}]*(\{\{[^{}]*\}\}[^{}]*)*\}\}/g, '')
  .replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
  .replace(/\{\{small\|([^{}]*)\}\}/g, '$1')
  .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1')
  .replace(/'{2,}/g, '').replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim();

export function parseNominees(wikitext) {
  const films = [];
  const problems = [];
  // Only the decade sections hold the nominee tables.
  const sections = wikitext.split(/\n===(\d{4}s)===\n/);
  let current = null;
  for (let s = 1; s < sections.length; s += 2) {
    const decade = sections[s];
    const body = sections[s + 1].split(/\n\|\}/)[0];
    const rows = body.split(/\n\|-[^\n]*\n/).slice(1);
    for (const row of rows) {
      const lines = row.split('\n').filter((l) => l.trim());
      let i = 0;
      if (lines[0]?.startsWith('! width')) continue; // column headers
      if (lines[0]?.startsWith('!')) {
        const h = lines[0];
        const label = h.match(/\[\[\d{4} in film\|([^\]]+)\]\]/)?.[1];
        const ord = h.match(/\[\[(\d+)(?:st|nd|rd|th) Academy Awards\|/)?.[1];
        if (!label || !ord) { problems.push({ kind: 'unparsed_year_header', decade, text: h.slice(0, 160) }); current = null; continue; }
        const notes = [...h.matchAll(/\{\{efn(?:\|name=[^|]*)?\|([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}/g)].map((m) => strip(m[1]));
        current = { ceremony: Number(ord), film_year_label: label, decade, notes };
        i = 1;
      }
      if (!current) continue;
      const filmLine = lines[i];
      const creditLine = lines[i + 1] ?? '';
      if (!filmLine?.startsWith('|')) { problems.push({ kind: 'unparsed_row', ceremony: current.ceremony, text: row.slice(0, 160) }); continue; }
      const winner = /^\|+\s*'''''/.test(filmLine); // one row uses '||' before the title
      const link = filmLine.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
      if (!link) { problems.push({ kind: 'film_without_link', ceremony: current.ceremony, text: filmLine }); continue; }
      const rowNotes = [...row.matchAll(/\{\{efn(?:\|name=[^|]*)?\|([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}/g)].map((m) => strip(m[1]));
      films.push({
        ceremony: current.ceremony,
        film_year_label: current.film_year_label,
        article: link[1].trim(),
        title: strip(link[2] ?? link[1]),
        winner,
        credits: strip(creditLine.replace(/^\|\s*/, '')),
        notes: rowNotes,
        year_notes: current.notes,
      });
    }
  }
  return { films, problems };
}

// "* [[1st Academy Awards|1927/28]]–[[2nd Academy Awards|1928/29]]: Academy Award for Outstanding Picture"
export function parseCategoryNames(wikitext) {
  const sec = wikitext.split('===Category name changes===')[1]?.split(/\n==/)[0] ?? '';
  return [...sec.matchAll(/^\*\s*\[\[(\d+)\w\w Academy Awards\|([^\]]+)\]\](?:–\[\[(\d+)\w\w Academy Awards\|([^\]]+)\]\]|–present)?:\s*Academy Award for (.+)$/gm)]
    .map((m) => ({ from_ceremony: Number(m[1]), from_label: m[2], to_ceremony: m[3] ? Number(m[3]) : null, to_label: m[4] ?? 'present', name: m[5].trim() }));
}
