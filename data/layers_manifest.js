window.LAYERS = [
 {
  "key": "kuehle-orte",
  "title": "Cool indoor places (Kühle Orte)",
  "emoji": "❄️",
  "file": "kuehle-orte.js",
  "info": "Air-conditioned/cool public rooms from Berlin's official Erfrischungskarte (ODIS/Technologiestiftung).",
  "source_url": "https://github.com/technologiestiftung/erfrischungskarte-daten",
  "pointStyle": {
   "fillColor": "#00b4d8"
  },
  "titleProp": "name",
  "popupProps": [
   "info",
   "category"
  ]
 },
 {
  "key": "trinkbrunnen",
  "title": "Drinking fountains",
  "emoji": "🚰",
  "file": "trinkbrunnen.js",
  "info": "Berliner Wasserbetriebe public drinking fountains (open data).",
  "source_url": "https://daten.berlin.de/datensaetze/trinkbrunnen",
  "pointStyle": {
   "fillColor": "#3a86ff",
   "radius": 4
  },
  "titleProp": "standort",
  "popupProps": [
   "bezirk",
   "trinkbrunnenart"
  ]
 },
 {
  "key": "wasserspielplaetze",
  "title": "Water playgrounds (Planschen)",
  "emoji": "⛲",
  "file": "wasserspielplaetze.js",
  "info": "Public water playgrounds from the Erfrischungskarte dataset.",
  "source_url": "https://github.com/technologiestiftung/erfrischungskarte-daten",
  "pointStyle": {
   "fillColor": "#06d6a0"
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 },
 {
  "key": "schwimmbaeder",
  "title": "Public pools (Berliner Bäder)",
  "emoji": "🏊",
  "file": "schwimmbaeder.js",
  "info": "All Berliner Bäder pools (indoor & outdoor), open data.",
  "source_url": "https://daten.berlin.de/",
  "pointStyle": {
   "fillColor": "#7209b7"
  },
  "titleProp": "name_des_schwimmbads",
  "popupProps": [
   "adresse",
   "badkategorie",
   "link_zum_bad"
  ]
 },
 {
  "key": "badestellen",
  "title": "Lakes & lidos (Badestellen)",
  "emoji": "🏖️",
  "file": "badestellen.js",
  "info": "Official bathing spots and lidos (Strandbäder + Badestellen).",
  "source_url": "https://www.berlin.de/lageso/gesundheit/gesundheitsschutz/badegewaesser/",
  "pointStyle": {
   "fillColor": "#ffd166"
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 },
 {
  "key": "picknick",
  "title": "Picnic tables",
  "emoji": "🧺",
  "file": "picknick.js",
  "info": "Public picnic tables (Erfrischungskarte dataset).",
  "source_url": "https://github.com/technologiestiftung/erfrischungskarte-daten",
  "pointStyle": {
   "fillColor": "#9ef01a",
   "radius": 3
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 },
 {
  "key": "shady-green",
  "title": "Shady green spots",
  "emoji": "🌳",
  "file": "shady-green.js",
  "info": "Green areas good for shade on hot days (filtered Erfrischungskarte points). Big layer — may take a second.",
  "source_url": "https://github.com/technologiestiftung/erfrischungskarte-daten",
  "pointStyle": {
   "fillColor": "#2d6a4f",
   "radius": 3
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 },
 {
  "key": "fsme-risk",
  "title": "Tick / FSME risk districts (RKI)",
  "emoji": "🕷️",
  "file": "fsme-risk.js",
  "info": "RKI 2026: no Berlin district is an FSME risk area; 5 districts in SE Brandenburg are (shown). Ticks exist everywhere — this is about the FSME virus specifically.",
  "source_url": "https://www.rki.de/DE/Themen/Infektionskrankheiten/Infektionskrankheiten-A-Z/F/FSME/Karte.html",
  "pointStyle": {
   "fillColor": "#d00000",
   "radius": 14,
   "fillOpacity": 0.35
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 },
 {
  "key": "eps-bezirke",
  "title": "Oak processionary (EPS) by district",
  "emoji": "🐛",
  "file": "eps-bezirke.js",
  "info": "Official Pflanzenschutzamt reports (district level; no exact nest coordinates published). All 12 districts affected since ~2015; badge shows severity. Season: May–Sep.",
  "source_url": "https://www.berlin.de/pflanzenschutzamt/stadtgruen/schadorganismen-in-berlin/tierische-schaderreger/eichenprozessionsspinner/",
  "pointStyle": {
   "fillColor": "#e85d04",
   "radius": 12,
   "fillOpacity": 0.4
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 },
 {
  "key": "eps-reports",
  "title": "EPS sightings 2026 (citizen reports)",
  "emoji": "📍",
  "file": "eps-reports.js",
  "info": "Unofficial citizen-reported oak-processionary sightings this season, from eichenprozessionsspinner-melden.de (not verified by authorities).",
  "source_url": "https://eichenprozessionsspinner-melden.de",
  "pointStyle": {
   "fillColor": "#f72585",
   "radius": 5
  },
  "titleProp": "name",
  "popupProps": [
   "info"
  ]
 }
];
