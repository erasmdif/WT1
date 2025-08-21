import { addObjectsLayer } from './objects_layer.js';
import { initCategoryFilter } from './filter.js';
import { renderSiteGraph } from './site_graph.js';
import { createTombaPopup } from './popup_tombe.js';
import { getPath } from './path_utils.js';

(async () => {
  const mapEl         = document.getElementById('map');
  const toggleRaster  = document.getElementById('toggle-raster');
  const toggleOggetti = document.getElementById('toggle-oggetti');
  const toggleGrid    = document.getElementById('toggle-grid');
  const toggleIso     = document.getElementById('toggle-iso');

  /* =========================
     SLIDER PRECISION (single bar)
     ========================= */
  const PREC_MIN  = 0;
  const PREC_MAX  = 4;
  const PREC_STEP = 1;

  const precMinInput = document.getElementById('precision-min');
  const precMaxInput = document.getElementById('precision-max');
  const precRangeLbl = document.getElementById('precision-range-label');
  const rangeFillEl  = document.getElementById('precision-range-fill');
  const bubbleMin    = document.getElementById('prec-bubble-min');
  const bubbleMax    = document.getElementById('prec-bubble-max');
  const rangeEl      = document.getElementById('precision-range');

  let currentPrecMin = PREC_MIN;
  let currentPrecMax = PREC_MAX;

  [precMinInput, precMaxInput].forEach(el => {
    if (!el) return;
    el.min = String(PREC_MIN);
    el.max = String(PREC_MAX);
    el.step = String(PREC_STEP);
  });

  const pct = (v) => ((v - PREC_MIN) / (PREC_MAX - PREC_MIN)) * 100;

  function updatePrecisionUI() {
    if (precRangeLbl) {
      precRangeLbl.textContent =
        (currentPrecMin === currentPrecMax) ? `${currentPrecMin}` : `${currentPrecMin}–${currentPrecMax}`;
    }
    const left = pct(currentPrecMin);
    const right = pct(currentPrecMax);

    if (rangeFillEl) {
      rangeFillEl.style.left  = `calc(${left}% )`;
      rangeFillEl.style.width = `calc(${Math.max(0, right - left)}% )`;
    }
    if (bubbleMin) {
      bubbleMin.style.left = `calc(${left}% )`;
      bubbleMin.textContent = String(currentPrecMin);
    }
    if (bubbleMax) {
      bubbleMax.style.left = `calc(${right}% )`;
      bubbleMax.textContent = String(currentPrecMax);
    }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snapToStep(v) {
    const snapped = Math.round((v - PREC_MIN) / PREC_STEP) * PREC_STEP + PREC_MIN;
    return clamp(snapped, PREC_MIN, PREC_MAX);
  }

  // Opzionale: GeoTIFF dal data-attribute di #map (es. data-map-file="images/maps/mappa.tif")
  const mapFileAttr = mapEl?.dataset?.mapFile || null;

  // Inizializza mappa; il fit lo decideremo dopo
  const map = L.map("map", { minZoom: 15, maxZoom: 22 }).setView([0, 0], 18);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CartoDB</a>'
  }).addTo(map);

  // === Panes per controllare lo stack ===
  const gridPane = map.getPane('gridPane') || map.createPane('gridPane');
  gridPane.style.zIndex = 380;
  const isoPane  = map.getPane('isoPane')  || map.createPane('isoPane');
  isoPane.style.zIndex  = 381;

  // === Raster GeoTIFF (opzionale) ===
  let rasterLayer = null;
  if (mapFileAttr) {
    try {
      const tiffResponse = await fetch(getPath(mapFileAttr));
      if (!tiffResponse.ok) throw new Error(`GeoTIFF non trovato: ${mapFileAttr}`);
      const arrayBuffer = await tiffResponse.arrayBuffer();
      const georaster = await parseGeoraster(arrayBuffer);

      rasterLayer = new GeoRasterLayer({ georaster, opacity: 0.7, resolution: 256 });
      rasterLayer.addTo(map);
      console.log("[Raster] caricato con successo:", mapFileAttr);
    } catch (err) {
      console.warn("[Raster] non disponibile:", err);
      rasterLayer = null;
    }
  }

  // === Carica tombe.geojson ===
  let tombeDelSito = [];
  try {
    const tombeResponse = await fetch(getPath("data/tombe.geojson"));
    if (!tombeResponse.ok) throw new Error(`Impossibile caricare data/tombe.geojson`);
    const tombeData = await tombeResponse.json();

    // Tombe root (senza parent)
    tombeDelSito = (tombeData.features || []).filter(t => t.properties?.parent_ID == null);
    console.log(`[Tombe] features totali: ${tombeData.features?.length || 0}, root: ${tombeDelSito.length}`);
  } catch (err) {
    console.error(`[Tombe]`, err);
    alert("Non riesco a caricare le tombe (data/tombe.geojson).");
    return;
  }

  // Grafico tombe nella dashboard (lazy)
  window.renderSiteGraphLazy = () => renderSiteGraph(tombeDelSito);

  // === Carica oggetti.geojson — MOSTRA TUTTI GLI OGGETTI (niente filtro per tomba) ===
  let oggettiDelSito = [];
  try {
    const oggettiResponse = await fetch(getPath("data/oggetti.geojson"));
    if (!oggettiResponse.ok) throw new Error(`Impossibile caricare data/oggetti.geojson`);
    const oggettiData = await oggettiResponse.json();
    oggettiDelSito = oggettiData.features || [];

    console.log(`[Oggetti] caricati: ${oggettiDelSito.length}`);
  } catch (err) {
    console.warn(`[Oggetti]`, err);
    oggettiDelSito = [];
  }

  // === Associa oggetti alle tombe (per popup tombe) ===
  const oggettiPerTomba = {};
  oggettiDelSito.forEach(obj => {
    const key = (obj.properties?.feature ?? obj.properties?.tomba ?? "").trim();
    if (!key) return;
    if (!oggettiPerTomba[key]) oggettiPerTomba[key] = [];
    oggettiPerTomba[key].push(obj);
  });
  console.log("[Associazioni] tombe con oggetti associati:", Object.keys(oggettiPerTomba).length);

  /* ===================================================
     TOMBE: stile per typology + hover highlight
     =================================================== */
  function styleTomba(feature) {
    const typ = (feature?.properties?.typology || '').toString().toLowerCase();
    const styles = {
      'tomb':           { color: '#8B5E34', fillColor: '#D4A373', dashArray: '',      fillOpacity: 0.25 },
      'offering place': { color: '#0F766E', fillColor: '#2DD4BF', dashArray: '4,3',   fillOpacity: 0.20 },
      'feature':        { color: '#334155', fillColor: '#94A3B8', dashArray: '6,4',   fillOpacity: 0.18 }
    };
    const s = styles[typ] || { color: '#6B7280', fillColor: '#CBD5E1', dashArray: '4,2', fillOpacity: 0.18 };
    return { ...s, weight: 1.8, lineJoin: 'round', lineCap: 'round' };
  }

  const tombeLayer = L.geoJSON(tombeDelSito, {
    style: styleTomba,
    onEachFeature: (feature, layer) => {
      layer.on('mouseover', () => {
        layer.setStyle({ weight: 3, fillOpacity: 0.32 });
        try { layer.bringToFront(); } catch (_) {}
      });
      layer.on('mouseout', () => layer.setStyle(styleTomba(feature)));

      const tombaName = feature.properties?.name?.trim();
      const oggetti   = tombaName ? (oggettiPerTomba[tombaName] || []) : [];
      layer.bindPopup(() => createTombaPopup(feature, oggetti), {
        maxWidth: 380, autoPan: true, className: 'popup-tomba-leaflet'
      });
      layer.on("click", () => layer.openPopup());
    }
  }).addTo(map);

  // === Layer oggetti (cluster) — verrà ricreato ad ogni filtro ===
  let clusterGroup = addObjectsLayer(map, oggettiDelSito);

  /* =========================
     GRID (grigliato)
     ========================= */
  let gridLayer = null;
  const gridLabelsGroup = L.layerGroup([], { pane: 'gridPane' });

  async function loadGrid() {
    try {
      const res = await fetch(getPath("data/grid.geojson"));
      if (!res.ok) throw new Error("grid.geojson non trovato");
      const gj = await res.json();

      gridLayer = L.geoJSON(gj, {
        pane: 'gridPane',
        style: () => ({
          color: '#000',
          weight: 0.8,
          opacity: 0.35,
          dashArray: '3,7',
          fill: false
        }),
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.name ?? feature.properties?.NAME ?? feature.properties?.Name ?? '';
          if (!name) return;
          const center = layer.getBounds().getCenter();
          const label = L.marker(center, {
            pane: 'gridPane',
            interactive: false,
            icon: L.divIcon({
              className: 'grid-label',
              html: `<div class="grid-label-box">${escapeHtml(name)}</div>`,
              iconSize: [0,0]
            })
          });
          gridLabelsGroup.addLayer(label);
        }
      });
      console.log('[Grid] features:', gj.features?.length || 0);
    } catch (err) {
      console.warn('[Grid] non caricato:', err.message);
      gridLayer = null;
    }
  }

  /* ===================================================
     ISO (quote/isoipse): color ramp su ELEVATION, senza etichette
     + legenda compatta + tooltip/popup con valore
     =================================================== */
  let isoLayer = null;
  let isoMin = 98, isoMax = 103.6;  // fallback
  const RAMP_STOPS = [
    { p: 0.00, c: '#60a5fa' }, // azzurro
    { p: 0.25, c: '#22c55e' }, // verde
    { p: 0.50, c: '#facc15' }, // giallo
    { p: 0.75, c: '#f59e0b' }, // arancione
    { p: 1.00, c: '#ef4444' }  // rosso
  ];

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:0,g:0,b:0 };
  }
  const lerp = (a,b,t)=>a+(b-a)*t;
  function lerpColor(c1,c2,t){
    const A=hexToRgb(c1),B=hexToRgb(c2);
    return `rgb(${Math.round(lerp(A.r,B.r,t))},${Math.round(lerp(A.g,B.g,t))},${Math.round(lerp(A.b,B.b,t))})`;
  }
  function rampColor01(t){
    t = clamp(t,0,1);
    for(let i=0;i<RAMP_STOPS.length-1;i++){
      const a=RAMP_STOPS[i], b=RAMP_STOPS[i+1];
      if(t>=a.p && t<=b.p){ return lerpColor(a.c,b.c,(t-a.p)/(b.p-a.p)); }
    }
    return RAMP_STOPS.at(-1).c;
  }
  function buildCssGradient(){
    return `linear-gradient(90deg, ${RAMP_STOPS.map(s=>`${s.c} ${s.p*100}%`).join(', ')})`;
  }

  // Legenda compatta (creata dinamicamente sotto al toggle ISO)
  function ensureIsoLegend() {
    if (!toggleIso) return null;
    const anchor = toggleIso.closest('.control-item');
    if (!anchor) return null;

    let legend = document.getElementById('iso-legend');
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'iso-legend';
      legend.className = 'iso-legend hidden';
      legend.innerHTML = `
        <div class="iso-legend-title">Elevation (m)</div>
        <div class="iso-legend-gradient"></div>
        <div class="iso-legend-scale">
          <span class="iso-legend-min">–</span>
          <span class="iso-legend-max">–</span>
        </div>
      `;
      anchor.insertAdjacentElement('afterend', legend);
    }
    return legend;
  }
  function updateIsoLegend(min, max) {
    const legend = ensureIsoLegend();
    if (!legend) return;
    const grad = legend.querySelector('.iso-legend-gradient');
    const minEl = legend.querySelector('.iso-legend-min');
    const maxEl = legend.querySelector('.iso-legend-max');
    if (grad) grad.style.background = buildCssGradient();
    if (minEl) minEl.textContent = min.toFixed(1);
    if (maxEl) maxEl.textContent = max.toFixed(1);
    updateIsoLegendVisibility();
  }
  function updateIsoLegendVisibility() {
    const legend = document.getElementById('iso-legend');
    if (!legend) return;
    const show = !!(toggleIso?.checked && isoLayer);
    legend.classList.toggle('hidden', !show);
  }

  async function loadIso() {
    try {
      const res = await fetch(getPath("data/iso.geojson"));
      if (!res.ok) throw new Error("iso.geojson non trovato");
      const gj = await res.json();

      // dominio ELEVATION
      let minE = Number.POSITIVE_INFINITY;
      let maxE = Number.NEGATIVE_INFINITY;
      (gj.features || []).forEach(ft => {
        const e = parseFloat(ft.properties?.ELEVATION ?? ft.properties?.elevation);
        if (Number.isFinite(e)) { if (e < minE) minE = e; if (e > maxE) maxE = e; }
      });
      if (!Number.isFinite(minE) || !Number.isFinite(maxE)) { minE = isoMin; maxE = isoMax; }
      isoMin = minE; isoMax = maxE;
      const span = Math.max(1e-6, isoMax - isoMin);

      isoLayer = L.geoJSON(gj, {
        pane: 'isoPane',
        style: (ft) => {
          const e = parseFloat(ft.properties?.ELEVATION ?? ft.properties?.elevation);
          const t = Number.isFinite(e) ? (e - isoMin) / span : 0.5;
          return { color: rampColor01(t), weight: 1.4, opacity: 0.85, dashArray: '3,6' };
        },
        onEachFeature: (ft, layer) => {
          const e = parseFloat(ft.properties?.ELEVATION ?? ft.properties?.elevation);
          const text = Number.isFinite(e) ? `Elevation: <b>${e.toFixed(2)} m</b>` : 'Elevation: n/a';
          layer.bindTooltip(text, { sticky: true, direction: 'top', className: 'iso-tooltip', opacity: 0.95 });
          layer.on('click', (ev) => {
            L.popup({ className: 'iso-popup' })
              .setLatLng(ev.latlng)
              .setContent(text)
              .openOn(map);
          });
        }
      });

      // Aggiorna legenda
      updateIsoLegend(isoMin, isoMax);
      console.log('[ISO] color ramp attivo — range:', isoMin, '→', isoMax);
    } catch (err) {
      console.warn('[ISO] non caricato:', err.message);
      isoLayer = null;
      updateIsoLegendVisibility();
    }
  }

  // Carica grid & iso
  await Promise.all([loadGrid(), loadIso()]);

  /* =========================
     ZOOM-BASED LABEL VISIBILITY (solo GRID)
     ========================= */
  const GRID_LABEL_ZOOM = 18;
  function updateLabelVisibility() {
    const z = map.getZoom();
    const gridOn = !!toggleGrid?.checked && gridLayer && map.hasLayer(gridLayer);
    const showGridLabels = gridOn && z >= GRID_LABEL_ZOOM;

    if (showGridLabels) {
      if (!map.hasLayer(gridLabelsGroup)) map.addLayer(gridLabelsGroup);
    } else {
      if (map.hasLayer(gridLabelsGroup)) map.removeLayer(gridLabelsGroup);
    }
  }
  map.on('zoomend', updateLabelVisibility);

  // Aggiungi i layer opzionali se i toggle sono ON
  if (gridLayer && toggleGrid?.checked) {
    map.addLayer(gridLayer);
    updateLabelVisibility();
  }
  if (isoLayer && toggleIso?.checked) {
    map.addLayer(isoLayer);
  }
  ensureIsoLegend();
  updateIsoLegendVisibility();

  /* =========================
     FIT HELPERS
     ========================= */
  function fitToObjects(layer) {
    try {
      if (layer && layer.getBounds && layer.getBounds().isValid()) {
        const b = layer.getBounds();
        map.fitBounds(b, { padding: [20, 20], maxZoom: 21 });
        return true;
      }
    } catch (e) { /* no-op */ }
    return false;
  }
  function fitToRaster(layer) {
    try {
      if (layer && layer.getBounds) {
        const b = layer.getBounds();
        map.fitBounds(b, { padding: [20, 20] });
        return true;
      }
    } catch (e) { /* no-op */ }
    return false;
  }
  function fitToTombe(layer) {
    try {
      if (layer && layer.getBounds && layer.getBounds().isValid()) {
        const b = layer.getBounds();
        map.fitBounds(b, { padding: [20, 20] });
        return true;
      }
    } catch (e) { /* no-op */ }
    return false;
  }
  function fitInitialView() {
    if (fitToObjects(clusterGroup)) return;
    if (fitToRaster(rasterLayer)) return;
    fitToTombe(tombeLayer);
  }

// Fit iniziale
fitInitialView();

// Zoom "dolce": +2 ma senza superare una soglia
const INITIAL_ZOOM_DELTA   = 2;
const INITIAL_ZOOM_CEILING = 19; // scegli 18/19/20 a gusto

const z = map.getZoom();
const next = Math.min(z + INITIAL_ZOOM_DELTA, INITIAL_ZOOM_CEILING);

if (next > z) {
  map.setZoom(next, { animate: false });
}

// Poi aggiorna etichette
updateLabelVisibility();

  /* =========================
     FILTRO CATEGORIE + PRECISION
     ========================= */
  let lastCategoryFiltered = oggettiDelSito.slice();
  const AUTO_FIT_ON_FILTER = false;

  function applyAllFilters(categorySubset) {
    lastCategoryFiltered = categorySubset.slice();
  
    const filtered = lastCategoryFiltered.filter(f => {
      const p = Number(f?.properties?.precision);
      if (!Number.isFinite(p) || p < 0) return false;
      return p >= currentPrecMin && p <= currentPrecMax;
    });
  
    const prevCenter = map.getCenter();
    const prevZoom   = map.getZoom();
  
    // 🔴 RIMOZIONE COMPLETA del precedente
    if (clusterGroup) {
      try { map.removeLayer(clusterGroup); } catch {}
      clusterGroup.destroy?.(); // <— importante
    }
  
    clusterGroup = addObjectsLayer(map, filtered);
  
    const oggChecked = document.getElementById('toggle-oggetti')?.checked ?? true;
  
    if (oggChecked) {
      if (AUTO_FIT_ON_FILTER) {
        if (!fitToObjects(clusterGroup)) {
          if (!fitToRaster(rasterLayer)) fitToTombe(tombeLayer);
        }
      } else {
        map.setView(prevCenter, prevZoom, { animate: false });
      }
    } else {
      // Se il toggle è OFF, togli anche i gruppi non interattivi
      try { map.removeLayer(clusterGroup); } catch {}
      clusterGroup._basePointsGroup && map.removeLayer(clusterGroup._basePointsGroup);
      clusterGroup._lineLayerGroup  && map.removeLayer(clusterGroup._lineLayerGroup);
    }
  }  

  // Inizializza barra categorie
  initCategoryFilter(oggettiDelSito, (oggettiFiltrati) => {
    applyAllFilters(oggettiFiltrati);
  });

  // ---- Eventi slider precision ----
  let precApplyTimer = null;

  function normalizeAndApply() {
    if (!precMinInput || !precMaxInput) return;

    const aRaw = Number(precMinInput.value);
    const bRaw = Number(precMaxInput.value);

    let a = Number.isFinite(aRaw) ? snapToStep(aRaw) : PREC_MIN;
    let b = Number.isFinite(bRaw) ? snapToStep(bRaw) : PREC_MAX;

    if (a > b) [a, b] = [b, a];

    currentPrecMin = a;
    currentPrecMax = b;

    precMinInput.value = String(a);
    precMaxInput.value = String(b);

    // UI immediata
    updatePrecisionUI();

    // Applica filtro con debounce (snellisce durante il drag)
    clearTimeout(precApplyTimer);
    precApplyTimer = setTimeout(() => {
      applyAllFilters(lastCategoryFiltered);
    }, 80);
  }
  precMinInput?.addEventListener('input', normalizeAndApply);
  precMaxInput?.addEventListener('input', normalizeAndApply);

  // click sulla track: sposta il thumb più vicino
  if (rangeEl) {
    rangeEl.addEventListener('pointerdown', (e) => {
      const rect = rangeEl.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const raw = PREC_MIN + x * (PREC_MAX - PREC_MIN);
      const value = snapToStep(raw);

      const distMin = Math.abs(value - currentPrecMin);
      const distMax = Math.abs(value - currentPrecMax);
      const target = (distMin <= distMax) ? precMinInput : precMaxInput;

      target.value = String(value);
      normalizeAndApply();
    });
  }

  // UI iniziale coerente con i valori di default
  updatePrecisionUI();

  /* =========================
     SWITCH LAYERS
     ========================= */
  // Raster
  if (toggleRaster) {
    if (!rasterLayer) {
      const ci = toggleRaster.closest('.control-item');
      if (ci) ci.style.display = 'none';
    } else {
      toggleRaster.addEventListener('change', (e) => {
        if (e.target.checked) map.addLayer(rasterLayer);
        else map.removeLayer(rasterLayer);
      });
    }
  } else {
    console.warn("Toggle raster non trovato nel DOM");
  }

  // Oggetti
  if (toggleOggetti) {
    toggleOggetti.addEventListener('change', (e) => {
      const checked = !!e.target.checked;
      if (!clusterGroup) return;
  
      const base = clusterGroup._basePointsGroup;
      const line = clusterGroup._lineLayerGroup;
  
      if (checked) {
        map.addLayer(clusterGroup);
        base && map.addLayer(base);
        line && map.addLayer(line);
        fitToObjects(clusterGroup);
      } else {
        map.removeLayer(clusterGroup);
        base && map.removeLayer(base);
        line && map.removeLayer(line);
      }
    });
  } else {
    console.warn("Toggle oggetti non trovato nel DOM");
  }

  // Grid
  if (toggleGrid) {
    if (!gridLayer) {
      const ci = toggleGrid.closest('.control-item');
      if (ci) ci.style.display = 'none';
    } else {
      toggleGrid.addEventListener('change', (e) => {
        if (e.target.checked) {
          map.addLayer(gridLayer);
          updateLabelVisibility(); // aggiunge le labels solo se zoom ok
        } else {
          map.removeLayer(gridLayer);
          if (map.hasLayer(gridLabelsGroup)) map.removeLayer(gridLabelsGroup);
        }
      });
    }
  } else {
    console.warn("Toggle grid non trovato nel DOM");
  }

  // Iso (linee colorate + tooltip)
  if (toggleIso) {
    if (!isoLayer) {
      const ci = toggleIso.closest('.control-item');
      if (ci) ci.style.display = 'none';
    } else {
      toggleIso.addEventListener('change', (e) => {
        if (e.target.checked) {
          map.addLayer(isoLayer);
        } else {
          map.removeLayer(isoLayer);
        }
        updateIsoLegendVisibility();
      });
    }
  } else {
    console.warn("Toggle iso non trovato nel DOM");
  }

  /* ===== Helpers ===== */
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
    );
  }
})();
