// tutorial_necropoli.js
import { getPath } from './path_utils.js';

export class Tutorial {
  constructor() {
    // Indici utili
    this.TOMBS_STEP_INDEX = 2;       // step sulle tombe/feature
    this._lastStepIndex = -1;
    this._objectsPrevState = null;   // memorizza stato toggle "Objects"

    // STEP DEFINITIONS
    this.steps = [
      // 0 — Intro (come prima)
      {
        title: "Welcome to the Tombs Atlas",
        content: `
          <p style="color:#b02a37;"><strong>🚧 Warning:</strong> Some data are currently missing, others are currently under revision and completion. Consider all visualizations provisional.</p>
          <p>This map allows you to fully explore the WT1 funerary context and visualize <strong>objects</strong> and <strong>archaeological features</strong>.</p>
          <p>Use the dashboard to control map layers, or click on any <strong>tomb</strong> and <strong>object</strong> to open detailed pop-ups.</p>
        `,
        target: null,                           // nessun highlight
        boxPos: { side: 'center' },             // box al centro
      },

      // 1 — Oggetti (niente highlight mappa, facciamo pulsare i marker; box a destra sopra la dashboard)
      {
        title: "Objects & Clusters",
        content: `
          <p>Objects are sometimes shown in icons or clusters, due to density. Click on any cluster to view all the icons of objects comprising it.</p>
          <p>*Some objects are registered in groups*, which means that one excavation's ID is associated with different objects sharing the same typology (e.g. 12 beads). In this case, a number above the icon shows the amount of single objects.</p>
          <p>Click on any object or group to see some basic information, then click on - ↗ Open detail page - to see a dedicated page containing all data (and, for groups, the elements comprising it).</p>
        `,
        target: null,                           // non evidenziamo la mappa
        pulse: { objects: true },               // evidenzia i marker oggetto
        boxPos: { side: 'right', topPx: 90, rightPx: 12 }, // a destra, “sopra” la dashboard
      },

      // 2 — Tombe (pulsiamo le tombe, spegniamo gli objects temporaneamente; box a destra sopra dashboard + video/mp4)
      {
        title: "Tombs / Features",
        content: `
          <p>Click on any tomb, feature or offering place to know about its contents, divided by typology and shown in a doublefold manner: a *line chart* and a *pie chart*.</p>
          <p>Interact with the graphs via *the legend*.</p>
          <p>Selecting the - info - you can also see all relevant information about the tomb or access the detailed report.</p>
        `,
        target: null,
        pulse: { tombs: true },
        willToggleObjectsOff: true,             // lato effetti collaterali (vedi _applyStepSideEffects)
        boxPos: { side: 'right', topPx: 110, rightPx: 12 },
        media: {
          type: 'video',
          src:  getPath("images/tutorial/tombs_popup_demo.mp4"),   // carica un MP4 h.264 (consigliato per GitHub Pages)
          poster: getPath("images/tutorial/tombs_popup_demo_poster.jpg"),
          autoplay: true, loop: true, muted: true, controls: true
        }
      },

      // 3 — Filtro oggetti (spostiamo molto a destra per non coprire la barra)
      {
        title: "Filter the Objects",
        content: `
          <p>Use this panel to filter objects *by category* or *by subcategory*.</p>
          <p>Click on each icon to observe the category's distribution on the map.</p>
        `,
        target: "#category-filter",
        boxPos: { side: 'right', topPx: 120, rightPx: 12 }, // molto a destra
      },

      // 4 — Toggles + Data Quality (spostiamo box più a sinistra, appena a sinistra della dashboard)
      {
        title: "Map Layers & Data Quality",
        content: `
          <p>The toggle section allows you to pin/unpin the visibility of the objects, grid and altimetry on the map.</p>
          <p>The - Data Quality - bar lets you select which objects to show based on the quality of their location information. You can see this on the map via the icon border and in the pop-up.</p>
        `,
        target: "#visualization-controls",
        boxPos: { side: 'custom', topPx: 120, rightPx: 360 }, // 360px da destra ≈ subito a sinistra della dashboard
      },

      // 5 — Tipologie (site_graph): assicuriamoci che la sezione sia aperta e highlightata
      {
        title: "Context Types",
        content: `
          <p>Open the typology section to see the <strong>relative importance</strong> of each <strong>feature typology</strong> in the dataset.</p>
        `,
        target: "#site-chart-section",
        onEnter: () => this._openSiteGraphSection(),
        boxPos: { side: 'custom', topPx: 120, rightPx: 360 }, // accanto alla dashboard, non sopra
      },

      // 6 — Navigazione / Info
      {
        title: "Navigation & Info",
        content: `
          <p>Click the logo to access the info page, where you can read more about the dataset, the archaeological site, the team and the project behind it.</p>
        `,
        target: "#logo-link",
        boxPos: { side: 'top' },
      },
    ];

    this.init();
  }

  /* =========================
     Init & DOM creation
  ========================== */
  init() {
    this._injectEphemeralStyles();
    this.createTutorialElements();
    this.showStep(0);
    document.addEventListener('keydown', this.handleKeyPress.bind(this));
  }

  _injectEphemeralStyles() {
    // Pulsazioni / chip per - testo -
    const css = `
      @keyframes ttPulse { from { filter: drop-shadow(0 0 0 rgba(255,193,7,.0)); } to { filter: drop-shadow(0 0 10px rgba(255,193,7,.9)); } }
      @keyframes ttStroke { from { filter: drop-shadow(0 0 0 rgba(255,99,132,.0)); } to { filter: drop-shadow(0 0 8px rgba(255,99,132,.9)); } }

      .tt-pulse { animation: ttPulse 900ms ease-in-out infinite alternate; }
      .tt-stroke { animation: ttStroke 900ms ease-in-out infinite alternate; }

      .tutorial-box .ui-chip {
        display:inline-block; padding:2px 7px; border-radius:14px;
        background:#f2f4ff; border:1px solid #dfe3ff; color:#3843a2; font-weight:600;
      }

      /* Video/media style */
      .tutorial-video { width:100%; border-radius:8px; margin:10px 0 16px 0; box-shadow:0 2px 10px rgba(0,0,0,.12); }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  createTutorialElements() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';

    // Highlight box (usato solo quando abbiamo un target DOM)
    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'tutorial-highlight';

    // Box principale
    this.tutorialBox = document.createElement('div');
    this.tutorialBox.className = 'tutorial-box';

    this.tutorialTitle = document.createElement('h3');
    this.tutorialTitle.className = 'tutorial-title';

    this.tutorialContent = document.createElement('div');
    this.tutorialContent.className = 'tutorial-content';

    // Media (img/video)
    this.tutorialImage = document.createElement('img');
    this.tutorialImage.className = 'tutorial-image';

    this.tutorialVideo = document.createElement('video');
    this.tutorialVideo.className = 'tutorial-video';
    this.tutorialVideo.style.display = 'none';

    // Nav
    this.tutorialNav = document.createElement('div');
    this.tutorialNav.className = 'tutorial-nav';

    this.prevButton = document.createElement('button');
    this.prevButton.className = 'tutorial-button tutorial-prev';
    this.prevButton.innerHTML = '&larr; Previous';
    this.prevButton.addEventListener('click', () => this.prevStep());

    this.nextButton = document.createElement('button');
    this.nextButton.className = 'tutorial-button tutorial-next';
    this.nextButton.innerHTML = 'Next &rarr;';
    this.nextButton.addEventListener('click', () => this.nextStep());

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'tutorial-button tutorial-close';
    this.closeButton.innerHTML = 'Close Tutorial';
    this.closeButton.addEventListener('click', () => this.close());

    this.tutorialNav.appendChild(this.prevButton);
    this.tutorialNav.appendChild(this.nextButton);
    this.tutorialNav.appendChild(this.closeButton);

    this.tutorialBox.appendChild(this.tutorialTitle);
    this.tutorialBox.appendChild(this.tutorialContent);
    this.tutorialBox.appendChild(this.tutorialImage);
    this.tutorialBox.appendChild(this.tutorialVideo);
    this.tutorialBox.appendChild(this.tutorialNav);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlightBox);
    document.body.appendChild(this.tutorialBox);
  }

  /* =========================
     Navigation
  ========================== */
  showStep(stepIndex) {
    const prev = this._lastStepIndex;
    const step = this.steps[stepIndex];
    if (!step) return;

    // Effetti collaterali (toggle objects on/off allo step 2, ecc.)
    this._applyStepSideEffects(prev, stepIndex);

    // Titolo e contenuto (con micro-markup *bold* e -chip-)
    this.tutorialTitle.textContent = step.title;
    this.tutorialContent.innerHTML = this._formatRichContent(step.content || "");

    // Media (img / video)
    this._renderMedia(step.media);

    // Posizione della box
    this._positionTutorialBox(step.boxPos);

    // Highlight/pulse
    if (step.target) {
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => this.highlightElement(targetElement), 350);
      } else {
        this.hideHighlight();
      }
    } else {
      this.hideHighlight();
    }
    this._setLayerPulse(step.pulse || {});

    // Hook onEnter personalizzato (es. aprire la sezione dei grafici)
    if (typeof step.onEnter === 'function') {
      try { step.onEnter(); } catch {}
    }

    // Nav
    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Finish' : 'Next &rarr;';

    this.currentStep = stepIndex;
    this._lastStepIndex = stepIndex;
  }

  nextStep() {
    const idx = this.currentStep ?? 0;
    if (idx < this.steps.length - 1) {
      this.showStep(idx + 1);
    } else {
      this.close();
    }
  }

  prevStep() {
    const idx = this.currentStep ?? 0;
    if (idx > 0) this.showStep(idx - 1);
  }

  close() {
    // Se abbiamo disattivato "Objects" allo step 2, ripristina ora
    if (this._objectsPrevState !== null) {
      const restore = (this._objectsPrevState == null) ? true : this._objectsPrevState;
      this._setToggle('toggle-oggetti', restore);
      this._objectsPrevState = null;
    }

    // Rimuovi pulsazioni
    this._setLayerPulse({}); // svuota tutto
    this.overlay.style.opacity = '0';
    this.highlightBox.style.opacity = '0';
    this.tutorialBox.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(this.overlay);
      document.body.removeChild(this.highlightBox);
      document.body.removeChild(this.tutorialBox);
    }, 300);
  }

  handleKeyPress(e) {
    if (e.key === 'ArrowRight') this.nextStep();
    else if (e.key === 'ArrowLeft') this.prevStep();
    else if (e.key === 'Escape') this.close();
  }

  /* =========================
     Positioning & Highlight
  ========================== */
  _positionTutorialBox(pos = { side: 'center' }) {
    const { side = 'center', topPx = null, rightPx = null, leftPx = null } = pos || {};
    const box = this.tutorialBox;

    // reset
    box.style.top = ''; box.style.left = ''; box.style.right = ''; box.style.transform = '';

    if (side === 'top') {
      box.style.top = '20px';
      box.style.left = '50%';
      box.style.transform = 'translateX(-50%)';
    } else if (side === 'right') {
      box.style.top = (topPx != null ? `${topPx}px` : '15%');
      box.style.right = (rightPx != null ? `${rightPx}px` : '20px');
    } else if (side === 'left') {
      box.style.top = (topPx != null ? `${topPx}px` : '15%');
      box.style.left = (leftPx != null ? `${leftPx}px` : '20px');
    } else if (side === 'custom') {
      if (topPx != null) box.style.top = `${topPx}px`;
      if (rightPx != null) box.style.right = `${rightPx}px`;
      if (leftPx != null) box.style.left = `${leftPx}px`;
    } else { // center
      box.style.top = '50%';
      box.style.left = '50%';
      box.style.transform = 'translate(-50%, -50%)';
    }
  }

  highlightElement(element) {
    const rect = element.getBoundingClientRect();
    this.highlightBox.style.width = `${rect.width + 20}px`;
    this.highlightBox.style.height = `${rect.height + 20}px`;
    this.highlightBox.style.top = `${rect.top - 10}px`;
    this.highlightBox.style.left = `${rect.left - 10}px`;
    this.highlightBox.style.opacity = '1';

    const tutorialRect = this.tutorialBox.getBoundingClientRect();
    const highlightRect = this.highlightBox.getBoundingClientRect();
    this.highlightBox.className = 'tutorial-highlight';

    if (tutorialRect.left > highlightRect.right) {
      this.highlightBox.classList.add('arrow-right');
    } else if (tutorialRect.right < highlightRect.left) {
      this.highlightBox.classList.add('arrow-left');
    } else if (tutorialRect.top > highlightRect.bottom) {
      this.highlightBox.classList.add('arrow-bottom');
    } else {
      this.highlightBox.classList.add('arrow-top');
    }
  }

  hideHighlight() {
    this.highlightBox.style.opacity = '0';
  }

  /* =========================
     Media (img / video)
  ========================== */
  _renderMedia(media) {
    // reset
    this.tutorialImage.style.display = 'none';
    this.tutorialVideo.style.display = 'none';
    try { this.tutorialVideo.pause(); } catch {}

    if (!media) return;

    if (media.type === 'video' && media.src) {
      this.tutorialVideo.src = media.src;
      if (media.poster) this.tutorialVideo.poster = media.poster;
      this.tutorialVideo.muted = !!media.muted;
      this.tutorialVideo.loop = !!media.loop;
      this.tutorialVideo.autoplay = !!media.autoplay;
      this.tutorialVideo.controls = !!media.controls;
      this.tutorialVideo.style.display = 'block';
      // play safe
      setTimeout(() => { try { this.tutorialVideo.play().catch(()=>{}); } catch {} }, 50);
    } else if (media.type === 'image' && media.src) {
      this.tutorialImage.src = media.src;
      this.tutorialImage.style.display = 'block';
    }
  }

  /* =========================
     Side-effects & Pulses
  ========================== */
  _applyStepSideEffects(prevIndex, nextIndex) {
    // Spegni Objects entrando nello step tombe
    if (nextIndex === this.TOMBS_STEP_INDEX) {
      if (this._objectsPrevState === null) {
        const el = document.getElementById('toggle-oggetti');
        this._objectsPrevState = el ? el.checked : null;
      }
      this._setToggle('toggle-oggetti', false);
    }

    // Uscendo dallo step tombe → ripristina
    if (prevIndex === this.TOMBS_STEP_INDEX && nextIndex !== this.TOMBS_STEP_INDEX) {
      const restore = (this._objectsPrevState == null) ? true : this._objectsPrevState;
      this._setToggle('toggle-oggetti', restore);
      this._objectsPrevState = null;
    }
  }

  _setToggle(id, checked) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.checked === checked) return;
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _setLayerPulse({ objects = false, tombs = false }) {
    // Pulisci tutto prima
    document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon.tt-pulse')
      .forEach(n => n.classList.remove('tt-pulse'));
    document.querySelectorAll('.leaflet-overlay-pane svg path.tt-stroke')
      .forEach(n => n.classList.remove('tt-stroke'));

    if (objects) {
      document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon')
        .forEach(n => n.classList.add('tt-pulse'));
    }
    if (tombs) {
      // path delle tombe (stroke marrone #993300 impostato in map_viewer)
      document
        .querySelectorAll('.leaflet-overlay-pane svg path[stroke="#993300"]')
        .forEach(n => n.classList.add('tt-stroke'));
    }
  }

  _openSiteGraphSection() {
    // Se la sezione è collapsata, clicca sul titolo per aprirla
    const section = document.querySelector('#site-chart-section');
    if (!section) return;
    const toggle = section.querySelector('h3');
    // Heuristica: se il canvas è nascosto, clicchiamo
    const container = document.querySelector('#site-chart-container');
    const isHidden = container && (container.offsetParent === null || container.style.display === 'none');
    if (toggle && isHidden) toggle.click();
  }

  /* =========================
     Content helpers
  ========================== */
  _formatRichContent(html) {
    // *bold*  → <strong>bold</strong>
    // - chip - → <span class="ui-chip">chip</span>
    return String(html)
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
      .replace(/- *(.+?) *-/g, '<span class="ui-chip">$1</span>');
  }
}
