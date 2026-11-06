# Processed data schema

All files are written by `npm run transform` (and `findings.json` by `npm run findings`).

## `processed/films.json` — one row per Best Picture nomination (621 rows)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `<ceremony>-<wikipedia-article-slug>` |
| `ceremony` | int | 1 = 1st Academy Awards (1929) … 98 = 98th (2026) |
| `film_year` | int | Eligibility year. Split years map to the later year (1927/28 → 1928); the COVID-extended 2020/21 maps to 2020 |
| `film_year_label` | string | As the Academy writes it: "1927/28", "1962", "2020/21" |
| `decade` | int | From `film_year` |
| `category_name` | string | The award's name that year: Outstanding Picture, Outstanding Production, Outstanding Motion Picture, Best Motion Picture, Best Picture |
| `title` | string | Display title from the Wikipedia table |
| `winner` | bool | Exactly one per ceremony |
| `credits` | string | Studio and/or credited producers |
| `notes` | string[] | Footnotes and special cases (e.g. the 2017 envelope error) |
| `wikipedia`, `wikidata`, `tmdb_id`, `imdb_id` | string/int | Identifiers |
| `release_date` | string | TMDB primary release date |
| `runtime` | int | Minutes (TMDB) |
| `genres` | string[] | TMDB genres, several per film |
| `countries` | string[] | ISO 3166-1 alpha-2 production countries (TMDB) |
| `original_language` | string | ISO 639-1; `xx` = silent (override for The Artist) |
| `revenue`, `budget` | int\|null | Nominal USD from TMDB; null when TMDB has 0 |
| `revenue_adj` | int\|null | `revenue` in CPI base-year dollars (see meta) |
| `tmdb_rating`, `tmdb_votes` | number | Rating only when ≥ 50 votes |
| `pageviews` | int | English Wikipedia user pageviews since July 2015 |
| `watch` | object\|null | U.S. availability, grouped: `subscription`, `live` (live-TV bundles), `free` (ad-supported), `library` (Kanopy, Hoopla), `rent`, `buy`. Each item `{ name, via }`; `via` names an add-on channel route (Amazon, Roku, Apple TV) |
| `watch_link` | string | TMDB/JustWatch page with the current listing |

## `processed/services.json`
`{ name, logo, kinds, priority }`: canonical service name (variants such as "Netflix Standard with Ads" or "HBO Max Amazon Channel" folded in by `scripts/providers.mjs`), the logo file name in `public/logos/`, and TMDB display priority.

## `processed/eras.json`
The category's names with first/last ceremony and labels.

## `processed/meta.json`
Build date, Wikipedia revision, streaming snapshot date, pageviews end month, CPI base year, special cases.

## `findings.json`
Every number used in a title or caption, grouped by chart, plus the spot checks.
