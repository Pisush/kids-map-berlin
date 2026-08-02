#!/usr/bin/env python3
"""Build a fully self-contained artifact HTML (CSP-safe: no external hosts).

Usage: python3 build_artifact.py <scratchpad_dir>
Reads the app sources (index.html, css/style.css, js/app.js, data/*) plus
vendored Leaflet + basemap GeoJSONs from the scratchpad, writes artifact.html there.
"""
import json, os, re, sys

SCRATCH = sys.argv[1]
ROOT = os.path.dirname(os.path.abspath(__file__))

def rd(p): return open(p, encoding='utf-8').read()

# ---------- basemap processing ----------
def round_coords(o, nd):
    if isinstance(o, list):
        if len(o) >= 2 and all(isinstance(x, (int, float)) for x in o[:2]):
            return [round(o[0], nd), round(o[1], nd)] + o[2:]
        return [round_coords(x, nd) for x in o]
    return o

world = json.load(open(os.path.join(SCRATCH, 'basemap/world.geojson')))
world_feats = []
for f in world['features']:
    world_feats.append({'type': 'Feature',
        'properties': {'name': f['properties'].get('NAME') or f['properties'].get('name') or ''},
        'geometry': {'type': f['geometry']['type'],
                     'coordinates': round_coords(f['geometry']['coordinates'], 3)}})
world_min = {'type': 'FeatureCollection', 'features': world_feats}

bez = json.load(open(os.path.join(SCRATCH, 'basemap/bezirke.geojson')))
bez_feats = []
for f in bez['features']:
    props = f['properties']
    bez_feats.append({'type': 'Feature',
        'properties': {'name': props.get('spatial_alias') or props.get('name') or ''},
        'geometry': {'type': f['geometry']['type'],
                     'coordinates': round_coords(f['geometry']['coordinates'], 4)}})
bez_min = {'type': 'FeatureCollection', 'features': bez_feats}

# ---------- data ----------
places_js = rd(os.path.join(ROOT, 'data/places.js'))
plz_js = rd(os.path.join(ROOT, 'data/plz.js'))
manifest_js = rd(os.path.join(ROOT, 'data/layers_manifest.js'))
events_js = rd(os.path.join(ROOT, 'data/events.js'))

layer_js_parts = []
for fn in sorted(os.listdir(os.path.join(ROOT, 'data/layers'))):
    if not fn.endswith('.js'):
        continue
    src = rd(os.path.join(ROOT, 'data/layers', fn))
    m = re.match(r'window\.(LAYER_\w+) = (.*);\s*$', src, re.S)
    gj = json.loads(m.group(2))
    if isinstance(gj, dict) and gj.get('features'):
        feats = gj['features']
        if len(feats) > 1200:           # thin very dense decorative layers
            feats = feats[::2]
        for ft in feats:
            ft['geometry']['coordinates'] = round_coords(ft['geometry']['coordinates'], 5)
            p = ft.get('properties') or {}
            for k, v in list(p.items()):
                if isinstance(v, str) and len(v) > 160:
                    p[k] = v[:157] + '…'
        gj = {'type': 'FeatureCollection', 'features': feats}
    layer_js_parts.append(f'window.{m.group(1)} = ' + json.dumps(gj, ensure_ascii=False, separators=(",", ":")) + ';')
layers_js = '\n'.join(layer_js_parts)

# ---------- markup: reuse the app's body ----------
html = rd(os.path.join(ROOT, 'index.html'))
body = re.search(r'<body>\s*(.*?)\s*<script', html, re.S).group(1)
body = body.replace(
    'built with Leaflet &amp; OpenStreetMap.',
    'schematic basemap (Natural Earth &amp; Berlin open data) — links open live Google Maps.')

# ---------- app js: adapt for CSP ----------
app = rd(os.path.join(ROOT, 'js/app.js'))

# 1) replace raster tiles with the embedded vector basemap + theme-aware styling
tile_block = re.search(r"  L\.tileLayer\(.*?\)\.addTo\(map\);\n", app, re.S).group(0)
basemap_block = """  // vector basemap (CSP-safe: no external tiles)
  const css = () => getComputedStyle(document.documentElement);
  let landLayer, bezLayer;
  function paintBasemap() {
    const landFill = css().getPropertyValue('--map-land').trim() || '#efeae0';
    const landLine = css().getPropertyValue('--map-line').trim() || '#c9c2b4';
    const bg = css().getPropertyValue('--map-bg').trim() || '#dcE8ee';
    document.getElementById('map').style.background = bg;
    if (landLayer) map.removeLayer(landLayer);
    if (bezLayer) map.removeLayer(bezLayer);
    landLayer = L.geoJSON(window.BASE_WORLD, {
      style: { color: landLine, weight: 0.7, fillColor: landFill, fillOpacity: 1 },
      interactive: false,
    }).addTo(map);
    bezLayer = L.geoJSON(window.BASE_BEZIRKE, {
      style: { color: landLine, weight: 1.1, fillColor: landFill, fillOpacity: 0.001, dashArray: '3 3' },
      interactive: false,   // never steal taps from markers; district names aren't worth a tooltip
    }).addTo(map);
    landLayer.bringToBack();
  }
  paintBasemap();
  new MutationObserver(paintBasemap).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintBasemap);
"""
app = app.replace(tile_block, basemap_block)

# 2) overlays are inlined — no script injection
app = app.replace("""    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = `data/layers/${def.file}`;
      s.onload = () => {""", """    return new Promise(resolve => {
      {""")
app = app.replace("""      };
      s.onerror = () => resolve(null);
      document.body.appendChild(s);
    });""", """      }
    });""")

# 3) drop the live-weather fetch (external host → CSP-blocked)
weather = re.search(r"  // ---------- live weather suggestion.*?\.catch\(\(\) => \{\}\);\n", app, re.S).group(0)
app = app.replace(weather, "")

# ---------- css: tokens for both themes + leaflet ----------
style = rd(os.path.join(ROOT, 'css/style.css'))
root_block = re.search(r':root \{.*?\}\n', style, re.S).group(0)
tokens_light = """:root {
  --bg: #fbf9f4;
  --panel: #f3efe6;
  --ink: #2a2733;
  --muted: #6f6a7a;
  --accent: #e85d75;
  --accent2: #2f9e8f;
  --chip: #ece7db;
  --chip-on: #ffd166;
  --border: #e3ddd0;
  --shadow: 0 2px 10px rgba(40,30,20,.10);
  --map-bg: #d8e6ec;
  --map-land: #efeae0;
  --map-line: #c6bfae;
  --note-bg: #fff4d6;
  --warn-bg: #ffe2d6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #211f29; --panel: #2a2735; --ink: #edeaf2; --muted: #a49fb2;
    --accent: #f0718a; --accent2: #43b3a3; --chip: #37334a; --chip-on: #d9a520;
    --border: #3a364c; --shadow: 0 2px 10px rgba(0,0,0,.45);
    --map-bg: #1a2430; --map-land: #2c2a3a; --map-line: #4a4560;
    --note-bg: #3d3524; --warn-bg: #46302a;
  }
}
:root[data-theme="dark"] {
  --bg: #211f29; --panel: #2a2735; --ink: #edeaf2; --muted: #a49fb2;
  --accent: #f0718a; --accent2: #43b3a3; --chip: #37334a; --chip-on: #d9a520;
  --border: #3a364c; --shadow: 0 2px 10px rgba(0,0,0,.45);
  --map-bg: #1a2430; --map-land: #2c2a3a; --map-line: #4a4560;
  --note-bg: #3d3524; --warn-bg: #46302a;
}
:root[data-theme="light"] {
  --bg: #fbf9f4; --panel: #f3efe6; --ink: #2a2733; --muted: #6f6a7a;
  --accent: #e85d75; --accent2: #2f9e8f; --chip: #ece7db; --chip-on: #ffd166;
  --border: #e3ddd0; --shadow: 0 2px 10px rgba(40,30,20,.10);
  --map-bg: #d8e6ec; --map-land: #efeae0; --map-line: #c6bfae;
  --note-bg: #fff4d6; --warn-bg: #ffe2d6;
}
"""
style = style.replace(root_block, tokens_light)
# retie hard-coded surfaces to tokens so dark mode holds everywhere
style = style.replace('background: #fff8e1;', 'background: var(--note-bg);')
style = style.replace('.pop-badge.warn { background: #ffe2d6; }', '.pop-badge.warn { background: var(--warn-bg); }')
style = style.replace('.seg button { flex: 1; border: none; background: #fff;', '.seg button { flex: 1; border: none; background: var(--bg); color: var(--ink);')
style = style.replace('.travel-row select { padding: 6px; border: 1.5px solid var(--border); border-radius: 8px; background: #fff; }',
                      '.travel-row select { padding: 6px; border: 1.5px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--ink); }')

extra_css = """
body { font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif; }
#brand h1 { font-family: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif; letter-spacing: -.01em; }
input, select, button { font-family: inherit; color: var(--ink); }
#query, .age-input, .travel-row input { background: var(--bg); }
#weather-banner { display: none; }
.r-dist, .pop-meta, .travel-row { font-variant-numeric: tabular-nums; }
.leaflet-container { font: inherit; }
.leaflet-popup-content-wrapper, .leaflet-popup-tip { background: var(--bg); color: var(--ink); box-shadow: var(--shadow); }
.leaflet-bar a { background: var(--bg); color: var(--ink); border-color: var(--border); }
.leaflet-tooltip { background: var(--panel); color: var(--muted); border-color: var(--border); }
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: rgba(255,209,102,.5); }
.marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
  background-color: #ffd166; color: #4a3a00; font-weight: 700; font-family: inherit;
}
:focus-visible { outline: 2px solid var(--accent2); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { #sidebar { transition: none; } }
"""

# ---------- assemble ----------
V = lambda f: rd(os.path.join(SCRATCH, 'vendor', f))
parts = [
    '<title>Kids Berlin Map</title>',
    '<style>', V('leaflet.css'), V('mc.css'), V('mcd.css'), style, extra_css, '</style>',
    body,
    '<script>', V('leaflet.js'), '</script>',
    '<script>', V('markercluster.js'), '</script>',
    '<script>',
    'window.BASE_WORLD = ' + json.dumps(world_min, ensure_ascii=False, separators=(',', ':')) + ';',
    'window.BASE_BEZIRKE = ' + json.dumps(bez_min, ensure_ascii=False, separators=(',', ':')) + ';',
    places_js, plz_js, manifest_js, events_js, layers_js,
    '</script>',
    '<script>', app, '</script>',
]
out = os.path.join(SCRATCH, 'artifact.html')
open(out, 'w', encoding='utf-8').write('\n'.join(parts))
print(f'wrote {out}: {os.path.getsize(out)//1024} KB')
