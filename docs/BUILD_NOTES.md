# Build notes

## Goal and starting prompt

> I want to build a data story of the Oscar best picture winners since the start of the Oscars. 3 things that need to happen.
> 1. It should be deployed into this repo: git@github.com:briandaviddavidson/best-picture.git, and then deployed to briandaviddavidson.com/oscars/
> 2. The branding should be similar to the Oscars, but not the same due to copyright issues that may arise
> 3. If the movie can be streamed, that streaming service should be highlighted (with the streaming logo if possible)

Built with Claude using the `data-story` skill (plan → source → fetch → transform → findings → charts → ship). Follow-up requests: show **every** U.S. option (subscription, free, rent/buy), include all nominees rather than only winners, and highlight the award's name changes.

## Time spent (Nov 6, 2026, Eastern)

| Phase | Time |
|---|---|
| Questions, checking how briandaviddavidson.com deploys, source checks, plan | 08:50–09:01 (~11 min) |
| Scaffold, fetch script, first data pull on Brian's Mac | 09:01–09:06 |
| Rework of the primary source (see below), rate-limit fixes, second pull | 09:06–09:13 |
| Transform, findings, spot checks | ~5 min, overlapping the pulls |
| Theme, eight sections, the where-to-watch explorer | ~15 min, mostly overlapping the pulls |
| Visual review at desktop and phone widths, fixes, docs | ~10 min |

About 45 minutes from prompt to a deployable build.

## What the AI got wrong, and how it was caught

1. **Wikidata as the primary list.** The plan named Wikidata as the source of nominees. The first pull returned 1,237 "films" for 621 nominations: Wikidata also records Best Picture nominations on the *producers*. This was caught by comparing the count with the Wikipedia article's own "621 films nominated and 98 winners." Fix: the Wikipedia nominee tables became the primary list, and Wikidata only supplies IDs plus an independent check of the winners. All 98 agree.
2. **A one-character table quirk.** The parser first found 97 winners: the 54th ceremony row begins `|| '''''Chariots of Fire'''''`. This was caught by the "exactly one winner per ceremony" check. Fix: accept one or more pipes.
3. **Redirected article titles.** Five films (*12 Angry Men*, *The Heiress*, *Lost in Translation* and two others) showed as "not matched to TMDB." They had been matched, but under the redirect-resolved title. This was caught by the quality report. Fix: join on the canonical title.
4. **The Artist counted as a French-language winner.** TMDB gives its original language as French because it's a French production, but it is silent. This was caught while reading the computed caption. Fix: an explicit, documented override.
5. **CPI base year.** October 2025 CPI was never published (federal shutdown), so a "12 months required" rule silently dropped 2025 and with it the 2025 nominees' adjusted grosses. Fix: accept years with 10 or more months, and list partial years in the quality report.
6. **Running against rate limits.** The first pageview pull covered all 1,173 Wikidata titles, producers included, with 4-way concurrency, and Wikimedia began answering 429. Fix: only the 621 films, 2-way concurrency, honouring `Retry-After`, and saving progress so a stopped run resumes.
7. **Logos saved as `.jpg` that were really PNGs, plus lazy-loaded images** that looked missing in full-page screenshots. Both were caught by looking at the rendered page.
8. **Caption wording that the numbers didn't support.** A draft box-office title implied a change since 1990. The numbers show the top grosser wins about one time in four both before and after (5 of 19 vs. 8 of 33), so the title now says that.

## Key decisions and trade-offs

- **Fetch on the user's machine.** The cloud sandbox, and the sandbox on the Mac, can't reach Wikidata or TMDB. So Claude wrote an idempotent, cached `npm run fetch-data`, Brian ran it once in his own Terminal, and everything after that (transform, findings, charts, build) ran from the cached raw files. Processed data is committed, so the site build needs no keys or network.
- **Box office is only compared within complete fields.** TMDB revenue is missing for 127 nominees, mostly before 1970. Rather than guess, the box-office chart uses only the 52 ceremonies where every nominee has a gross.
- **Pageviews as "memory."** They measure today's interest (2015 on), not reception at the time. The caption says so.
- **Streaming providers are folded.** JustWatch lists tiers and resold channels separately ("Paramount Plus Essential," "Paramount+ Amazon Channel," "Paramount+ Roku Premium Channel"). These are folded into the service a viewer recognises, keeping a `via` note. Live-TV bundles (fuboTV, YouTube TV, Philo) and library services (Kanopy, Hoopla) get their own groups, so "free" and "subscription" stay honest.
- **Branding.** The design uses black, champagne gold and an original art-deco sunburst, with no statuette silhouette, no Academy wordmark, and no posters or stills. The title is a generic phrase, *The Envelope, Please*. The footer states non-affiliation, and TMDB and JustWatch attribution are shown wherever their data appears.
- **Color.** Gold is used for winners and neutral gray for the field. The data colors were checked with the dataviz palette validator against the dark chart surface. A brighter "champagne" gold failed the lightness band, so it is used only for page chrome. Identity never relies on color alone: winners also get stars, borders and labels.
- **Static map.** It uses an SVG Equal Earth projection rather than Google Maps, so the page needs no API key.
