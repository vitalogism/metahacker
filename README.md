<img src="assets/icon.svg" width="64" height="64" alt="">

# metahacker

**The Hacker-X Seismological Survey.** Every "Hacker News, but for X" since 2007, plotted as an earthquake catalog, with an Omori-law forecast for the HackerTube aftershock sequence.

Live: **https://vitalogism.github.io/metahacker/**

## Post it to Hacker News

[Submit to HN](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fvitalogism.github.io%2Fmetahacker%2F&t=Show%20HN%3A%20Metahacker%20%E2%80%93%20a%20seismograph%20for%20the%20HackerTube%20aftershock%20sequence) opens the form with the URL and title filled in.

**Title** (74 characters):

> Show HN: Metahacker – a seismograph for the HackerTube aftershock sequence

Alternates:

> Show HN: Every "Hacker News, but for X" since 2007, as an earthquake catalog
>
> Show HN: HackerTube, but for HackerTube-but-fors, with an Omori-law forecast

**First comment.** Post this yourself right after submitting, and update the numbers from the live page first:

> Since HackerTube hit the front page on Oct 31, I've counted 35 "HackerTube, but for X" posts in about 60 hours: books, Wikipedia, papers, movies, repos, Amazon products, words, three separate TikToks, and two aggregators of the aggregators.
>
> So I built the next one down: a USGS-style seismological survey of every "Hacker News, but for X" since 2007. HackerTube is the mainshock at M 7.9 (magnitude = 2.3 log10(points + 1)). The page fits an Omori–Utsu decay to the aftershocks by maximum likelihood and forecasts the rest. Current fit status: not decaying yet. At the fitted rate, HN returns to its background rate of one Hacker-X post every ~40 days sometime around 2032.
>
> Also in there: a live helicorder drum, 20 years of history sorted into five fault systems (But-For, Mentioned-On, Reskin, Ouroboros, and Bedrock), and a "Did you feel it?" Mercalli scale. Intensity XI is "Hacker News is submitted to Hacker News."
>
> A GitHub Action re-reads points every six hours and picks up new clones automatically. If I missed yours, open an issue and it goes in the catalog.

## How it works

- `index.html`, `assets/`: a static page with no build step and no dependencies. The drums and charts are hand-drawn SVG.
- `data/events.json`: the catalog. Events up to Nov 3, 2026 were classified and annotated by hand; later ones are added by the script and marked `"reviewed": false`.
- `scripts/update.py`: refreshes points and comments from the [HN Search API](https://hn.algolia.com/api) and finds new "Hacker X" posts by title pattern. Standard library only.
- `.github/workflows/update.yml`: runs the script every six hours and commits when something moved.

Run it locally:

```sh
python3 scripts/update.py      # optional: refresh the data
python3 -m http.server 8000    # then open http://localhost:8000
```

### Reviewing an auto-detected event

Find it in `data/events.json`, check the `fault`, write a `short` label and a one-line `felt` report, and set `"reviewed": true`. To drop a false positive, delete the event and add its id to `ignore` so the script doesn't bring it back.

## Credits

Data from Hacker News via the Algolia HN Search API. Type is [Public Sans](https://public-sans.digital.gov/) and [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono), both SIL Open Font License. The intensity colors follow the USGS ShakeMap scale.

Satire. Not affiliated with the USGS, Y Combinator, or any tectonic plate. Every project in the catalog is someone's weekend, and we like all of them.
