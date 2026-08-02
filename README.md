# 🎈 Kids Berlin Map

**Live: https://pisush.github.io/kids-map-berlin/**

A web map of things to do with kids in & around Berlin (plus family vacation destinations),
built from two personal Google Maps saved lists:

- **Berlin with kids** (429 places)
- **Family friendly vacation** (524 places)

Every place was auto-categorized (age range, type, indoor/outdoor, rainy/hot-day fit,
AC, free/paid + price range, duration, season) and Hebrew notes were translated.

## Run it

```bash
cd kids-berlin-map
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static file server works; opening `index.html` directly also works in most browsers
since data ships as `.js` files, but a server is more reliable for the overlay layers.)

## Features

- **Ask the map** — free-text box: *"what do i do on this hot day with a 2 yo and no car"*
  → parsed into filters (ages, weather, transport, type, budget) shown as chips.
- **3 kids-age fields** — places must suit every filled-in age (±1 year tolerance).
- **Scope** — Berlin / day trips (≤150 km) / vacations, or everything.
- **Travel time + method** — max minutes by car / public transport / bike / foot
  (straight-line distance × effective speed estimate); every popup shows a rough
  travel-time estimate and a **Google Maps directions link** in your chosen mode.
- **Considerations** — rainy-day, hot-day (water/shade/AC), must-have-AC, indoor/outdoor,
  minimize tick (Zecken) exposure, oak-processionary-moth (EPS) season awareness.
  Risky outdoor places get warning badges in season.
- **Price** — free / € / €€ / €€€ filters; known prices shown per place.
- **Map layers** — official open-data overlays (cool places, drinking fountains,
  water playgrounds, FSME tick-risk districts, EPS infestation data — whatever the
  research agents could source; see the layer info links for attribution).
- **Events & tips** — one-off kids events scraped from HIMBEER / berlin.de etc. with
  permanent links to the best event calendars.
- **Live weather nudge** — checks today's Berlin forecast (open-meteo) and offers
  hot-day/rainy-day mode automatically.

## Rebuild data

Raw extraction + agent categorization live in the session scratchpad. To re-merge:

```bash
python3 build_data.py <scratchpad-dir>
```

`data/places.js`, `data/layers_manifest.js`, `data/layers/*.js`, `data/events.js`
are generated; don't edit by hand.
