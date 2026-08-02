#!/usr/bin/env python3
"""Merge raw places + agent categorizations + layers + events into the app's data/ files.

Usage: python3 build_data.py <scratchpad_dir>
Idempotent — rerun whenever agent results change.
"""
import json, os, sys, glob, unicodedata

SCRATCH = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
os.makedirs(os.path.join(DATA, 'layers'), exist_ok=True)

# ---- places + categorization ----
places = json.load(open(os.path.join(SCRATCH, 'all_places.json')))
cats = {}
for f in sorted(glob.glob(os.path.join(SCRATCH, 'results', 'chunk_*_result.json'))):
    try:
        for c in json.load(open(f)):
            if isinstance(c, dict) and c.get('id'):
                cats[c['id']] = c
    except Exception as e:
        print(f'WARN: could not parse {f}: {e}')

# Non-activities (QA findings): medical practices, dentists, a daycare, a supermarket,
# a car park, address-only stubs, and one adults-only club. Not things to do with kids.
BLOCKLIST = {'p636', 'p347', 'p015', 'p488', 'p620', 'p308', 'p005', 'p419',
             'p032', 'p042', 'p816', 'p678'}

def norm_name(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', (s or '').lower()) if ch.isalnum())

merged, missing = [], []
for p in places:
    c = cats.get(p['id'])
    if not c:
        missing.append(p['id'])
        c = {}
    if p['id'] in BLOCKLIST or (c.get('age_min') or 0) >= 18:
        continue
    merged.append({
        'id': p['id'],
        'name': p['name'],
        'name_en': c.get('name_en') or p['name'],
        'address': p.get('address') or '',
        'lat': p['lat'], 'lng': p['lng'],
        'dist_km': p['dist_km'],
        'source': p['source'],
        'note': p.get('note') or '',
        'note_en': c.get('note_en') or '',
        'types': c.get('types') or ['other'],
        'age_min': c.get('age_min', 0), 'age_max': c.get('age_max', 17),
        'setting': c.get('setting') or 'mixed',
        'rainy_ok': bool(c.get('rainy_ok')),
        'hot_ok': bool(c.get('hot_ok')),
        'ac': c.get('ac', None),
        'cost': c.get('cost'),
        'price_note': c.get('price_note') or '',
        'seasonal': c.get('seasonal') or '',
        'duration': c.get('duration') or '',
        'desc': c.get('desc') or '',
        'confidence': c.get('confidence') or 'low',
    })

# ---- de-duplicate: same normalized name within ~500 m → keep the richer record ----
CONF_RANK = {'high': 2, 'medium': 1, 'low': 0}
def richness(p):
    return (CONF_RANK.get(p['confidence'], 0), bool(p['note_en'] or p['note']),
            p['cost'] is not None, len(p.get('desc') or ''))
by_name = {}
deduped, dropped = [], []
for p in merged:
    key = norm_name(p['name_en'])
    dup = None
    if key and key in by_name:
        q = by_name[key]
        if abs(p['lat'] - q['lat']) < 0.005 and abs(p['lng'] - q['lng']) < 0.008:
            dup = q
    if dup:
        keep, lose = (p, dup) if richness(p) > richness(dup) else (dup, p)
        # carry over a personal note if only the losing record has one
        if not (keep['note_en'] or keep['note']) and (lose['note_en'] or lose['note']):
            keep['note'], keep['note_en'] = lose['note'], lose['note_en']
        if keep is p:
            deduped[deduped.index(dup)] = p
            by_name[key] = p
        dropped.append(lose['id'])
    else:
        deduped.append(p)
        if key:
            by_name[key] = p
merged = deduped

# ---- cost sanity: "free" on eateries means free entry, not a free outing ----
n_cost_fixed = 0
for p in merged:
    if p['cost'] == 'free' and 'cafe-restaurant' in p['types'] and 'free' not in (p['price_note'] or '').lower():
        p['cost'] = None
        n_cost_fixed += 1

# ---- normalize seasonality into a machine-usable tag ----
for p in merged:
    s = (p['seasonal'] or '').lower()
    p['season'] = ('summer' if ('summer' in s or 'sommer' in s) else
                   'winter' if ('winter' in s or 'ski' in s) else '')

with open(os.path.join(DATA, 'places.js'), 'w') as f:
    f.write('window.PLACES = ')
    json.dump(merged, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print(f'places.js: {len(merged)} places, {len(cats)} categorized, {len(missing)} uncategorized')
print(f'  deduped {len(dropped)}: {dropped[:12]}{"..." if len(dropped) > 12 else ""}')
print(f'  cost free→unknown on {n_cost_fixed} eateries')
if missing:
    print('  missing:', missing[:20], '...' if len(missing) > 20 else '')

# ---- layers ----
LAYER_DEFS = []  # populated from whatever the research agents downloaded
def add_layer(key, title, emoji, src_file, style=None, point_style=None, title_prop=None,
              popup_props=None, info='', source_url=''):
    path = os.path.join(SCRATCH, 'layers', src_file)
    if not os.path.exists(path):
        print(f'layer SKIP (not found): {src_file}')
        return
    try:
        gj = json.load(open(path))
    except Exception as e:
        print(f'layer SKIP (bad json) {src_file}: {e}')
        return
    n = len(gj.get('features', [])) if isinstance(gj, dict) else 0
    var = 'LAYER_' + key.upper().replace('-', '_')
    out = os.path.join(DATA, 'layers', key + '.js')
    with open(out, 'w') as f:
        f.write(f'window.{var} = ')
        json.dump(gj, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    d = {'key': key, 'title': title, 'emoji': emoji, 'file': key + '.js', 'info': info, 'source_url': source_url}
    if style: d['style'] = style
    if point_style: d['pointStyle'] = point_style
    if title_prop: d['titleProp'] = title_prop
    if popup_props: d['popupProps'] = popup_props
    LAYER_DEFS.append(d)
    print(f'layer OK: {key} ({n} features, {os.path.getsize(out)//1024} KB)')

# Candidate files the research agents may have produced (best-effort; skips absent ones).
manifest_hints = os.path.join(SCRATCH, 'layers', 'manifest_hints.json')
if os.path.exists(manifest_hints):
    for h in json.load(open(manifest_hints)):
        add_layer(**h)

with open(os.path.join(DATA, 'layers_manifest.js'), 'w') as f:
    f.write('window.LAYERS = ')
    json.dump(LAYER_DEFS, f, ensure_ascii=False, indent=1)
    f.write(';\n')

# ---- events ----
import re as _re
MONTHS = {m: i + 1 for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
MONTHS.update({'mär': 3, 'mai': 5, 'okt': 10, 'dez': 12})

def parse_range(s):
    """Best-effort '9 Jul – 2 Aug 2026' / '5–16 Aug 2026' / '8 Aug 2026, 17:00' → (start, end) ISO."""
    if not s:
        return None, None
    t = s.lower().replace('–', '-').replace('—', '-')
    year_m = _re.search(r'(20\d\d)', t)
    year = int(year_m.group(1)) if year_m else 2026
    def iso(d, mo): return f'{year:04d}-{mo:02d}-{d:02d}'
    m = _re.search(r'(\d{1,2})\s*([a-zä]{3})?[a-zä]*\s*-\s*(\d{1,2})\s*([a-zä]{3})[a-zä]*', t)
    if m:
        d1, mo1, d2, mo2 = m.groups()
        mo2n = MONTHS.get(mo2)
        mo1n = MONTHS.get(mo1) if mo1 else mo2n
        if mo1n and mo2n:
            return iso(int(d1), mo1n), iso(int(d2), mo2n)
    m = _re.search(r'(\d{1,2})\s*-\s*(\d{1,2})\s+([a-zä]{3})[a-zä]*', t)
    if m:
        d1, d2, mo = m.groups()
        mon = MONTHS.get(mo)
        if mon:
            return iso(int(d1), mon), iso(int(d2), mon)
    m = _re.search(r'(\d{1,2})\.?\s*([a-zä]{3})[a-zä]*', t)
    if m:
        d, mo = m.groups()
        mon = MONTHS.get(mo)
        if mon:
            return iso(int(d), mon), iso(int(d), mon)
    # month-only spans: "jul - sep 2026", "aug 2026"
    LASTDAY = {1:31,2:29,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31}
    m = _re.search(r'\b([a-zä]{3})[a-zä]*\s*-\s*([a-zä]{3})[a-zä]*\s*20\d\d', t)
    if m and MONTHS.get(m.group(1)) and MONTHS.get(m.group(2)):
        m1, m2 = MONTHS[m.group(1)], MONTHS[m.group(2)]
        return iso(1, m1), iso(LASTDAY[m2], m2)
    m = _re.search(r'\b([a-zä]{3})[a-zä]*\s*20\d\d', t)
    if m and MONTHS.get(m.group(1)):
        mo = MONTHS[m.group(1)]
        return iso(1, mo), iso(LASTDAY[mo], mo)
    # recurring / open-ended ("every sunday", "throughout summer", "ongoing")
    if _re.search(r'every|ongoing|daily|throughout|weekly|jeden', t):
        return f'{year:04d}-01-01', f'{year:04d}-12-31'
    return None, None

WEEKDAYS = {'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6, 'sun': 0}
def parse_weekdays(s):
    """'Every Sunday' / '(Wed–Sun)' / 'Thu–Sun' → JS getDay() numbers, or None if daily/unknown."""
    t = (s or '').lower().replace('–', '-')
    m = _re.search(r'\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*-\s*(mon|tue|wed|thu|fri|sat|sun)', t)
    if m:
        order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        i, j = order.index(m.group(1)), order.index(m.group(2))
        span = order[i:j+1] if i <= j else order[i:] + order[:j+1]
        return [WEEKDAYS[d] for d in span]
    found = _re.findall(r'\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*', t)
    if found and len(found) < 7:
        return sorted({WEEKDAYS[d] for d in found})
    return None

events, sources = [], []
ev_path = os.path.join(SCRATCH, 'layers', 'events.json')
if os.path.exists(ev_path):
    try:
        events = json.load(open(ev_path))
        n_parsed = 0
        for e in events:
            s, t = parse_range(e.get('date_range', ''))
            e['date_start'], e['date_end'] = s, t
            wd = parse_weekdays(e.get('date_range', ''))
            if wd:
                e['weekdays'] = wd
            n_parsed += bool(s)
        print(f'event dates parsed: {n_parsed}/{len(events)}')
    except Exception as e:
        print('events parse error:', e)
src_path = os.path.join(SCRATCH, 'layers', 'events_sources.json')
if os.path.exists(src_path):
    try:
        sources = json.load(open(src_path))
    except Exception:
        pass
with open(os.path.join(DATA, 'events.js'), 'w') as f:
    f.write('window.EVENTS = ')
    json.dump(events, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\nwindow.EVENT_SOURCES = ')
    json.dump(sources, f, ensure_ascii=False)
    f.write(';\n')
print(f'events.js: {len(events)} events, {len(sources)} sources')
