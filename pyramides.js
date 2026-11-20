// Page « Électorat de chaque candidat » : chargement d'une hypothèse,
// petits candidats regroupés, épaisseurs et dessin des petites pyramides. Constantes et lissage : common.js

let D, NA, ND, BND, H_;
const SEUIL_PETITS = 0.035, PETITS_G = "Petits candidats de gauche", PETITS_D = "Petits candidats de droite";
const estPetits = c => c === PETITS_G || c === PETITS_D;
// blocs politiques (BLOCS, common.js, d'après candidats.json) : séparent les petits candidats de gauche et de droite
const A_GAUCHE = new Set(BLOCS[0][1]);
// toujours rangés dans « Petits candidats de droite », même au-dessus du seuil (Zemmour fait 3,5 à 4,5 %) : candidats.json
const TOUJOURS_PETITS = new Set(REGISTRE.candidats.filter(c => c.toujours_petit).map(c => c.nom));

// participation réglable, comme sur la Carte (ajusterParticipation, common.js) : écarts au sondage, en points
const PART = { global: 0, jeunes: 0, ages: 0, peu: 0, sup: 0 };
function chargerHypothese(nomHyp) {
  const h0 = D.hypotheses[nomHyp], adj = ajusterParticipation(h0, PART);
  if ($("part_resume")) afficherParticipation(adj.participation, PART);
  const h = { candidats: h0.candidats, parts: adj.parts }, K = h.candidats.length;
  const SH = h.candidats.map((_, k) => { const a = new Float32Array(NA * ND); for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) a[i * ND + d] = Math.max(1e-6, h.parts[k][i][d]); return a; });
  const TOT = new Float64Array(K);
  for (let k = 0; k < K; k++) for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) TOT[k] += h.parts[k][i][d] * D.inscrits[i][d];
  // petits candidats (moins de SEUIL_PETITS des exprimés) : trop peu de répondants par tranche pour que
  // leur forme ait un sens ; on les fond en une couche par camp, gauche d'un côté, droite et extrême droite
  // de l'autre (parts et voix additionnées). Un petit candidat seul dans son camp reste à part.
  const expr = TOT.reduce((s, v, k) => estExprime(h.candidats[k]) ? s + v : s, 0);
  const petits = h.candidats.map((_, k) => k).filter(k => estExprime(h.candidats[k]) && (TOT[k] / expr < SEUIL_PETITS || TOUJOURS_PETITS.has(h.candidats[k])));
  const groupes = [[PETITS_G, petits.filter(k => A_GAUCHE.has(h.candidats[k]))],
                   [PETITS_D, petits.filter(k => !A_GAUCHE.has(h.candidats[k]))]].filter(([, m]) => m.length >= 2);
  const fondus = groupes.flatMap(([, m]) => m);
  const garde = h.candidats.map((_, k) => k).filter(k => !fondus.includes(k));
  const somme = m => { const s = new Float32Array(NA * ND); for (const k of m) for (let c = 0; c < NA * ND; c++) s[c] += SH[k][c]; return s; };
  H_ = { cands: [...garde.map(k => h.candidats[k]), ...groupes.map(([n]) => n)],
         SH: [...garde.map(k => SH[k]), ...groupes.map(([, m]) => somme(m))],
         TOT: Float64Array.from([...garde.map(k => TOT[k]), ...groupes.map(([, m]) => m.reduce((s, k) => s + TOT[k], 0))]),
         membres: Object.fromEntries(groupes.map(([n, m]) => [n, [...m].sort((a, b) => TOT[b] - TOT[a]).map(k => nom(h.candidats[k]).split(" ").slice(-1)[0])])) };
}

// ---------- « Combien de peinture pour chacun ? » : une petite pyramide par candidat
// Épaisseur de la couche dans une case = min(1, λ · part^γ) ; λ est choisi pour que la peinture
// déposée (épaisseur × inscrits) égale les voix du candidat. γ = 1 : épaisseur = part exacte.
const PT_COUL = { "Abstention": "#3b3e48", "Blancs et nuls": "#8a857a", [PETITS_G]: "#b08a96", [PETITS_D]: "#7d8aa6" };          // l'abstention, trop pâle en gris clair, passe en gris foncé
function epaisseurs(k, gamma) {
  const n = NA * ND, w = lisserAge(H_.SH[k]).map(v => Math.pow(v, gamma)), ins = new Float64Array(n);
  for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) ins[i * ND + d] = D.inscritsLisses[i][d];
  const depot = l => { let s = 0; for (let c = 0; c < n; c++) s += Math.min(1, l * w[c]) * ins[c]; return s; };
  let lo = -60, hi = 60;                               // bissection sur log λ
  for (let it = 0; it < 70; it++) { const m = (lo + hi) / 2; depot(Math.exp(m)) < H_.TOT[k] ? lo = m : hi = m; }
  const l = Math.exp((lo + hi) / 2);
  // renforcement : épaisseur multipliée par un facteur ≥ 1 (la peinture déposée dépasse alors les voix)
  const boost = $("boost") ? +$("boost").value : 1;
  return Float32Array.from(w, v => Math.min(1, boost * l * v));
}
// ks : un ou plusieurs candidats. Superposés, les couches se combinent sans ordre :
// teinte = moyenne des couleurs pondérée par les épaisseurs, couverture = min(1, somme des épaisseurs).
// À concentration 1 avec l'abstention, la somme vaut 1 partout : la pyramide est entièrement couverte.
const rgb = col => [1, 3, 5].map(j => parseInt(col.slice(j, j + 2), 16));
function petitePyramide(cv, ks, gamma) {
  return dessinerCouches(cv, ks.map(k => epaisseurs(k, gamma)), ks.map(k => rgb(PT_COUL[H_.cands[k]] || COULEURS[H_.cands[k]])));
}
// AS : une épaisseur (0 à 1) par case et par couche ; RGBS : la couleur de chaque couche.
// Renvoie la fonction P(x, âge) → pixels, pour dessiner par-dessus.
function dessinerCouches(cv, AS, RGBS) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const Wp = Math.max(1, Math.round(r.width * dpr)), Hp = Math.max(1, Math.round(r.height * dpr));
  cv.width = Wp; cv.height = Hp;
  const c = cv.getContext("2d"), petit = r.width < 200, mg = { l: (petit ? 17 : 24) * dpr, r: 4 * dpr, t: 6 * dpr, b: 4 * dpr };
  const maxG = Math.max(...BND.map(b => -b[0])), maxD = Math.max(...BND.map(b => b[6]));
  const x0 = -maxG * 1.02, x1 = maxD * 1.02, a0 = AGE_MIN, a1 = AGE_MAX;
  const pw = Wp - mg.l - mg.r, ph = Hp - mg.t - mg.b;
  const L = AS.length;
  const im = c.createImageData(Wp, Hp), d = im.data, m = new Float64Array(6), v = new Float64Array(6 * L);
  for (let py = 0; py < ph; py++) {
    const age = a1 - (py + .5) / ph * (a1 - a0);
    const f = Math.min(NA - 1, Math.max(0, age - D.ages[0])), i0 = Math.floor(f), i1 = Math.min(NA - 1, i0 + 1), t = f - i0;
    const b = BND[i0].map((x, j) => x * (1 - t) + BND[i1][j] * t);
    for (let j = 0; j < 6; j++) { m[j] = (b[j] + b[j + 1]) / 2; for (let l = 0; l < L; l++) v[l * 6 + j] = AS[l][i0 * ND + j] * (1 - t) + AS[l][i1 * ND + j] * t; }
    for (let px = 0; px < pw; px++) {
      const x = x0 + (px + .5) / pw * (x1 - x0);
      if (x < b[0] || x > b[6]) continue;
      let j = 0, u = 0;                                // interpolation linéaire entre les milieux des couloirs
      if (x >= m[5]) j = 5; else if (x > m[0]) { while (x > m[j + 1]) j++; u = (x - m[j]) / (m[j + 1] - m[j]); }
      let se = 0; const mix = [0, 0, 0];
      for (let l = 0; l < L; l++) {
        const e = u ? v[l * 6 + j] * (1 - u) + v[l * 6 + j + 1] * u : v[l * 6 + j];
        se += e; for (let q = 0; q < 3; q++) mix[q] += e * RGBS[l][q];
      }
      const cov = Math.min(1, se), o = 4 * ((py + mg.t) * Wp + px + mg.l);
      for (let q = 0; q < 3; q++) d[o + q] = Math.round(PAPER[q] + ((se ? mix[q] / se : 0) - PAPER[q]) * cov);
      d[o + 3] = 255;
    }
  }
  c.putImageData(im, 0, 0);
  const P = (x, a) => [mg.l + (x - x0) / (x1 - x0) * pw, mg.t + (a1 - a) / (a1 - a0) * ph];
  const trace = j => { c.beginPath(); D.ages.forEach((a, i) => { const [x, y] = P(BND[i][j], a); i ? c.lineTo(x, y) : c.moveTo(x, y); }); };
  c.lineWidth = .8 * dpr; c.setLineDash([2 * dpr, 2 * dpr]);
  for (const j of [1, 2, 4, 5]) { trace(j); c.strokeStyle = "rgba(255,255,255,.55)"; c.stroke(); }
  c.setLineDash([]); trace(3); c.strokeStyle = "rgba(255,255,255,.7)"; c.stroke();
  c.beginPath();                                       // contour de la pyramide
  D.ages.forEach((a, i) => { const [x, y] = P(BND[i][0], a); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  for (let i = NA - 1; i >= 0; i--) { const [x, y] = P(BND[i][6], D.ages[i]); c.lineTo(x, y); }
  c.closePath(); c.strokeStyle = "rgba(98,104,119,.75)"; c.lineWidth = 1 * dpr; c.stroke();
  c.font = `${(petit ? 8 : 9.5) * dpr}px ${getComputedStyle(document.body).getPropertyValue("--f-mono") || "monospace"}`;
  c.fillStyle = getComputedStyle(document.body).color; c.globalAlpha = .55; c.textAlign = "right"; c.textBaseline = "middle";
  for (const a of petit ? [20, 60, 100] : [20, 40, 60, 80, 100]) { const [, y] = P(0, a); c.fillText(a, mg.l - 5 * dpr, Math.min(Hp - 5 * dpr, Math.max(5 * dpr, y))); }
  c.globalAlpha = 1;
  return { c, P, dpr };
}
const court = (k, ia) => !estExprime(H_.cands[k]) || estPetits(H_.cands[k]) ? H_.cands[k] : nom(H_.cands[k]).split(" ").slice(nom(H_.cands[k]).includes(" ") ? 1 : 0).join(" ");
const couleur = k => PT_COUL[H_.cands[k]] || COULEURS[H_.cands[k]];
