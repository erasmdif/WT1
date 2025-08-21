import { getPath } from "../path_utils.js";

/**
 * record_object.js — versione multi-CSV con "Components characteristics" filtrabili
 * - ?fid=...
 * - GeoJSON oggetti → testata generale
 * - CSV (in base a tipologia / tipologia_specifica) → righe con stesso TAG
 * - Riepilogo "components": chip per gruppi (materiali, colori, tipo, ...)
 *   - Click chip = filtro (OR within group, AND across groups)
 */

const params = new URLSearchParams(window.location.search);
const fid = params.get("fid");
const OGGETTI_URL = getPath("data/oggetti.geojson");

/** Alias CSV (normalizzati) */
const CSV_ALIASES = {
  // tipologia
  "personal adorments": "personal_adorments",
  "personal_adorments": "personal_adorments",
  "lithics": "lithics",
  // tipologia_specifica
  "egyptian_pottery": "egyptian_pottery",
};

/** Config differenziata per CSV:
 *  - groups: [[colonnaCSV, etichettaGruppo]]
 *  - preferred/long: campi da mostrare nelle card
 *  - exclude: campi ridondanti da non mostrare
 */
const DETAIL_CONFIG = {
  egyptian_pottery: {
    groups: [
      ["Fabric", "Fabric"],
      ["Fabric variant", "Variant"],
      ["General shape", "Shape"],
      ["Pottery type", "Type"],
    ],
    title: (row, g) => joinMini([g("General shape"), g("Pottery type")]),
    preferred: [
      ["Fabric", "Fabric"],
      ["Fabric variant", "Fabric variant"],
      ["Slip and painted decoration", "Slip/painted decoration"],
      ["Burnishing and polishing", "Burnishing/polishing"],
      ["Shaping process: primary", "Shaping (primary)"],
      ["Shaping process: rim", "Shaping (rim)"],
      ["Shaping process: base", "Shaping (base)"],
      ["Shaping process: comments", "Shaping (comments)"],
      ["Part", "Part"],
      ["Drawing number", "Drawing #"],
    ],
    long: [
      ["Description", "Description"],
      ["Notes", "Notes"],
    ],
    exclude: new Set([
      "Cemetery","Year","TS","PPA","Tag","Quadrant","Excavation Trench","Sq",
      "Layer","L1 details","Feature","Offering Place","Tomb","ID"
    ]),
  },

  personal_adorments: {
    groups: [
      ["Material gen", "Material"],
      ["Material spec", "Material spec"],
      ["Color", "Color"],
      ["Status (Entire/broken)", "Status"],
      ["Artifact type", "Type"],
      ["Proportion", "Proportion"],
    ],
    title: (row, g) => joinMini([g("Artifact Class"), g("Artifact type"), g("Proportion")]),
    preferred: [
      ["Proportion","Proportion"],
      ['Long section (Cylindrical, biconical, barrel)', "Long section"],
      ['Trans section (Round, flat, rectangular)', "Trans section"],
      ["Material gen","Material gen"],
      ["Material spec","Material spec"],
      ["Color","Color"],
      ["Color Munsell","Color Munsell"],
      ["Status (Entire/broken)","Status"],
      ["Stage","Stage"],
      ['Surface traces (Chipped, Ground, Polished, Worn)', "Surface traces"],
      ["Length MAX","Length MAX"],
      ["Width (cm)","Width (cm)"],
      ["Thickness (cm)","Thickness (cm)"],
      ["Dia MAX (cm)","Dia MAX (cm)"],
      ["Dia MIN (cm)","Dia MIN (cm)"],
      ["Hole Dia 1 (cm)","Hole Dia 1 (cm)"],
      ["Hole Dia 2 (cm)","Hole Dia 2 (cm)"],
      ["Perforation tech (Drilling / Pecking/ind)","Perforation tech"],
      ['Drill act (Im) (Drilling actions (Impression) Single /multiple/stepped (No. steps))','Drill act (Im)'],
      ['Drill direct (Im) (One side / Two sides)','Drill direct (Im)'],
      ['Drill section (Im) - Cylindrical, tapered, conical','Drill section (Im)'],
      ['Drill surface (Im) - Parallel striae, irregular striae, smoothed, etc.','Drill surface (Im)'],
      ['Drill tech  (Im) - Stone drill, Ernestite drill, Solid copper, Tubular copper','Drill tech (Im)'],
      ['Bead end 1 - Chipped, Ground, Polished','Bead end 1'],
      ['Bead end 2 - Chipped, Ground, Polished','Bead end 2'],
    ],
    long: [
      ["Notes","Notes"]
    ],
    exclude: new Set([
      "Cemetery","Year","TS","PPA","tag","Quadrant","Excavation Trench","Sq",
      "Layer","L1 details","Feature","Offering Place","Tomb","Photo","ID"
    ]),
  },

  lithics: {
    groups: [
      ["Artifact type", "Type"],
      ["Material gen", "Material"],
      ["Material spec", "Material spec"],
      ["Color", "Color"],
      ["Status (Entire/broken)", "Status"],
    ],
    title: (row, g) => joinMini([g("Artifact type"), joinMini([g("Material gen"), g("Material spec")], " · ")]),
    preferred: [
      ["Material gen","Material gen"],
      ["Material spec","Material spec"],
      ["Color","Color"],
      ["Color Munsell","Color Munsell"],
      ["Status (Entire/broken)","Status"],
      ["Length MAX (cm)","Length MAX (cm)"],
      ["Thickness (cm)","Thickness (cm)"],
      ["Width (cm)","Width (cm)"],
      ["Dia MAX 1 (cm)","Dia MAX 1 (cm)"],
      ["Dia MIN 1 (cm)","Dia MIN 1 (cm)"],
    ],
    long: [
      ["Notes","Notes"]
    ],
    exclude: new Set([
      "Cemetery","Year","TS","PPA","Tag","Quadrant","Excavation Trench","Sq",
      "Layer","L1 details","Feature","Offering Place","Tomb","Photo","ID"
    ]),
  }
};

/* ---------- stato locale per i filtri chip ---------- */
const STATE = {
  csvName: null,
  rowsAll: [],                 // tutte le righe del CSV per il TAG
  filters: new Map(),          // Map<groupKeyCSV, Set<valueNorm>>
};

(async function init() {
  try {
    if (!fid) return renderError("Missing ?fid");

    const oggettiRes = await fetch(OGGETTI_URL);
    if (!oggettiRes.ok) throw new Error("Cannot load oggetti.geojson");
    const oggetti = await oggettiRes.json();

    const record = oggetti.features.find(f => String(f.properties?.fid) === String(fid));
    if (!record) return renderError("Object not found");

    const p = record.properties || {};
    renderGeneral(p);

    const csvName = pickCsvFile(p);
    STATE.csvName = csvName;

    if (!csvName) {
      setItemsMeta("—", 0, p.n);
      renderCharacteristics(null, []); // vuoto
      return showNoItems("No CSV matched from tipologia / tipologia_specifica.");
    }

    const csvUrl = getPath(`data/${csvName}.csv`);
    document.getElementById("items-source").textContent = `${csvName}.csv`;

    const csvText = await fetchText(csvUrl);
    if (!csvText) {
      setItemsMeta(csvName, 0, p.n);
      renderCharacteristics(csvName, []); // vuoto
      return showNoItems(`CSV not found: ${csvName}.csv`);
    }

    const rows = parseCSV(csvText);
    if (!rows.length) {
      setItemsMeta(csvName, 0, p.n);
      renderCharacteristics(csvName, []); // vuoto
      return showNoItems("Empty CSV.");
    }

    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1).map(cols =>
      Object.fromEntries(headers.map((h, i) => [h, (cols[i] ?? "").trim()]))
    );

    // TAG: case-insensitive col
    const tagHeader = headers.find(h => h.toLowerCase() === "tag") || "tag";
    const recTag = String(p.tag ?? "").trim();
    const rowsForTag = dataRows.filter(r => String(getVal(r, tagHeader)) === recTag);

    STATE.rowsAll = rowsForTag;
    renderCharacteristics(csvName, rowsForTag);   // crea chip
    rerender(p.n);                                // mostra card (nessun filtro => tutte)
  } catch (err) {
    console.error(err);
    renderError("Error loading data");
  }
})();

/* =========================================================
   UI
   ========================================================= */

function renderError(msg){
  document.getElementById("sigla").textContent = msg;
  document.getElementById("original_description").textContent = "";
  document.getElementById("fields").innerHTML = "";
  setItemsMeta("—", 0, 0);
  renderCharacteristics(null, []);
  showNoItems("—");
}

function renderGeneral(p){
  const title = p.sigla || p.tipologia_specifica || p.tipologia || `Object #${p.fid}`;
  const desc  = p.original_description || p.description || "";

  document.getElementById("sigla").textContent = title;
  document.getElementById("original_description").textContent = desc;

  const fields = [
    { label: "Tag", value: p.tag },
    { label: "Type", value: p.tipologia || "-" },
    { label: "Subtype", value: p.tipologia_specifica || "-" },
    { label: "Quantity (n)", value: p.n },
    { label: "Site", value: p.site },
    { label: "Area", value: p.area },
    { label: "Square", value: p.square },
    { label: "Layer", value: p.layer },
    { label: "Context", value: p.context_detail },
    { label: "Feature", value: p.feature },
    { label: "Survey type", value: p.type },
    { label: "Date", value: p.date },
    { label: "Notes", value: p.notes || p.notes_november_2024 }
  ];

  const fieldsBox = document.getElementById("fields");
  fieldsBox.innerHTML = "";
  fields.forEach(({label, value}) => {
    const v = (value ?? "").toString().trim();
    if (!v) return;
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `
      <span class="label">${escapeHtml(label)}</span>
      <div class="value">${escapeHtml(v)}</div>
    `;
    fieldsBox.appendChild(f);
  });
}

/* ---------- Characteristics (chip) ---------- */

function ensureComponentsHost() {
  let host = document.getElementById("components");
  if (!host) {
    host = document.createElement("div");
    host.id = "components";
    host.className = "components";
    // lo inseriamo prima dell'hr .section-sep (se presente)
    const sep = document.querySelector(".section-sep");
    const infoBox = document.querySelector(".info-box");
    if (sep && infoBox) infoBox.insertBefore(host, sep);
    else document.body.appendChild(host);
  }
  return host;
}

function renderCharacteristics(csvName, rows) {
  const host = ensureComponentsHost();
  host.innerHTML = "";

  if (!csvName || !rows.length) {
    host.style.display = "none";
    return;
  }
  host.style.display = "block";

  const cfg = DETAIL_CONFIG[csvName];
  if (!cfg || !cfg.groups?.length) return;

  // Aggrega valori per ciascun gruppo
  const groups = cfg.groups
    .map(([key, label]) => {
      const counts = new Map(); // Map<valueDisplay, count>
      rows.forEach(row => {
        const raw = getVal(row, key);
        splitMulti(raw).forEach(v => {
          if (!v) return;
          const disp = v; // mantieni stringa originale come display
          counts.set(disp, (counts.get(disp) || 0) + 1);
        });
      });
      // se un gruppo non ha alcun valore, salta
      if (counts.size === 0) return null;

      // ordina per frequenza desc poi alfabetico
      const items = Array.from(counts.entries())
        .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return { key, label, items };
    })
    .filter(Boolean);

  if (!groups.length) {
    host.style.display = "none";
    return;
  }

  // Header
  const header = document.createElement("div");
  header.className = "char-header";
  header.innerHTML = `<h3>Components characteristics</h3>
                      <button class="chip ghost" data-action="clear-all">Clear filters</button>`;
  host.appendChild(header);

  // Riga gruppi
  const rowEl = document.createElement("div");
  rowEl.className = "char-row";
  host.appendChild(rowEl);

  groups.forEach(g => {
    const groupEl = document.createElement("div");
    groupEl.className = "char-group";
    groupEl.innerHTML = `<div class="char-label">${escapeHtml(g.label)}:</div>
                         <div class="chips"></div>`;
    const chipsEl = groupEl.querySelector(".chips");

    g.items.forEach(([val, count]) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.groupKey = g.key;             // nome colonna CSV
      btn.dataset.vnorm = norm(val);            // per confronto
      btn.title = `${val} (${count})`;
      btn.innerHTML = `${escapeHtml(val)} <span class="count">${count}</span>`;
      chipsEl.appendChild(btn);
    });

    if (!host.dataset.listenerAttached) {
      host.addEventListener("click", onChipClick);
      host.dataset.listenerAttached = "1";
    }

    rowEl.appendChild(groupEl);
  });

  // Delegazione eventi: toggle chip & clear
  host.addEventListener("click", onChipClick);
}

function onChipClick(e) {
  // 1) prima gestisco il reset (ha data-action="clear-all")
  const resetBtn = e.target.closest('button[data-action="clear-all"]');
  if (resetBtn) {
    STATE.filters.clear();
    document.querySelectorAll(".components .chip.active").forEach(el => el.classList.remove("active"));
    rerender();
    return;
  }

  // 2) poi gestisco le chip “vere”
  const btn = e.target.closest("button.chip");
  if (!btn) return;

  const groupKey = btn.dataset.groupKey;
  const valueKey = btn.dataset.vnorm;

  // se per qualunque motivo manca metadata, esco
  if (!groupKey || !valueKey) return;

  if (!STATE.filters.has(groupKey)) STATE.filters.set(groupKey, new Set());
  const set = STATE.filters.get(groupKey);

  if (set.has(valueKey)) {
    set.delete(valueKey);
    btn.classList.remove("active");
    if (set.size === 0) STATE.filters.delete(groupKey);
  } else {
    set.add(valueKey);
    btn.classList.add("active");
  }

  rerender();
}


/* ---------- Cards ---------- */

function rerender(expectedN = null) {
  const csvName = STATE.csvName;
  const all = STATE.rowsAll || [];
  const visible = applyFilters(all, STATE.filters);
  setItemsMeta(csvName || "—", visible.length, expectedN ?? null, all.length);
  renderDetailCards(csvName, visible);
}

function setItemsMeta(csvName, shownCount, expectedN, totalCount=null){
  const countEl = document.getElementById("items-count");
  if (!countEl) return;
  const parts = [];
  if (totalCount != null) parts.push(`${shownCount}/${totalCount} rows`);
  else parts.push(`${shownCount} rows`);
  if (Number.isFinite(Number(expectedN))) parts.push(`n=${expectedN}`);
  countEl.textContent = parts.join(" · ");
}

function renderDetailCards(csvName, rows){
  const grid = document.getElementById("items-grid");
  grid.innerHTML = "";

  if (!rows.length) {
    showNoItems("No matching rows for the current filters.");
    return;
  }
  document.getElementById("no-items").style.display = "none";

  const cfg = DETAIL_CONFIG[csvName] || null;

  rows.forEach(row => {
    const get = key => getVal(row, key);

    const id = getAny(row, ["ID","Id","id"]) || "";
    const titleMini = cfg?.title ? cfg.title(row, get) : defaultMini(row);

    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-title">
        <div class="id">${escapeHtml(id || "(no ID)")}</div>
        <div class="mini">${escapeHtml(titleMini)}</div>
      </div>
      <div class="item-fields"></div>
    `;

    const wrap = card.querySelector(".item-fields");

    if (cfg) {
      cfg.preferred.forEach(spec => {
        const [key, label] = Array.isArray(spec) ? spec : [spec, spec];
        const v = getVal(row, key);
        if (hasValue(v)) wrap.appendChild(makeItemField(label, v));
      });
      cfg.long.forEach(spec => {
        const [key, label] = Array.isArray(spec) ? spec : [spec, spec];
        const v = getVal(row, key);
        if (hasValue(v)) wrap.appendChild(makeItemField(label, v, true));
      });
    } else {
      // Fallback generico
      const EXCLUDE = new Set(["ID","Cemetery","Year","TS","PPA","Tag","tag","Layer","L1 details","Feature","Tomb","Photo","Notes"]);
      Object.keys(row).forEach(k => {
        if (EXCLUDE.has(k)) return;
        const v = row[k];
        if (hasValue(v)) wrap.appendChild(makeItemField(k, v));
      });
      const notes = getAny(row, ["Notes","Note"]);
      if (hasValue(notes)) wrap.appendChild(makeItemField("Notes", notes, true));
    }

    grid.appendChild(card);
  });
}

function makeItemField(label, value, span2 = false){
  const el = document.createElement("div");
  el.className = `item-field${span2 ? " span-2" : ""}`;
  el.innerHTML = `
    <span class="k">${escapeHtml(label)}</span>
    <div class="v">${escapeHtml(value)}</div>
  `;
  return el;
}

function showNoItems(msg){
  document.getElementById("items-grid").innerHTML = "";
  const el = document.getElementById("no-items");
  el.textContent = msg;
  el.style.display = "block";
}

/* =========================================================
   Data & filter helpers
   ========================================================= */

function pickCsvFile(p){
  const tip = norm(p.tipologia);
  const ts  = norm(p.tipologia_specifica);

  if (ts && CSV_ALIASES[ts]) return CSV_ALIASES[ts];
  if (tip && CSV_ALIASES[tip]) return CSV_ALIASES[tip];

  if (ts) return sanitizeFileName(ts);
  if (tip) return sanitizeFileName(tip);
  return null;
}

function sanitizeFileName(s){
  return s.replace(/\s+/g,"_").replace(/[\/\\]+/g,"_");
}

function norm(s){
  return (s ?? "").toString().trim().toLowerCase();
}

async function fetchText(url){
  try{
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.text();
  }catch(e){
    console.warn("[fetchText]", e);
    return null;
  }
}

// CSV parser (virgolette + CRLF)
function parseCSV(text){
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;

  while (i < text.length){
    const c = text[i];

    if (inQuotes){
      if (c === '"'){
        if (text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"'){
        inQuotes = true;
      } else if (c === ','){
        row.push(field); field = "";
      } else if (c === '\n' || c === '\r'){
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    i++;
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

// Case-insensitive key access
function getVal(row, key){
  if (key in row) return row[key];
  const lcKey = key.toLowerCase();
  for (const k of Object.keys(row)){
    if (k.toLowerCase() === lcKey) return row[k];
  }
  return "";
}
function getAny(row, keys){
  for (const k of keys){
    const v = getVal(row, k);
    if (hasValue(v)) return v;
  }
  return "";
}
function hasValue(v){
  return v != null && String(v).trim() !== "";
}

function joinMini(parts, sep = " · "){
  return parts.filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(sep);
}

/** Split per valori multipli potenziali (virgole, ; / |) */
function splitMulti(s){
  const raw = (s ?? "").toString().trim();
  if (!raw) return [];
  return raw
    .split(/[,;\/|]+/g)
    .map(v => v.trim())
    .filter(Boolean);
}

function applyFilters(rows, filtersMap){
  // Nessun filtro → tutte
  if (!filtersMap || filtersMap.size === 0) return rows;

  return rows.filter(row => {
    for (const [groupKey, set] of filtersMap.entries()){
      if (!set || set.size === 0) continue;
      const tokens = splitMulti(getVal(row, groupKey)).map(norm);
      // OR nel gruppo: almeno uno dei selezionati deve essere presente
      let hit = false;
      for (const v of set) {
        if (tokens.includes(v)) { hit = true; break; }
      }
      if (!hit) return false; // AND tra gruppi: fallisce → scarta
    }
    return true;
  });
}

function defaultMini(row){
  // fallback mini-title se manca config
  const guess = getAny(row, ["Type","Artifact type","General shape","Pottery type","Material gen"]);
  return guess || "";
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );
}
