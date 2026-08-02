/* Kids Berlin Map — app logic */
(function () {
  'use strict';

  // If anything crashes on an exotic device, show the error instead of a silently empty map.
  window.addEventListener('error', function (e) {
    if (document.getElementById('fatal-banner')) return;
    const b = document.createElement('div');
    b.id = 'fatal-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b00020;color:#fff;' +
      'font:12px/1.4 monospace;padding:8px 12px;word-break:break-word';
    b.textContent = '⚠️ App error (screenshot this): ' + (e.message || e.type) +
      (e.filename ? '' : '') + (e.lineno ? ' @' + e.lineno : '');
    document.body.appendChild(b);
  });

  const PLACES = (window.PLACES || []).filter(p => p.lat && p.lng);
  const LAYERS = window.LAYERS || [];
  const EVENTS = window.EVENTS || [];
  const EVENT_SOURCES = window.EVENT_SOURCES || [];

  // ---------- type metadata ----------
  const TYPE_META = {
    'playground':     { label: 'playground', emoji: '🛝', color: '#f4a261' },
    'water-play':     { label: 'water play', emoji: '⛲', color: '#4cc9f0' },
    'swimming-pool':  { label: 'swimming', emoji: '🏊', color: '#219ebc' },
    'beach-lake':     { label: 'beach / lake', emoji: '🏖️', color: '#00b4d8' },
    'climbing':       { label: 'climbing', emoji: '🧗', color: '#e76f51' },
    'trampoline':     { label: 'trampoline', emoji: '🤸', color: '#ff70a6' },
    'indoor-play':    { label: 'indoor play', emoji: '🎪', color: '#c77dff' },
    'museum':         { label: 'museum', emoji: '🏛️', color: '#8d99ae' },
    'science':        { label: 'science', emoji: '🔬', color: '#5e60ce' },
    'zoo-animals':    { label: 'animals / zoo', emoji: '🦁', color: '#bc6c25' },
    'aquarium':       { label: 'aquarium', emoji: '🐠', color: '#0096c7' },
    'farm':           { label: 'farm', emoji: '🐐', color: '#7f9d54' },
    'park-nature':    { label: 'park / nature', emoji: '🌳', color: '#2d6a4f' },
    'amusement-park': { label: 'amusement park', emoji: '🎢', color: '#e63946' },
    'cinema':         { label: 'cinema', emoji: '🎬', color: '#6d597a' },
    'show-theater':   { label: 'show / theater', emoji: '🎭', color: '#9d4edd' },
    'library':        { label: 'library', emoji: '📚', color: '#588157' },
    'cafe-restaurant':{ label: 'café / food', emoji: '🍽️', color: '#d4a373' },
    'ice-skating':    { label: 'ice skating', emoji: '⛸️', color: '#90e0ef' },
    'minigolf':       { label: 'minigolf', emoji: '⛳', color: '#80b918' },
    'karting':        { label: 'karting', emoji: '🏎️', color: '#495057' },
    'boat':           { label: 'boat', emoji: '🛶', color: '#468faf' },
    'sport':          { label: 'sport', emoji: '⚽', color: '#43aa8b' },
    'viewpoint':      { label: 'viewpoint', emoji: '🔭', color: '#b5838d' },
    'sight':          { label: 'sight', emoji: '📸', color: '#a98467' },
    'shopping':       { label: 'shopping', emoji: '🛍️', color: '#b08968' },
    'hotel-resort':   { label: 'hotel / resort', emoji: '🏨', color: '#3a86ff' },
    'city-trip':      { label: 'city trip', emoji: '🏙️', color: '#8338ec' },
    'transport-fun':  { label: 'fun transport', emoji: '🚂', color: '#fb8500' },
    'event-venue':    { label: 'event venue', emoji: '🎪', color: '#ff5d8f' },
    'other':          { label: 'other', emoji: '📍', color: '#adb5bd' },
  };

  // km/h effective; transit assumes pram + transfers, not ICE speeds
  const SPEEDS = { driving: 65, transit: 25, bicycling: 14, walking: 4.5 };

  // Types considered tick-relevant (tall grass / forest) and EPS-relevant (oak parks)
  const TICKY = new Set(['park-nature', 'farm', 'beach-lake', 'minigolf', 'climbing', 'sport']);
  const EPSY  = new Set(['park-nature', 'playground', 'beach-lake', 'farm', 'zoo-animals']);

  // ---------- state ----------
  const state = {
    ages: [null, null, null],
    scope: 'all',
    travelMin: null,
    travelMode: 'transit',
    types: new Set(),
    rainy: false, hot: false, ac: false, indoor: false, outdoor: false,
    zecken: false, eps: false,
    prices: new Set(),
    queryChips: [],
    pin: null,          // {lat, lng} — user-dropped origin for distance sorting/filtering
    pinArmed: false,
    eventsToday: false,
    excludeTypes: new Set(),   // negated types ("not a museum")
    textSearch: null,          // free-text term matched against names/descriptions
    seasonExclude: '',         // 'summer' | 'winter' — hide off-season places for a queried month
    textBoost: null,           // regex boosting matching descriptions (e.g. ski queries)
  };

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  // distance from the active origin: dropped pin if set, else Berlin center
  function distKm(p) {
    return state.pin ? haversineKm(state.pin.lat, state.pin.lng, p.lat, p.lng) : p.dist_km;
  }

  // ---------- map ----------
  const map = L.map('map', { zoomControl: true, minZoom: 2, maxZoom: 18 }).setView([52.52, 13.405], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const cluster = L.markerClusterGroup({ maxClusterRadius: 46, showCoverageOnHover: false });
  map.addLayer(cluster);
  const markers = {}; // id -> marker

  function markerIcon(p) {
    const t = (p.types && p.types[0]) || 'other';
    const meta = TYPE_META[t] || TYPE_META.other;
    return L.divIcon({
      className: '',
      html: `<div class="marker-dot" style="background:${meta.color}"><span>${meta.emoji}</span></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
    });
  }

  function gmapsDirUrl(p) {
    const mode = state.travelMode || 'transit';
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=${mode}`;
  }
  function gmapsPlaceUrl(p) {
    const q = encodeURIComponent(`${p.name_en || p.name} ${p.address || ''}`.trim());
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  const COST_LABEL = { free: 'free', cheap: '€ (≤5)', medium: '€€ (5–15)', expensive: '€€€ (15+)' };

  function popupHtml(p) {
    const badges = [];
    (p.types || []).forEach(t => {
      const m = TYPE_META[t] || TYPE_META.other;
      badges.push(`<span class="pop-badge">${m.emoji} ${m.label}</span>`);
    });
    if (p.age_min != null) badges.push(`<span class="pop-badge">👶 ${p.age_min}–${p.age_max} yrs</span>`);
    if (p.setting) badges.push(`<span class="pop-badge">${p.setting === 'indoor' ? '🏠 indoor' : p.setting === 'outdoor' ? '🌳 outdoor' : '🏠+🌳 mixed'}</span>`);
    if (p.cost) badges.push(`<span class="pop-badge">💶 ${COST_LABEL[p.cost] || p.cost}</span>`);
    if (p.ac === true) badges.push('<span class="pop-badge">❄️ AC</span>');
    if (p.rainy_ok) badges.push('<span class="pop-badge">🌧️ rainy-ok</span>');
    if (p.hot_ok) badges.push('<span class="pop-badge">🥵 hot-ok</span>');
    if (p.seasonal) badges.push(`<span class="pop-badge">🗓️ ${p.seasonal}</span>`);
    if (p.setting !== 'indoor' && (p.types || []).some(t => TICKY.has(t)))
      badges.push('<span class="pop-badge warn">🕷️ tick habitat — long pants &amp; check after</span>');
    if (isEpsSeason() && p.dist_km < 60 && p.setting !== 'indoor' && (p.types || []).some(t => EPSY.has(t)))
      badges.push('<span class="pop-badge warn">🐛 oak-EPS season — avoid hairy caterpillars/nests</span>');

    const price = p.price_note ? `<div class="pop-meta">💶 ${esc(p.price_note)}</div>` : '';
    const note = p.note_en || p.note ? `<div class="pop-note">📝 ${esc(p.note_en || p.note)}</div>` : '';
    const origin = state.pin ? 'your pin' : 'Berlin center';
    const dist = p.dist_km != null ? `<div class="pop-meta">📏 ${fmtDist(distKm(p))} from ${origin}${travelEstimate(p)}</div>` : '';

    return `<div>
      <div class="pop-name">${esc(p.name_en || p.name)}</div>
      <div class="pop-meta">${esc(p.address || '')}</div>
      <div class="pop-desc">${esc(p.desc || '')}</div>
      ${note}
      <div class="pop-badges">${badges.join('')}</div>
      ${price}${dist}
      <div class="pop-links">
        <a href="${gmapsDirUrl(p)}" target="_blank" rel="noopener">🧭 Directions</a>
        <a href="${gmapsPlaceUrl(p)}" target="_blank" rel="noopener">📍 Google Maps</a>
      </div>
    </div>`;
  }

  function travelEstimate(p) {
    if (p.dist_km == null) return '';
    const v = SPEEDS[state.travelMode] || 32;
    const min = Math.round((distKm(p) / v) * 60 * 1.25); // 1.25 routing factor
    if (min > 900) return '';
    return ` · ~${min >= 60 ? Math.round(min / 60 * 10) / 10 + ' h' : min + ' min'} by ${modeLabel(state.travelMode)}`;
  }
  function modeLabel(m) { return { driving: 'car', transit: 'public transport', bicycling: 'bike', walking: 'foot' }[m] || m; }
  function fmtDist(km) { return km < 1 ? Math.round(km * 1000) + ' m' : (km < 100 ? km.toFixed(1) : Math.round(km)) + ' km'; }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function isEpsSeason() { const m = new Date().getMonth() + 1; return m >= 5 && m <= 9; }

  PLACES.forEach(p => {
    const mk = L.marker([p.lat, p.lng], { icon: markerIcon(p) });
    mk.bindPopup(() => popupHtml(p), { maxWidth: 320 });
    markers[p.id] = mk;
  });

  // ---------- filtering ----------
  function passes(p) {
    // scope — overlapping bands, not exclusive buckets: a 27 km Karls trip is a day trip too
    if (state.scope === 'berlin' && p.dist_km > 28) return false;
    if (state.scope === 'daytrip' && p.dist_km > 150) return false;
    if (state.scope === 'vacation' && p.dist_km < 60) return false;
    // travel time (from dropped pin if set, else Berlin center)
    if (state.travelMin) {
      const v = SPEEDS[state.travelMode] || 32;
      const reachKm = (state.travelMin / 60) * v / 1.25;
      if (distKm(p) > reachKm) return false;
    }
    // ages: soft range — near-misses (±2 yrs) stay visible but rank lower.
    // No downward stretch for under-3s (a baby doesn't belong in a 3+ trampoline park).
    const ages = state.ages.filter(a => a != null);
    if (ages.length && p.age_min != null) {
      for (const a of ages) {
        const downSlop = a < 3 ? 0 : 2;
        if (a < p.age_min - downSlop || a > p.age_max + 2) return false;
      }
    }
    // types
    if (state.types.size && !(p.types || []).some(t => state.types.has(t))) return false;
    if (state.excludeTypes.size && (p.types || []).some(t => state.excludeTypes.has(t))) return false;
    // free-text term must appear in name or description
    if (state.textSearch) {
      const t = state.textSearch;
      if (!(p.name_en || '').toLowerCase().includes(t) && !(p.name || '').toLowerCase().includes(t) &&
          !(p.desc || '').toLowerCase().includes(t)) return false;
    }
    // off-season places are hidden when the query names a month/season
    if (state.seasonExclude && p.season === state.seasonExclude) return false;
    // considerations
    if (state.rainy && !p.rainy_ok) return false;
    if (state.hot && !p.hot_ok) return false;
    if (state.ac && p.ac !== true) return false;
    if (state.indoor && p.setting === 'outdoor') return false;
    if (state.outdoor && p.setting === 'indoor') return false;
    if (state.zecken && p.setting !== 'indoor' && (p.types || []).some(t => TICKY.has(t))) return false;
    if (state.eps && isEpsSeason() && p.dist_km < 60 && p.setting !== 'indoor' && (p.types || []).some(t => EPSY.has(t))) return false;
    // price
    if (state.prices.size && !state.prices.has(p.cost)) return false;
    return true;
  }

  const WATER_TYPES = new Set(['water-play', 'swimming-pool', 'beach-lake', 'aquarium']);
  function relevance(p) {
    let r = 0;
    if (p.confidence === 'high') r += 2;
    else if (p.confidence === 'low') r -= 1.5;
    if (state.types.size) r += 2.5 * Math.min(2, (p.types || []).filter(t => state.types.has(t)).length);
    if (p.note_en || p.note) r += 1; // personally annotated = loved
    // exact age fit ranks above the ±2 stretch — but a generic 0-17 range earns nothing
    const ages = state.ages.filter(a => a != null);
    if (ages.length && (p.age_min > 0 || p.age_max < 17) &&
        ages.every(a => a >= p.age_min && a <= p.age_max)) r += 2;
    // weather flags boost fitting places, not just filter
    if (state.hot && ((p.types || []).some(t => WATER_TYPES.has(t)) || p.ac === true)) r += 2;
    if (state.rainy && p.setting === 'indoor') r += 1.5;
    // accommodation competes with day activities only in vacation mode
    if (state.scope !== 'vacation' && (p.types || []).includes('hotel-resort')) r -= 2;
    // off-season demotion by today's date (Nov–Mar vs summer-only, May–Sep vs winter-only)
    const mon = new Date().getMonth() + 1;
    if (p.season === 'summer' && (mon <= 3 || mon >= 11)) r -= 3;
    if (p.season === 'winter' && mon >= 5 && mon <= 9) r -= 3;
    if (state.textBoost && state.textBoost.test((p.desc || '') + ' ' + (p.name_en || ''))) r += 3;
    // distance matters: ~-0.5 at 10 km, ~-2 at 150 km, ~-3.7 at 1000 km
    r -= 2 * Math.log10(1 + distKm(p) / 15);
    return r;
  }

  let visible = [];
  function applyFilters() {
    visible = PLACES.filter(passes);
    cluster.clearLayers();
    cluster.addLayers(visible.map(p => markers[p.id]));
    renderResults();
    document.getElementById('result-count').textContent =
      `${visible.length} of ${PLACES.length} places`;
    saveHash();
  }

  // ---------- shareable URL state ----------
  let restoring = false;
  function saveHash() {
    if (restoring) return;
    const h = {};
    const ages = state.ages.filter(a => a != null);
    if (ages.length) h.a = ages.join(',');
    if (state.scope !== 'all') h.s = state.scope;
    if (state.travelMin) h.t = state.travelMin;
    if (state.travelMode !== 'transit') h.m = state.travelMode;
    if (state.types.size) h.ty = [...state.types].join(',');
    const flags = Object.entries(checkMap).filter(([, k]) => state[k]).map(([, k]) => k);
    if (flags.length) h.f = flags.join(',');
    if (state.prices.size) h.p = [...state.prices].join(',');
    const str = Object.entries(h).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    try {
      history.replaceState(null, '', str ? '#' + str : location.pathname);
    } catch (e) { /* sandboxed iframe (artifact) may forbid history writes */ }
  }
  function restoreHash() {
    if (!location.hash || location.hash.length < 2) return;
    restoring = true;
    try {
      const h = Object.fromEntries(location.hash.slice(1).split('&').map(kv => {
        const i = kv.indexOf('='); return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))];
      }));
      if (h.a) h.a.split(',').slice(0, 3).forEach((a, i) => { state.ages[i] = +a; $(`age${i + 1}`).value = a; });
      if (h.s) setScope(h.s);
      if (h.t) { state.travelMin = +h.t; $('travel-min').value = h.t; }
      if (h.m) { state.travelMode = h.m; $('travel-mode').value = h.m; }
      if (h.ty) h.ty.split(',').forEach(t => {
        state.types.add(t);
        const chip = document.querySelector(`#type-chips .chip[data-type="${t}"]`);
        if (chip) chip.classList.add('on');
      });
      if (h.f) h.f.split(',').forEach(k => {
        state[k] = true;
        const id = Object.keys(checkMap).find(i => checkMap[i] === k);
        if (id) $(id).checked = true;
      });
      if (h.p) h.p.split(',').forEach(v => {
        state.prices.add(v);
        const cb = document.querySelector(`#price-checks input[value=${v}]`);
        if (cb) cb.checked = true;
      });
    } catch (e) { /* bad hash — ignore */ }
    restoring = false;
  }

  function renderResults() {
    const el = document.getElementById('results');
    // with a dropped pin: nearest first; otherwise: best match first
    const sorted = [...visible].sort(state.pin
      ? (a, b) => distKm(a) - distKm(b)
      : (a, b) => relevance(b) - relevance(a)).slice(0, 80);
    el.innerHTML = sorted.map(p => {
      const m = TYPE_META[(p.types || ['other'])[0]] || TYPE_META.other;
      const tags = (p.types || []).map(t => (TYPE_META[t] || TYPE_META.other).label).join(' · ');
      return `<div class="result-item" data-id="${p.id}">
        <span class="r-dist">${fmtDist(distKm(p))}${state.pin ? ' 📌' : ''}</span>
        <div class="r-name">${m.emoji} ${esc(p.name_en || p.name)}</div>
        <div class="r-desc">${esc(p.desc || p.address || '')}</div>
        <div class="r-tags">${esc(tags)}${p.cost ? ' · ' + (COST_LABEL[p.cost] || '') : ''}</div>
      </div>`;
    }).join('') || '<div style="color:#888;padding:8px">No places match — relax a filter?</div>';
    el.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const p = PLACES.find(x => x.id === item.dataset.id);
        if (!p) return;
        map.setView([p.lat, p.lng], Math.max(map.getZoom(), 13));
        cluster.zoomToShowLayer(markers[p.id], () => markers[p.id].openPopup());
        if (window.innerWidth <= 780) document.getElementById('sidebar').classList.remove('open');
      });
    });
  }

  // ---------- controls wiring ----------
  const $ = id => document.getElementById(id);

  ['age1', 'age2', 'age3'].forEach((id, i) => {
    $(id).addEventListener('input', e => {
      const v = e.target.value.trim();
      state.ages[i] = v === '' ? null : Math.max(0, Math.min(17, +v));
      applyFilters();
    });
  });

  document.querySelectorAll('#scope-seg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#scope-seg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      state.scope = b.dataset.scope;
      applyFilters();
      fitVisible();
    });
  });

  $('travel-min').addEventListener('input', e => {
    state.travelMin = e.target.value ? +e.target.value : null;
    applyFilters();
  });
  $('travel-mode').addEventListener('change', e => {
    state.travelMode = e.target.value;
    applyFilters();
  });

  // type chips
  const typeChipsEl = $('type-chips');
  const usedTypes = [...new Set(PLACES.flatMap(p => p.types || []))]
    .sort((a, b) => (TYPE_META[a]?.label || a).localeCompare(TYPE_META[b]?.label || b));
  usedTypes.forEach(t => {
    const m = TYPE_META[t] || TYPE_META.other;
    const c = document.createElement('span');
    c.className = 'chip'; c.dataset.type = t;
    c.textContent = `${m.emoji} ${m.label}`;
    c.addEventListener('click', () => {
      c.classList.toggle('on');
      c.classList.contains('on') ? state.types.add(t) : state.types.delete(t);
      applyFilters();
    });
    typeChipsEl.appendChild(c);
  });

  const checkMap = { 'c-rainy': 'rainy', 'c-hot': 'hot', 'c-ac': 'ac', 'c-indoor': 'indoor', 'c-outdoor': 'outdoor', 'c-zecken': 'zecken', 'c-eps': 'eps' };
  Object.entries(checkMap).forEach(([id, key]) => {
    $(id).addEventListener('change', e => { state[key] = e.target.checked; applyFilters(); });
  });

  document.querySelectorAll('#price-checks input').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.checked ? state.prices.add(cb.value) : state.prices.delete(cb.value);
      applyFilters();
    });
  });

  $('reset-btn').addEventListener('click', resetAll);
  function resetAll() {
    state.ages = [null, null, null];
    state.scope = 'all'; state.travelMin = null;
    state.types.clear(); state.prices.clear();
    state.excludeTypes.clear(); state.textSearch = null;
    state.seasonExclude = ''; state.textBoost = null;
    Object.values(checkMap).forEach(k => state[k] = false);
    state.queryChips = [];
    ['age1','age2','age3','travel-min','query'].forEach(id => $(id).value = '');
    document.querySelectorAll('#scope-seg button').forEach(x => x.classList.toggle('on', x.dataset.scope === 'all'));
    document.querySelectorAll('#type-chips .chip').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.checks input[type=checkbox]').forEach(x => { if (!x.dataset.layer) x.checked = false; });
    renderQueryChips();
    applyFilters();
  }

  function fitVisible() {
    if (!visible.length) return;
    // don't zoom out to the whole world unless the user actually asked for vacations
    const local = state.scope === 'vacation' ? visible : visible.filter(p => distKm(p) <= 160);
    const target = local.length ? local : visible;
    const b = L.latLngBounds(target.map(p => [p.lat, p.lng]));
    map.fitBounds(b.pad(0.1), { maxZoom: 12 });
  }

  // ---------- free-text query parser ----------
  const KEYWORD_TYPES = [
    [/roller\s?coaster|achterbahn|theme ?park|freizeitpark|erlebnispark|amusement|sommerrodel|rodelbahn/i, 'amusement-park'],
    [/waterpark|water ?park|aquapark|erlebnisbad|therme\b|badeparadies/i, 'water-play'],
    [/waterpark|water ?park|aquapark|erlebnisbad|swim|pool|schwimm|freibad|hallenbad|baden|badesee/i, 'swimming-pool'],
    // in kid-land "swimming" includes free Planschen and lakes — offer them alongside pools
    [/plansch|splash|water ?play|wasserspiel|\bswim|schwimm/i, 'water-play'],
    [/lake|\w+see\b|badesee|beach|strand|\bswim|schwimm|baden\b/i, 'beach-lake'],
    [/climb|boulder|kletter|hochseil/i, 'climbing'],
    [/trampolin/i, 'trampoline'],
    [/museum|ausstellung|exhibit/i, 'museum'],
    [/science|experiment/i, 'science'],
    [/zoo\b|tierpark|wildpark|animal|tiere|streichel/i, 'zoo-animals'],
    [/aquarium/i, 'aquarium'],
    [/farm|bauernhof/i, 'farm'],
    [/playground|spielplatz/i, 'playground'],
    [/indoor ?play|softplay|jump/i, 'indoor-play'],
    [/cinema|kino|movie|film/i, 'cinema'],
    [/theater|theatre|puppet|show/i, 'show-theater'],
    [/minigolf/i, 'minigolf'],
    [/\bkart|gokart/i, 'karting'],
    [/boat|boot(?:e|s)?tour|kanu|kayak|paddel|ruder/i, 'boat'],
    // bare "park" must not fire inside tierpark/freizeitpark/theme park/waterpark etc.
    [/(?:^|[^a-zäöüß])park\b(?!\s*(?:eisenbahn))|nature|natur\b|forest|\bwald\b|hik(?:e|ing)|wander/i, 'park-nature'],
    [/hotel|resort|übernacht|all.inclusive/i, 'hotel-resort'],
    [/\btrain\b|eisenbahn|draisine/i, 'transport-fun'],
    [/library|bibliothek/i, 'library'],
    [/caf[eé]|restaurant|essen\b|\beat\b|lunch|brunch/i, 'cafe-restaurant'],
    [/city ?trip|städtetrip|städtereise/i, 'city-trip'],
    [/shopping|einkauf/i, 'shopping'],
  ];
  // "theme park", "waterpark" etc. must not also drag in 162 city parks via /park/
  const PARK_COMPOUNDS = /(?:theme|amusement|water|aqua|freizeit|erlebnis|kletter|tier|wild|lego|movie)[\s-]?park/i;

  // Berlin districts & known Kieze → query can set the distance origin in words
  const DISTRICTS = {
    'prenzlauer berg': [52.539, 13.424], 'mitte': [52.520, 13.397], 'kreuzberg': [52.497, 13.403],
    'friedrichshain': [52.512, 13.454], 'neukölln': [52.481, 13.435], 'neukoelln': [52.481, 13.435],
    'wedding': [52.550, 13.355], 'moabit': [52.530, 13.342], 'charlottenburg': [52.516, 13.304],
    'wilmersdorf': [52.487, 13.319], 'schöneberg': [52.482, 13.355], 'schoeneberg': [52.482, 13.355],
    'tempelhof': [52.466, 13.386], 'steglitz': [52.456, 13.332], 'zehlendorf': [52.434, 13.259],
    'spandau': [52.535, 13.200], 'reinickendorf': [52.590, 13.330], 'pankow': [52.569, 13.402],
    'weißensee': [52.555, 13.463], 'weissensee': [52.555, 13.463], 'lichtenberg': [52.515, 13.499],
    'treptow': [52.474, 13.469], 'köpenick': [52.443, 13.575], 'koepenick': [52.443, 13.575],
    'marzahn': [52.545, 13.565], 'hellersdorf': [52.535, 13.605], 'friedenau': [52.471, 13.328],
    'potsdam': [52.396, 13.059],
  };
  const STOPWORDS = new Set(['with', 'kids', 'kind', 'kinder', 'children', 'child', 'this', 'that',
    'from', 'have', 'want', 'need', 'day', 'days', 'what', 'where', 'something', 'somewhere', 'nice',
    'good', 'best', 'berlin', 'für', 'mit', 'und', 'oder', 'eine', 'einen', 'year', 'years', 'old',
    'today', 'heute', 'please', 'idea', 'ideas', 'activity', 'activities',
    // concept words already handled by dedicated rules — never treat as text search
    'toddler', 'kleinkind', 'baby', 'babies', 'rainy', 'rain', 'regen', 'sunny', 'indoor', 'outdoor',
    'indoors', 'outdoors', 'draußen', 'drinnen', 'vacation', 'urlaub', 'holiday', 'holidays',
    'ferien', 'cheap', 'günstig', 'free', 'gratis', 'kostenlos', 'weekend', 'wochenende',
    'morning', 'afternoon', 'evening', 'hours', 'stunden', 'minuten', 'minutes',
    'olds', 'aged', 'near', 'nähe', 'naehe', 'nearby', 'close', 'around', 'theme']);

  function parseQuery(q) {
    const actions = []; // {label, apply}
    const lower = q.toLowerCase();
    const consumed = new Set(); // tokens explained by some rule → not used for text search

    // ages: "2yo", "5-year-old", "aged 6 and 9", "4+7", "18 months", "בן 3"
    const ages = [];
    for (const m of q.matchAll(/(\d{1,2})[\s-]*(?:\+|and|und|&|,)[\s-]*(?:a\s+)?(\d{1,2})[\s-]*(?:yo|y\/o|year|jahr|j\b)/gi)) { ages.push(+m[1], +m[2]); }
    for (const m of q.matchAll(/(\d{1,2})[\s-]*(?:yo\b|y\/o|years?[\s-]*old|year\b|jährig|jahre)/gi)) { if (!ages.includes(+m[1])) ages.push(+m[1]); }
    for (const m of q.matchAll(/(?:aged?|kids|kinder|בן|בת)\s+(\d{1,2})(?:\s*(?:and|und|,|&|\+)\s*(\d{1,2}))?/gi)) {
      if (!ages.includes(+m[1])) ages.push(+m[1]);
      if (m[2] && !ages.includes(+m[2])) ages.push(+m[2]);
    }
    if (!ages.length) { const m2 = lower.match(/(\d{1,2})\s*\+\s*(\d{1,2})/); if (m2) ages.push(+m2[1], +m2[2]); }
    const mm = lower.match(/(\d{1,2})\s*(?:months?|monate)/);
    if (mm) ages.push(Math.floor(+mm[1] / 12)); // "10 months" → 0
    if (/toddler|kleinkind/.test(lower) && ages.length < 3) ages.push(2);
    if (/\bbaby|säugling|krabbel/.test(lower) && ages.length < 3 && !ages.includes(0)) ages.push(0);
    [...new Set(ages)].slice(0, 3).forEach((a, i) => {
      if (a >= 0 && a <= 17) actions.push({ label: `👶 age ${a}`, apply: () => { state.ages[i] = a; $(`age${i + 1}`).value = a; } });
    });

    // weather
    if (/hot|heat\b|hitze|heiß|heiss|scorch|warm day|35 grad|über 30/.test(lower)) actions.push({ label: '🥵 hot day', apply: () => { state.hot = true; $('c-hot').checked = true; } });
    if (/rain|regn|regen|verregnet|nieselt?|schauer|sauwetter|\bwet\b|storm|schlechtes wetter|bad weather|gewitter/.test(lower)) actions.push({ label: '🌧️ rainy day', apply: () => { state.rainy = true; $('c-rainy').checked = true; } });
    if (/\bac\b|air ?con|klimaanlage/.test(lower)) actions.push({ label: '❄️ AC', apply: () => { state.ac = true; $('c-ac').checked = true; } });
    if (/indoor|drinnen|inside/.test(lower)) actions.push({ label: '🏠 indoor', apply: () => { state.indoor = true; $('c-indoor').checked = true; } });
    if (/outdoor|outside|draußen|draussen|im freien|fresh air|frische luft|\braus\b/.test(lower)) actions.push({ label: '🌳 outdoor', apply: () => { state.outdoor = true; $('c-outdoor').checked = true; } });
    if (/zecke|zecken|\btick|fsme/.test(lower)) actions.push({ label: '🕷️ avoid ticks', apply: () => { state.zecken = true; $('c-zecken').checked = true; } });
    if (/eichenprozession|\beps\b|caterpillar|raupen/.test(lower)) actions.push({ label: '🐛 avoid EPS', apply: () => { state.eps = true; $('c-eps').checked = true; } });

    // month → season sanity ("warm in october" must not suggest summer-only lidos)
    const MONTH_SEASON = { january: 'winter', february: 'winter', march: 'winter', october: 'winter', november: 'winter', december: 'winter',
      januar: 'winter', februar: 'winter', märz: 'winter', oktober: 'winter', dezember: 'winter',
      june: 'summer', july: 'summer', august: 'summer', juni: 'summer', juli: 'summer' };
    for (const [mon, season] of Object.entries(MONTH_SEASON)) {
      if (lower.includes(mon)) {
        const excl = season === 'winter' ? 'summer' : 'winter';
        actions.push({ label: `🗓️ ${mon} (no ${excl}-only places)`, apply: () => { state.seasonExclude = excl; } });
        break;
      }
    }
    if (/\bski\b|snow|schnee|rodeln|sled/.test(lower)) actions.push({ label: '⛷️ winter fun', apply: () => { state.seasonExclude = ''; state.textBoost = /ski|snow|winter|rodel/i; } });

    // transport
    if (/zu fuß|zu fuss|walking|on foot|stroller walk|spaziergang|kinderwagen|buggy/.test(lower))
      actions.push({ label: '🚶 on foot', apply: () => { state.travelMode = 'walking'; $('travel-mode').value = 'walking'; } });
    else if (/no car|without car|car[- ]?free|kein auto|ohne auto|public transport|öffis|by train|u-?bahn|(?:^|[^i])s-bahn/.test(lower))
      actions.push({ label: '🚇 public transport', apply: () => { state.travelMode = 'transit'; $('travel-mode').value = 'transit'; } });
    else if (/\bby car\b|\bcar\b|\bauto\b|\bdrive\b|driving/.test(lower))
      actions.push({ label: '🚗 car', apply: () => { state.travelMode = 'driving'; $('travel-mode').value = 'driving'; } });

    // travel time "within 30 min", "1 hour away", "unter 1 stunde"
    let tm = lower.match(/(?:within|max|under|unter|bis)?\s*(\d{1,3})\s*min/);
    if (tm) actions.push({ label: `⏱️ ≤${tm[1]} min`, apply: () => { state.travelMin = +tm[1]; $('travel-min').value = tm[1]; } });
    else {
      const th = lower.match(/(\d(?:[.,]\d)?)\s*(?:h\b|hour|stunde)/);
      if (th && !/\d\s*days?/.test(lower)) { const mins = Math.round(parseFloat(th[1].replace(',', '.')) * 60); actions.push({ label: `⏱️ ≤${mins} min`, apply: () => { state.travelMin = mins; $('travel-min').value = mins; } }); }
    }

    // scope: vacation vs day trip vs berlin — but school holidays are NOT a vacation trip
    const schoolHoliday = /school ?holiday|schulferien|\bferien\b|holiday boredom/.test(lower);
    if (schoolHoliday)
      actions.push({ label: '🏫 school holidays (staying local)', apply: () => {} });
    else if (/vacation|urlaub|getaway|weekend away|\d+\s*(?:days?|tage|nights?|nächte)\b|holiday/.test(lower))
      actions.push({ label: '🧳 vacation', apply: () => setScope('vacation') });
    else if (/day ?trip|ausflug|tagesausflug|around berlin|near berlin/.test(lower))
      actions.push({ label: '🚌 day trip', apply: () => setScope('daytrip') });
    else if (/in berlin|berlin\b/.test(lower) && !/around berlin|near berlin/.test(lower))
      actions.push({ label: '🏙️ Berlin', apply: () => setScope('berlin') });

    // postcode → origin: "playground near 10437" (Berlin PLZ table)
    const plzM = lower.match(/\b(1[0-4]\d{3})\b/);
    const PLZ = window.PLZ || {};
    if (plzM && PLZ[plzM[1]]) {
      const ll = PLZ[plzM[1]];
      actions.push({ label: `📍 PLZ ${plzM[1]}`, apply: () => placePin({ lat: ll[0], lng: ll[1] }) });
    } else {
      // district / neighbourhood → set the distance origin like a dropped pin
      for (const [name, ll] of Object.entries(DISTRICTS)) {
        if (lower.includes(name)) {
          actions.push({ label: `📍 near ${name}`, apply: () => placePin({ lat: ll[0], lng: ll[1] }) });
          break;
        }
      }
    }

    // cost — keywords or an explicit budget ("under 20 euro for all of us")
    const budget = lower.match(/(?:under|unter|max\.?|budget|bis)\s*(\d{1,3})\s*(?:€|euro|eur)/) || lower.match(/(\d{1,3})\s*(?:€|euro|eur)/);
    if (budget) {
      const total = +budget[1];
      const family = /all of us|whole family|ganze familie|family of|zu (?:dritt|viert|fünft)|für uns/.test(lower);
      const perPerson = family ? total / 4 : total;
      const set = perPerson <= 6 ? ['free', 'cheap'] : perPerson <= 16 ? ['free', 'cheap', 'medium'] : [];
      if (set.length) actions.push({ label: `💶 ≤${total}€${family ? ' family' : ''}`, apply: () => { set.forEach(v => { state.prices.add(v); const cb = document.querySelector(`#price-checks input[value=${v}]`); if (cb) cb.checked = true; }); } });
    } else if (/\bfree\b|gratis|kostenlos|umsonst|no money|cheap|günstig|billig/.test(lower)) {
      const set = /cheap|günstig|billig/.test(lower) ? ['free', 'cheap'] : ['free'];
      actions.push({ label: '💶 ' + set.join('/'), apply: () => { set.forEach(v => { state.prices.add(v); const cb = document.querySelector(`#price-checks input[value=${v}]`); if (cb) cb.checked = true; }); } });
    }

    // types — with negation ("not a museum", "kein Museum" → exclude)
    const seen = new Set();
    const matchedSpans = []; // raw substrings consumed by type rules → excluded from text search
    const parkless = lower.replace(new RegExp(PARK_COMPOUNDS.source, 'gi'), ' ');
    for (const [re, t] of KEYWORD_TYPES) {
      const hay = t === 'park-nature' ? parkless : lower;
      const m0 = hay.match(re);
      if (!m0 || seen.has(t)) continue;
      matchedSpans.push(m0[0]);
      seen.add(t);
      const meta = TYPE_META[t];
      const before = hay.slice(Math.max(0, m0.index - 32), m0.index);
      const negated = /(?:\bno\b|\bnot\b|\bkein[e]?\b|\bohne\b|hate|außer|statt|nicht|lieber kein)\s*(?:\w+\s+){0,2}$/.test(before);
      if (negated) {
        actions.push({ label: `🚫 no ${meta.label}`, apply: () => state.excludeTypes.add(t) });
      } else {
        actions.push({ label: `${meta.emoji} ${meta.label}`, apply: () => { state.types.add(t); const chip = document.querySelector(`#type-chips .chip[data-type="${t}"]`); if (chip) chip.classList.add('on'); } });
      }
    }

    // high-energy intent
    if (!seen.size && /energy|toben|run around|austoben|adventure|action|abenteuer/.test(lower)) {
      ['climbing', 'trampoline', 'indoor-play', 'amusement-park', 'playground'].forEach(t => {
        actions.push({ label: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`, apply: () => { state.types.add(t); const chip = document.querySelector(`#type-chips .chip[data-type="${t}"]`); if (chip) chip.classList.add('on'); } });
      });
    }

    // free-text fallback: unconsumed tokens that match place names/descriptions ("Legoland", "sandkasten")
    const tokens = lower.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/)
      .filter(t => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
    for (const tok of tokens) {
      if (actions.some(a => a.label.toLowerCase().includes(tok))) continue;
      // skip tokens that are concepts, not names: already matched by a type/keyword rule
      if (KEYWORD_TYPES.some(([re]) => re.test(tok))) continue;
      if (matchedSpans.some(s => s.includes(tok) || tok.includes(s))) continue;
      if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|weekend)s?$/.test(tok)) continue;
      const hits = PLACES.filter(p =>
        (p.name_en || '').toLowerCase().includes(tok) || (p.name || '').toLowerCase().includes(tok) ||
        (p.desc || '').toLowerCase().includes(tok));
      if (hits.length >= 1 && hits.length <= 300) {
        actions.push({ label: `🔎 “${tok}” (${hits.length})`, apply: () => { state.textSearch = tok; } });
        break; // one text term is enough
      }
    }
    return actions;
  }

  function setScope(s) {
    state.scope = s;
    document.querySelectorAll('#scope-seg button').forEach(x => x.classList.toggle('on', x.dataset.scope === s));
  }

  function runQuery() {
    const q = $('query').value.trim();
    resetAll();
    if (!q) return; // empty query = reset everything
    $('query').value = q;
    const actions = parseQuery(q);
    actions.forEach(a => a.apply());
    state.queryChips = actions.length ? actions.map(a => a.label)
      : ['🤷 didn’t understand that — showing everything. Try e.g. “rainy day, 3yo, indoor” or a place name.'];
    renderQueryChips();
    applyFilters();
    fitVisible();
  }
  $('query-go').addEventListener('click', runQuery);
  $('query').addEventListener('keydown', e => { if (e.key === 'Enter') runQuery(); });

  function renderQueryChips() {
    const el = $('query-chips');
    el.innerHTML = state.queryChips.length
      ? '<span style="color:#888;font-size:11.5px;align-self:center">I understood:</span>' +
        state.queryChips.map(c => `<span class="chip on">${c}</span>`).join('')
      : '';
  }

  // ---------- overlay layers ----------
  const overlayObjs = {}; // key -> L.Layer
  const layerChecksEl = $('layer-checks');
  LAYERS.forEach(def => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.layer = def.key;
    label.appendChild(cb);
    const sw = document.createElement('span');
    sw.className = 'layer-swatch';
    sw.style.background = (def.pointStyle && def.pointStyle.fillColor) || (def.style && def.style.color) || '#e63946';
    label.appendChild(sw);
    label.appendChild(document.createTextNode(` ${def.emoji || '🗺️'} ${def.title}`));
    layerChecksEl.appendChild(label);
    if (def.info) {
      const info = document.createElement('div');
      info.className = 'layer-info';
      info.innerHTML = def.info + (def.source_url ? ` — <a href="${def.source_url}" target="_blank" rel="noopener">source</a>` : '');
      layerChecksEl.appendChild(info);
    }
    cb.addEventListener('change', () => {
      if (cb.checked) {
        loadOverlay(def).then(l => { if (l) l.addTo(map); });
      } else if (overlayObjs[def.key]) {
        map.removeLayer(overlayObjs[def.key]);
      }
    });
  });

  function loadOverlay(def) {
    if (overlayObjs[def.key]) return Promise.resolve(overlayObjs[def.key]);
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = `data/layers/${def.file}`;
      s.onload = () => {
        const gj = window['LAYER_' + def.key.toUpperCase().replace(/-/g, '_')];
        if (!gj) { resolve(null); return; }
        const touch = ('ontouchstart' in window) || window.innerWidth <= 780;
        const ptStyle = Object.assign(
          { radius: 5, weight: 1.5, color: '#fff', fillOpacity: 0.9, fillColor: '#e63946' },
          def.pointStyle || {});
        if (touch) ptStyle.radius = Math.max(ptStyle.radius, 9); // finger-sized targets
        const layer = L.geoJSON(gj, {
          // style() must not touch Points — it would override pointToLayer's colors
          style: f => (f.geometry && f.geometry.type !== 'Point')
            ? (def.style || { color: ptStyle.fillColor, weight: 1.5, fillOpacity: 0.18 })
            : ptStyle,
          pointToLayer: (f, latlng) => L.circleMarker(latlng, ptStyle),
          onEachFeature: (f, l) => {
            const props = f.properties || {};
            const title = props[def.titleProp] || props.name || props.NAME || def.title;
            const extra = (def.popupProps || []).map(k => props[k] ? `<div class="pop-meta">${esc(String(props[k]))}</div>` : '').join('');
            l.bindPopup(`<b>${esc(String(title))}</b>${extra}<div class="pop-meta">${def.emoji || ''} ${def.title}</div>`);
          },
        });
        overlayObjs[def.key] = layer;
        resolve(layer);
      };
      s.onerror = () => resolve(null);
      document.body.appendChild(s);
    });
  }

  // ---------- events panel ----------
  const evList = $('events-list');
  const evToggle = $('events-toggle');
  let evMarkers = null, evShown = false;

  function isToday(e) {
    if (!e.date_start) return false; // undated entries hide under "today only"
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (e.date_start > today || today > (e.date_end || e.date_start)) return false;
    if (e.weekdays && !e.weekdays.includes(now.getDay())) return false; // e.g. "Every Sunday"
    return true;
  }
  function filteredEvents() {
    return state.eventsToday ? EVENTS.filter(isToday) : EVENTS;
  }
  function renderEvents() {
    const evs = filteredEvents();
    evList.innerHTML = evs.map(e => `
      <div class="event-item">
        <div class="ev-title">${esc(e.title)}</div>
        <div class="ev-meta">${esc(e.date_range || '')}${e.venue ? ' · ' + esc(e.venue) : ''}${e.age_hint ? ' · ' + esc(e.age_hint) : ''}${e.cost_hint ? ' · ' + esc(e.cost_hint) : ''}</div>
        ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">details ↗</a>` : ''}
      </div>`).join('')
      || `<div class="ev-meta" style="font-size:12px;color:#888">${state.eventsToday ? 'Nothing dated today — untick to see all upcoming.' : 'No events loaded.'}</div>`;
    if (EVENT_SOURCES.length) {
      evList.innerHTML += `<div class="events-sources">More events: ${EVENT_SOURCES.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(' · ')}</div>`;
    }
    if (evMarkers) { map.removeLayer(evMarkers); evMarkers = null; }
    if (evShown) {
      evMarkers = L.layerGroup(evs.filter(e => e.lat && e.lng).map(e =>
        L.marker([e.lat, e.lng], { icon: L.divIcon({ className: 'ev-marker', html: '🎟️', iconSize: [22, 22], iconAnchor: [11, 20] }) })
          .bindPopup(`<b>${esc(e.title)}</b><div class="pop-meta">${esc(e.date_range || '')} · ${esc(e.venue || '')}</div>${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">details</a>` : ''}`)
      ));
      evMarkers.addTo(map);
    }
  }
  evToggle.addEventListener('click', () => {
    evShown = evList.classList.toggle('hidden') === false;
    evToggle.textContent = evShown ? 'hide' : 'show';
    renderEvents();
  });
  $('events-today').addEventListener('change', e => {
    state.eventsToday = e.target.checked;
    renderEvents();
  });
  renderEvents();

  // ---------- live weather suggestion (open-meteo, free & CORS-friendly) ----------
  fetch('https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.405&daily=temperature_2m_max,precipitation_probability_max&timezone=Europe%2FBerlin&forecast_days=1')
    .then(r => r.json())
    .then(w => {
      const tmax = w?.daily?.temperature_2m_max?.[0];
      const rain = w?.daily?.precipitation_probability_max?.[0];
      if (tmax == null) return;
      const banner = $('weather-banner');
      let msg = null, btnLabel = null, action = null;
      if (tmax >= 28) {
        msg = `☀️ ${Math.round(tmax)}°C in Berlin today.`;
        btnLabel = 'Show hot-day picks'; action = () => { state.hot = true; $('c-hot').checked = true; applyFilters(); };
      } else if (rain >= 60) {
        msg = `🌧️ ${rain}% chance of rain today.`;
        btnLabel = 'Show rainy-day picks'; action = () => { state.rainy = true; $('c-rainy').checked = true; applyFilters(); };
      }
      if (msg) {
        banner.classList.remove('hidden');
        banner.innerHTML = `${msg} `;
        const b = document.createElement('button');
        b.textContent = btnLabel; b.className = 'linkish'; b.addEventListener('click', action);
        banner.appendChild(b);
      }
    })
    .catch(() => {});

  // ---------- dropped pin: sort/filter around a chosen origin ----------
  let pinMarker = null;
  const pinBtn = $('pin-btn');
  function setPinButton() {
    pinBtn.classList.toggle('armed', state.pinArmed);
    pinBtn.classList.toggle('set', !!state.pin && !state.pinArmed);
    pinBtn.textContent = state.pinArmed ? '📌 Now tap the map to place the pin…'
      : state.pin ? '📌 Pin active — results sorted by distance (tap to remove)'
      : '📌 Drop a pin (or long-press the map) — sort by distance';
  }
  pinBtn.addEventListener('click', () => {
    if (state.pin) {           // remove existing pin
      state.pin = null; state.pinArmed = false;
      if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
    } else {
      state.pinArmed = !state.pinArmed;
      if (state.pinArmed && window.innerWidth <= 780) $('sidebar').classList.remove('open');
    }
    setPinButton();
    applyFilters();
  });
  function placePin(latlng) {
    state.pin = { lat: latlng.lat, lng: latlng.lng };
    state.pinArmed = false;
    if (pinMarker) map.removeLayer(pinMarker);
    pinMarker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({ className: 'ev-marker', html: '📌', iconSize: [26, 26], iconAnchor: [4, 24] }),
    }).addTo(map);
    pinMarker.bindTooltip('Sorting by distance from here — drag me, tap button to remove', { direction: 'top' });
    pinMarker.on('dragend', () => { placePin(pinMarker.getLatLng()); });
    setPinButton();
    applyFilters();
    if (window.innerWidth <= 780) $('sidebar').classList.add('open'); // show the sorted list
  }
  map.on('click', e => { if (state.pinArmed) placePin(e.latlng); });

  // long-press (mobile) or right-click (desktop) drops the pin directly, no arming needed
  map.on('contextmenu', e => { clearTimeout(lpTimer); lpTimer = null; placePin(e.latlng); });
  const mapEl = map.getContainer();
  let lpTimer = null, lpStart = null;
  mapEl.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    lpStart = [t.clientX, t.clientY];
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {   // iOS fires no contextmenu on long-press — emulate it
      lpTimer = null;
      const r = mapEl.getBoundingClientRect();
      placePin(map.containerPointToLatLng(L.point(lpStart[0] - r.left, lpStart[1] - r.top)));
    }, 550);
  }, { passive: true });
  mapEl.addEventListener('touchmove', ev => {
    if (!lpTimer || !lpStart) return;
    const t = ev.touches[0];
    if (Math.hypot(t.clientX - lpStart[0], t.clientY - lpStart[1]) > 12) { clearTimeout(lpTimer); lpTimer = null; }
  }, { passive: true });
  ['touchend', 'touchcancel'].forEach(n => mapEl.addEventListener(n, () => { clearTimeout(lpTimer); lpTimer = null; }));

  // ---------- mobile sidebar ----------
  $('sidebar-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  // touching the map collapses the sidebar back into the ☰ bubble
  ['touchstart', 'mousedown'].forEach(evt =>
    document.getElementById('map').addEventListener(evt, () => {
      if (window.innerWidth <= 780) $('sidebar').classList.remove('open');
    }, { passive: true }));

  // ---------- init ----------
  restoreHash();
  applyFilters();
})();
