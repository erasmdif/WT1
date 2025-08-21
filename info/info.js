// info.js
import { getPath } from "../path_utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // Header logo (cemetery icon) with PNG → fallback SVG if needed
  const logoHeader = document.getElementById("project-logo");
  if (logoHeader) {
    const png = getPath("images/icons/cementery.png");
    const svg = getPath("images/icons/cementery.svg");
    logoHeader.src = png;
    logoHeader.onerror = () => { logoHeader.src = svg; };
  }

  // "Return to map" link + home link
  const homeLink = document.getElementById("home-link");
  if (homeLink) {
    homeLink.href = getPath("index.html");
  }

  // Footer logos (clickable)
  const logoErasmo = document.getElementById("footer-logo-erasmo");
  if (logoErasmo) {
    logoErasmo.src = getPath("images/logo_erasmo.svg");
  }
  const logoLad = document.getElementById("footer-logo-lad");
  if (logoLad) {
    logoLad.src = getPath("images/lad.png");
  }

  // Team photos via data-src + getPath
  document.querySelectorAll(".team-photo[data-src]").forEach(img => {
    const rel = img.getAttribute("data-src");
    if (rel) img.src = getPath(rel);
  });

  // Animate cards on scroll
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("animate"); }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.intro-card, .team-card, .future-card').forEach(el => observer.observe(el));
});
