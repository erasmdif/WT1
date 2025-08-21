import { getPath } from '../../path_utils.js';

export function addObjectsLayer(map, objectFeatures) {
  const size = 32;

  // === Panes sotto i marker (per non catturare i click) ===
  const basePane  = map.getPane('basePointsPane') || map.createPane('basePointsPane');
  basePane.style.zIndex = 350; // marker pane ~ 600
  const linesPane = map.getPane('linesPane') || map.createPane('linesPane');
  linesPane.style.zIndex = 360;

  // Gruppi NON interattivi (puntini + linee) — ricreati ogni volta
  const lineLayerGroup  = L.layerGroup([], { pane: 'linesPane' }).addTo(map);
  const basePointsGroup = L.layerGroup([], { pane: 'basePointsPane' }).addTo(map);

  // === Cluster ===
  const clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 20,
    showCoverageOnHover: false,
    iconCreateFunction: function (cluster) {
      const totalN = cluster.getAllChildMarkers()
        .reduce((sum, m) => sum + (Number(m.options?.nCount) || 1), 0);

      return L.divIcon({
        html: `
          <div style="
            width:36px;height:36px;line-height:36px;border-radius:50%;
            background:#fff;border:2px solid #000;text-align:center;font-weight:bold;">
            ${totalN}
          </div>`,
        className: 'cluster-icon',
        iconSize: [36, 36]
      });
    }
  });

  // Spiderfy su click
  clusterGroup.on('clusterclick', (e) => e.layer.spiderfy());

  let added = 0;

  objectFeatures.forEach((f) => {
    const props = f.properties || {};
    const geom  = f.geometry;
    if (!geom || !geom.type) return;

    let coord;
    if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
      coord = geom.coordinates[0];
    } else if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      coord = geom.coordinates;
    }
    if (!coord || coord.length < 2) return;

    const latlng    = L.latLng(coord[1], coord[0]);
    const nCount    = Number(props.n) || 1;
    const precision = Number.isFinite(Number(props.precision)) ? Number(props.precision) : -1;

    // Puntino base (non interattivo)
    L.circleMarker(latlng, {
      pane: 'basePointsPane',
      radius: 3,
      color: '#000',
      fillColor: '#fff',
      fillOpacity: 1,
      weight: 1,
      interactive: false,
      bubblingMouseEvents: false
    }).addTo(basePointsGroup);

    // Icona (bordo colorato in base a precision + glyph tipologia)
    const tipCat   = normalizeCategory(props.tipologia);
    const iconPath = getIconPathForCategory(tipCat);
    const icon     = makeSimpleIcon(size, nCount, precision, iconPath);

    const marker = L.marker(latlng, {
      icon,
      title: props.tipologia_specifica || props.tipologia || "oggetto",
      nCount,
      riseOnHover: true
    });

    // Dati popup
    const tipologia = props.tipologia || "-";
    const tipSpec   = props.tipologia_specifica || "-";
    const descr     = props.description || "-";
    const layer     = props.layer || "-";
    const ctx       = props.context_detail || "-";

    // Link robusto alla pagina dettaglio
    const detailHref = buildDetailUrl(props.fid);

    const popupContent = `
      <div class="popup-wrapper">
        <div class="popup-info-container">
          <div class="popup-info-item">
            <div class="popup-info-label">TYPE</div>
            <div class="popup-info-main-value">${escapeHtml(tipologia)}</div>
          </div>
          <div class="popup-info-item">
            <div class="popup-info-label">SUBTYPE</div>
            <div class="popup-info-value">${escapeHtml(tipSpec)}</div>
          </div>
          <div class="popup-info-item">
            <div class="popup-info-label">N</div>
            <div class="popup-info-main-value">${nCount}</div>
          </div>
          <div class="popup-info-item">
            <div class="popup-info-label">LAYER</div>
            <div class="popup-info-value">${escapeHtml(layer)}</div>
          </div>
          <div class="popup-info-item span-2">
            <div class="popup-info-label">DESCRIPTION</div>
            <div class="popup-info-value">${escapeHtml(descr)}</div>
          </div>
          <div class="popup-info-item span-2">
            <div class="popup-info-label">CONTEXT</div>
            <div class="popup-info-value">${escapeHtml(ctx)}</div>
          </div>
          <div class="popup-link span-2">
            <a href="${detailHref}" target="_blank" rel="noopener">↗ Open detail page</a>
          </div>
        </div>
      </div>
    `;

    const popupClass = `leaflet-popup-object ${precisionClassName(precision)}`;
    marker.bindPopup(popupContent, { className: popupClass });

    marker.on('click', () => marker.openPopup());

    clusterGroup.addLayer(marker);
    added++;

    // Linea tratteggiata collegamento cluster→marker (non interattiva)
    marker.on('add', () => {
      if (!map.hasLayer(clusterGroup)) return;
      const cluster = clusterGroup.getVisibleParent(marker);
      if (cluster && cluster !== marker) {
        const clusterLatLng = cluster.getLatLng();
        const line = L.polyline([clusterLatLng, latlng], {
          pane: 'linesPane',
          color: '#666',
          weight: 1,
          dashArray: '2,4',
          opacity: 0.7,
          interactive: false,
          bubblingMouseEvents: false
        }).addTo(lineLayerGroup);

        marker._lineToCluster = line;

        cluster.on('move', () => {
          line.setLatLngs([cluster.getLatLng(), latlng]);
        });
      }
    });

    marker.on('remove', () => {
      if (marker._lineToCluster) {
        lineLayerGroup.removeLayer(marker._lineToCluster);
        marker._lineToCluster = null;
      }
    });
  });

  map.addLayer(clusterGroup);

  // === Export: referenze + destroy() per cleanup totale ===
  clusterGroup._basePointsGroup = basePointsGroup;
  clusterGroup._lineLayerGroup  = lineLayerGroup;
  clusterGroup.destroy = () => {
    try { map.removeLayer(clusterGroup); } catch {}
    try { map.removeLayer(basePointsGroup); } catch {}
    try { map.removeLayer(lineLayerGroup); } catch {}
    try { basePointsGroup.clearLayers(); } catch {}
    try { lineLayerGroup.clearLayers(); } catch {}
  };

  console.log(`[ObjectsLayer] markers aggiunti: ${added}`);
  return clusterGroup;
}

/* =========================
   Helpers
   ========================= */

// Precision → colore bordo (inline, no CSS richiesto)
function precisionColor(p) {
  switch (p) {
    case 0: return '#1e88e5'; // blu
    case 1: return '#43a047'; // verde
    case 2: return '#fdd835'; // giallo
    case 3: return '#fb8c00'; // arancione
    case 4: return '#e53935'; // rosso
    default: return '#9e9e9e'; // grigio
  }
}

// tipologia → categoria canonica
function normalizeCategory(tipologia) {
  const t = (tipologia || '').toLowerCase().trim();
  switch (t) {
    case 'animal remains':   return 'animal remains';
    case 'bone remains':     return 'bone remains';
    case 'human remains':    return 'human remains';
    case 'lithic':           return 'lithic';
    case 'metal':            return 'metal';
    case 'personal adorments':
    case 'personal_adorments':
    case 'personal adornments':
    case 'personal-adornments':
      return 'personal adorments';
    case 'pottery':          return 'pottery';
    case 'sample':           return 'sample';
    case 'textile':          return 'textile';
    default:                 return 'other';
  }
}

// categoria → icona
function getIconPathForCategory(cat) {
  const fileByCat = {
    'animal remains':      'animal.png',
    'bone remains':        'bone.png',
    'human remains':       'human.png',
    'lithic':              'lithics.png',
    'metal':               'metal.png',
    'personal adorments':  'personal_adorments.png',
    'pottery':             'pottery.png',
    'sample':              'sample.png',
    'textile':             'textile.png',
    'other':               'other.png',
  };
  const file = fileByCat[cat] || 'other.png';
  return getPath(`images/objects/${file}`);
}

function makeSimpleIcon(size, nCount, precision, iconSrc) {
  const ringColor = precisionColor(precision);
  const fallback  = getPath('images/objects/other.png');
  const precClass = precisionClassName(precision);

  const showBadge = nCount > 1;
  const numText   = (nCount > 99) ? '99+' : String(nCount);
  const fontPx    = Math.max(12, Math.round(size * 0.42));

  // Fetta grande
  const x1 = Math.round(size * 0.0);
  const y1 = 0;
  const x2 = size;
  const y2 = 0;
  const x3 = size;
  const y3 = Math.round(size * 1.0);

  // Baricentro del triangolo
  const cx = (x1 + x2 + x3) / 3; // = 2/3 * size
  const cy = (y1 + y2 + y3) / 3; // = 1/3 * size

  return L.divIcon({
    className: `object-icon ${precClass}`,
    iconSize: [size + 12, size + 12], // extra spazio così nulla viene tagliato
    html: `
      <div style="
        position:relative;
        width:${size}px; height:${size}px;
        border-radius:50%;
        background:#fff;
        border:2px solid ${ringColor};
        box-shadow:0 1px 4px rgba(0,0,0,.25);
        overflow:hidden;              /* tutto resta nel cerchio */
        display:flex; align-items:center; justify-content:center;
        margin:6px;
      ">
        <!-- glyph tipologia -->
        <img alt="" src="${iconSrc}"
             onerror="this.onerror=null;this.src='${fallback}';"
             style="
               width:68%; height:68%;
               object-fit:contain; display:block;
               filter: drop-shadow(0 1px 1px rgba(0,0,0,.15));
               position:relative; z-index:1;   /* sotto all'SVG */
             " />
        ${showBadge ? `
          <!-- wedge + numero disegnati in SVG per layering robusto -->
          <svg viewBox="0 0 ${size} ${size}"
               width="${size}" height="${size}"
               style="position:absolute; inset:0; z-index:3; pointer-events:none;">
            <polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}"
                     fill="rgba(0,0,0,0.95)"></polygon>
            <text x="${cx}" y="${cy}"
                  font-size="${fontPx}" fill="#fff" font-weight="800"
                  text-anchor="middle" dominant-baseline="middle"
                  style="paint-order: stroke; stroke: rgba(0,0,0,0.2); stroke-width:1.4px; letter-spacing:.3px; user-select:none;">
              ${numText}
            </text>
          </svg>
        ` : ``}
      </div>
    `
  });
}

// Costruisce un link alla pagina di dettaglio robusto alla root corrente
function buildDetailUrl(fid) {
  if (fid == null) return '#';
  const base = getPath('record_object/record_object.html');
  const u = new URL(base, window.location.href);
  u.searchParams.set('fid', String(fid));
  return u.toString();
}

// Semplice escape per sicurezza popup
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}

function precisionClassName(p) {
  if (!Number.isFinite(p) || p < 0) return 'precision-unknown';
  const v = Math.max(0, Math.min(4, Math.floor(p)));
  return `precision-${v}`;
}
