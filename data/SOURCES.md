# Sources

Retrieved 2026-11-06 with `npm run fetch-data` (see `data/raw/fetch-log.json` after a run; raw files are not committed).

| Source | What it supplies | URL | Terms / license |
|---|---|---|---|
| Wikipedia, "Academy Award for Best Picture" (revision 1383091331) | **Primary list**: all 621 nominees and 98 winners by ceremony, credited producers/studios, the five names of the category, footnotes on the 2nd and 93rd–94th ceremonies | https://en.wikipedia.org/wiki/Academy_Award_for_Best_Picture (via the MediaWiki API) | CC BY-SA 4.0 |
| Wikipedia page props | Each nominee's article → Wikidata item (follows redirects) | https://en.wikipedia.org/w/api.php | CC BY-SA 4.0 |
| Wikidata | TMDB movie ID (P4947), IMDb ID (P345), publication date (P577) per film; and Wikidata's own Best Picture win statements, used only as a cross-check. Property IDs are verified against their English labels on every run, and the award item is looked up by label (it resolved to Q102427) | https://query.wikidata.org/ | CC0 |
| TMDB API | Runtime, genres, production countries, original language, budget, revenue (worldwide gross), and U.S. watch providers | https://developer.themoviedb.org/ | TMDB API terms: attribution required ("This product uses the TMDB API but is not endorsed or certified by TMDB"); cache no longer than 6 months |
| JustWatch (via TMDB) | U.S. streaming, free, rent and buy availability, and provider logos | https://www.justwatch.com/ | Attribution to JustWatch required wherever availability is shown |
| Wikimedia Pageviews API | Monthly English Wikipedia user pageviews per film, July 2015 to the last full month | https://wikimedia.org/api/rest_v1/ | CC0 |
| FRED, series CPIAUCNS (from BLS) | CPI-U, not seasonally adjusted, used to convert box office to current dollars | https://fred.stlouisfed.org/series/CPIAUCNS | Public domain (BLS) |
| Academy Awards Database | Not fetched (no API). Used only to confirm the spot checks by hand | https://awardsdatabase.oscars.org/ | — |

Provider logos in `public/logos/` are the services' trademarks, shown only to indicate where a film is available, as JustWatch and TMDB display them. Refresh them with `npm run fetch-data -- --force=logos`.
