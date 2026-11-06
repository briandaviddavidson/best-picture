# The Envelope, Please

A data story about every Academy Award Best Picture nominee and winner since the first ceremony, and where to stream each one tonight. Live at **[briandaviddavidson.com/oscars/](https://briandaviddavidson.com/oscars/)**.

Charts, each with a caption computed from the data:

1. **One prize, five names:** Outstanding Picture → Outstanding Production → Outstanding Motion Picture → Best Motion Picture → Best Picture
1. **Envelopes and oddities:** the 2017 envelope mix-up, two top prizes in 1929, the year with no nominees, announced runners-up, the COVID years, and the changing size of the field. Each one is generated from the Wikipedia article and its footnotes, and links into the where-to-watch list
2. **Winners run long:** runtime of every nominee, winners highlighted
3. **Genres by decade:** what got nominated, and which genres convert to wins
4. **Does box office matter?** Each winner's box-office rank among its nominees
5. **Hollywood goes global:** a world map of producing countries by era
6. **Who remembers the winner?** Wikipedia pageviews today, winner vs. the field
7. **Who streams the winners:** subscription services ranked, with logos
8. **What can you watch tonight?** Tick your services; every winner (and nominee) shows where it streams, free, or rents

Built with Vite and Observable Plot. Static output, no server.

## Run it

```sh
npm install
npm run dev          # uses the committed data in data/processed and data/findings.json
npm run build        # static site in dist/
```

The build uses a relative base path. briandaviddavidson.com builds it with `vite build --base /oscars/` (see that repo's `scripts/build.sh`).

## Refresh the data

```sh
cp .env.example .env            # add your TMDB API Read Access Token
npm run fetch-data              # fills data/raw/ (cached; only missing pieces are fetched)
npm run fetch-data -- --force=tmdb,logos   # refresh streaming availability and logos
npm run data                    # transform + findings → data/processed, data/findings.json, data/quality-report.md
```

Streaming availability changes weekly. Re-run the TMDB step before a deploy and commit `data/processed`, `data/findings.json` and `public/logos`. TMDB asks that cached data be no older than six months.

| Env variable | Needed for | Where to get it |
|---|---|---|
| `TMDB_READ_TOKEN` | `npm run fetch-data` only | themoviedb.org → Settings → API → "API Read Access Token" |

Wikidata, Wikipedia, Wikimedia and FRED need no keys. The script sends a descriptive User-Agent and backs off on HTTP 429.

## Data

- `data/SOURCES.md`: every source, URL and license
- `data/SCHEMA.md`: the processed files
- `data/quality-report.md`: coverage, special cases, gaps, and spot checks
- `docs/BUILD_NOTES.md`: how this was built with Claude, including what went wrong

## Credits and disclaimers

Nominees from Wikipedia (CC BY-SA). Film data from [TMDB](https://www.themoviedb.org/); this product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability from [JustWatch](https://www.justwatch.com/). Pageviews from Wikimedia; CPI from BLS via FRED.

An independent fan project, not affiliated with, endorsed by, or sponsored by the Academy of Motion Picture Arts and Sciences. "Academy Awards" and "Oscar" are the Academy's trademarks and are used here only to describe the award. The design is original: no statuette, no official marks, no posters or stills. Streaming logos belong to their owners and appear only to show where a film is available.
