// Carte des deux tours de la présidentielle 2022 : page autonome (données : data_2022.json, scripts/08_carte_2022.py).
// Même rendu et mêmes outils que la Carte (styles, curseurs des taches, zoom, légende cliquable, lasso), sans
// hypothèses, participation réglable ni fourchettes. Seul le bruit (champBruit, densite) vient de taches.js ; le reste
// est ici pour que la page ne dépende ni du registre 2027 ni de app.js.

const W = 1100, H = 820, N = W * H;
const AGE_MIN = 17.5, AGE_MAX = 100.5, PAPER = [247, 246, 242];
const $ = id => document.getElementById(id);
const fmtM = v => (v / 1e6).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtP = v => (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const tf = v => (+v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NON_EXPRIMES = new Set(["Abstention", "Blancs et nuls"]);
const STYLES = {      // préréglages de la Carte (app.js)
  "Lisible, proche des données": { temp: .7, grain: 3, grav: 1.25, portee: 6, etir: 1.5, liseres: false },
  "Lisible": { temp: .35, grain: 2, grav: 0, portee: 10, etir: 1, liseres: false },
  "Par défaut": { temp: .45, grain: 5, grav: 0, portee: 10, etir: 1, liseres: true },
  "Fidèle : chacun selon son score": { temp: 1, grain: 5, grav: 0, portee: 10, etir: 1, liseres: true },
  "Bastions marqués": { temp: .3, grain: 6, grav: 2.5, portee: 20, etir: 1, liseres: true },
  "Grandes plaques": { temp: .45, grain: 9, grav: 3.5, portee: 36, etir: 1, liseres: true },
  "Le long des générations": { temp: .45, grain: 6, grav: 1.5, portee: 12, etir: 4, liseres: true },
  "Taches nettes": { temp: .45, grain: 5, grav: 1.5, portee: 6, etir: 1, liseres: true },
  "Mosaïque fine": { temp: .7, grain: 3, grav: 0, portee: 10, etir: 1, liseres: false },
  "Pointillisme": { temp: 1, grain: 2, grav: 0, portee: 10, etir: 1, liseres: false },
};
const CURSEURS = ["temp", "grain", "grav", "portee", "etir"];
const state = { temp: .7, grain: 3, grav: 1.25, portee: 6, etir: 1.5, liseres: false, seed: 1, zoom: .85, dlines: true, shown: [], tour: 0 };

let D, NA, ND, K, BND, X0, X1, AGE0, AGE1, CODE, INS, NI, PIXC, PIXCASE, LAB, SH, TOT, TOTAL, CIBLE;
const NOISE = new Map(); let NOISE_KEY = "";

// inscrits lissés d'un âge à l'autre, pour le dessin seulement (comme lisser() de common.js)
function lisser() {
  const sig = a => .4 + 1.2 * Math.min(1, Math.max(0, (a - 18) / 8));
  D.inscritsLisses = D.inscrits.map(r => r.map(() => 0));
  for (let d = 0; d < ND; d++) {
    let avant = 0, apres = 0;
    for (let i = 0; i < NA; i++) {
      const s = sig(D.ages[i]), R = Math.ceil(3 * s); let t = 0, w = 0;
      for (let j = Math.max(0, i - R); j <= Math.min(NA - 1, i + R); j++) { const k = Math.exp(-((i - j) ** 2) / (2 * s * s)); t += k * D.inscrits[j][d]; w += k; }
      D.inscritsLisses[i][d] = t / w; avant += D.inscrits[i][d]; apres += t / w;
    }
    for (let i = 0; i < NA; i++) D.inscritsLisses[i][d] *= avant / apres;
  }
}

// case (âge × diplôme) de chaque pixel ; couloirs : Sans diplôme, CAP-BEP, Bac | Bac+2, Bac+3/4, Bac+5 et +
function geometrie() {
  BND = D.inscritsLisses.map(r => { const g1 = -r[2], g2 = g1 - r[1], g3 = g2 - r[0], d1 = r[3], d2 = d1 + r[4], d3 = d2 + r[5]; return [g3, g2, g1, 0, d1, d2, d3]; });
  const maxG = Math.max(...BND.map(b => -b[0])), maxD = Math.max(...BND.map(b => b[6]));
  const gx = -maxG * 1.04, dx = maxD * 1.06, cx = (gx + dx) / 2, wx = (dx - gx) / state.zoom;
  X0 = cx - wx / 2; X1 = cx + wx / 2;
  const marge = (AGE_MAX - AGE_MIN) / state.zoom - (AGE_MAX - AGE_MIN);
  AGE0 = AGE_MIN - marge * .55; AGE1 = AGE_MAX + marge * .45;
  CODE = new Uint16Array(N).fill(65535);
  for (let py = 0; py < H; py++) {
    const age = AGE1 - (py + .5) / H * (AGE1 - AGE0);
    if (age < AGE_MIN || age > AGE_MAX) continue;
    const f = Math.min(NA - 1, Math.max(0, age - D.ages[0])), i0 = Math.floor(f), i1 = Math.min(NA - 1, i0 + 1), t = f - i0;
    const b = BND[i0].map((v, j) => v * (1 - t) + BND[i1][j] * t);
    const ia = Math.min(NA - 1, Math.max(0, Math.round(age - D.ages[0])));
    for (let px = 0; px < W; px++) {
      const x = X0 + (px + .5) / W * (X1 - X0);
      if (x < b[0] || x > b[6]) continue;
      let c = 0; while (c < 5 && x > b[c + 1]) c++;
      CODE[py * W + px] = ia * ND + c;
    }
  }
  const tmp = []; for (let i = 0; i < N; i++) if (CODE[i] !== 65535) tmp.push(i);
  INS = Int32Array.from(tmp); NI = INS.length;
  PIXC = new Uint16Array(NI); PIXCASE = new Float64Array(NA * ND);
  for (let j = 0; j < NI; j++) { PIXC[j] = CODE[INS[j]]; PIXCASE[PIXC[j]]++; }
  NOISE.clear(); NOISE_KEY = "";
}

function bruit(k) {
  const cle = [state.seed, state.grain, state.etir].join("|");
  if (cle !== NOISE_KEY) { NOISE.clear(); NOISE_KEY = cle; }
  const id = D.candidats[k].id;                      // par candidat : Macron et Le Pen gardent leurs taches d'un tour à l'autre
  if (!NOISE.has(id)) NOISE.set(id, champBruit(id, state.seed, state.grain, state.etir, W, H, INS));
  return NOISE.get(id);
}

// pixel : couleur k qui maximise ln s_k + b_k + T × g_k (+ gravité × densité) ; b est calé pour que la surface
// de chaque couleur soit sa part des inscrits (chaque pixel représente le même nombre d'inscrits). Avec le liseré,
// la dernière finition compte les seuls pixels visibles (hors liseré), comme ajusterVisible() de app.js.
const estBord = (i, l) => { const x = i % W; return (x > 0 && LAB[i - 1] !== l && LAB[i - 1] !== 255) || (i >= W && LAB[i - W] !== l && LAB[i - W] !== 255); };
function dessiner() {
  const C = NA * ND, T = state.temp, grav = state.grav;
  const L = SH.map(s => Float64Array.from(s, v => Math.log(Math.max(1e-6, v))));
  const G = D.candidats.map((_, k) => bruit(k));
  const b = new Float64Array(K);
  // départ calculé sans pixel : surface attendue d'une couleur dans une case = softmax((ln s + b) / T)
  const e = new Float64Array(K);
  for (let it = 0; it < 200; it++) {
    const att = new Float64Array(K);
    for (let c = 0; c < C; c++) { if (!PIXCASE[c]) continue; let m = -Infinity;
      for (let k = 0; k < K; k++) { e[k] = (L[k][c] + b[k]) / T; m = Math.max(m, e[k]); }
      let s = 0; for (let k = 0; k < K; k++) { e[k] = Math.exp(e[k] - m); s += e[k]; }
      for (let k = 0; k < K; k++) att[k] += PIXCASE[c] * e[k] / s; }
    let pire = 0;
    for (let k = 0; k < K; k++) { const r = Math.log(CIBLE[k] / (att[k] / NI)); pire = Math.max(pire, Math.abs(r)); b[k] += T * r; }
    if (pire < 1e-6) break;
  }
  let DF = null;
  const parcourir = () => {
    const cnt = new Float64Array(K);
    for (let j = 0; j < NI; j++) {
      const c = PIXC[j]; let best = -Infinity, bk = 0;
      if (DF) { for (let k = 0; k < K; k++) { const v = L[k][c] + b[k] + T * G[k][j] + grav * DF[k][j]; if (v > best) { best = v; bk = k; } } }
      else { for (let k = 0; k < K; k++) { const v = L[k][c] + b[k] + T * G[k][j]; if (v > best) { best = v; bk = k; } } }
      cnt[bk]++; LAB[INS[j]] = bk;
    }
    return cnt;
  };
  const visibles = () => { const v = new Float64Array(K); let n = 0; for (const i of INS) { const l = LAB[i]; if (!state.liseres || !estBord(i, l)) { v[l]++; n++; } } return [v, n]; };
  const ajuster = (n, compter) => {
    const s = Math.max(.05, Math.min(1, T)) + grav; let pire = 0;
    for (let it = 0; ; it++) {
      const cnt = parcourir(), [v, tot] = compter ? visibles() : [cnt, NI];
      pire = 0; for (let k = 0; k < K; k++) pire = Math.max(pire, Math.abs(v[k] / tot - CIBLE[k]));
      if (pire < 3e-4 || it === n) break;
      const am = .6 * Math.pow(.15, it / (n - 1));
      for (let k = 0; k < K; k++) b[k] += Math.max(-.5 * s, Math.min(.5 * s, am * s * Math.log(CIBLE[k] / Math.max(v[k] / tot, 1e-5))));
    }
    return pire;
  };
  LAB = new Uint8Array(N).fill(255);
  parcourir();
  // gravité : chaque pixel est attiré par les pixels de même couleur autour de lui (trois passes)
  if (grav > 0) {
    const R = Math.max(1, Math.round(state.portee / 2));
    for (let passe = 0; passe < 3; passe++) {
      DF = D.candidats.map((_, k) => densite(LAB, k, R, W, H, INS));
      ajuster(30, false);
    }
  }
  return ajuster(30, true);
}

function peindre() {
  const c = $("tiles").getContext("2d"), im = c.createImageData(W, H), d = im.data;
  const cols = D.candidats.map(k => [1, 3, 5].map(j => parseInt(k.couleur.slice(j, j + 2), 16)));
  for (let i = 0; i < N; i++) {
    const l = LAB[i]; let col = PAPER;
    if (l !== 255) { col = state.shown[l] ? cols[l] : [255, 255, 255]; if (state.liseres && state.shown[l] && estBord(i, l)) col = PAPER; }
    d[4 * i] = col[0]; d[4 * i + 1] = col[1]; d[4 * i + 2] = col[2]; d[4 * i + 3] = 255;
  }
  c.putImageData(im, 0, 0);
}

// lignes des couloirs de diplôme, bord de la pyramide et nom des couloirs
function superposer() {
  const cv = $("over"), r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const c = cv.getContext("2d"), sx = cv.width / (X1 - X0), sy = cv.height / (AGE1 - AGE0);
  const P = (x, a) => [(x - X0) * sx, (AGE1 - a) * sy];
  const trace = j => { c.beginPath(); D.ages.forEach((a, i) => { const [x, y] = P(BND[i][j], a); i ? c.lineTo(x, y) : c.moveTo(x, y); }); };
  if (state.dlines) for (const j of [1, 2, 3, 4, 5]) {
    trace(j); c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 2.6 * dpr; c.stroke();
    c.setLineDash([3 * dpr, 3 * dpr]); c.strokeStyle = "rgba(29,34,48,.8)"; c.lineWidth = 1.1 * dpr; c.stroke(); c.setLineDash([]);
  }
  for (const j of [0, 6]) { trace(j); c.strokeStyle = "rgba(29,34,48,.55)"; c.lineWidth = 1.1 * dpr; c.stroke(); }
  if (state.dlines && r.width >= 430) {              // nom de chaque couloir, à l'âge où il est le plus large (24-88 ans)
    const ech = Math.max(.72, Math.min(1, r.width / 700));
    c.font = `500 ${10.5 * ech * dpr}px ${getComputedStyle(document.body).fontFamily}`; c.textAlign = "center"; c.textBaseline = "middle";
    const ages = [55, 45, 35, 35, 45, 55];             // étiquettes en diagonale, pour ne pas se chevaucher
    D.diplomes.forEach((nm, d) => {
      const ia = D.ages.indexOf(ages[d]);
      const [xa, y] = P(BND[ia][d], D.ages[ia]), [xb] = P(BND[ia][d + 1], D.ages[ia]);
      const x = (xa + xb) / 2, w = c.measureText(nm).width + 10 * dpr, h = 16 * dpr;
      c.fillStyle = "rgba(255,255,255,.9)"; c.strokeStyle = "rgba(29,34,48,.5)"; c.lineWidth = 1 * dpr;
      c.beginPath(); c.roundRect ? c.roundRect(x - w / 2, y - h / 2, w, h, 3 * dpr) : c.rect(x - w / 2, y - h / 2, w, h); c.fill(); c.stroke();
      c.fillStyle = "#1d2230"; c.fillText(nm, x, y + .5 * dpr);
    });
  }
}

function axes() {
  $("yax").innerHTML = ""; $("xax").innerHTML = "";
  for (const a of [20, 30, 40, 50, 60, 70, 80, 90, 100]) { const s = document.createElement("span"); s.textContent = a; s.style.top = ((AGE1 - a) / (AGE1 - AGE0) * 100) + "%"; $("yax").appendChild(s); }
  const pas = $("map").getBoundingClientRect().width < 430 ? 400e3 : 200e3;
  for (let v = -800e3; v <= 800e3; v += pas) { if (v < X0 || v > X1) continue; const s = document.createElement("span"); s.textContent = v === 0 ? "0" : Math.abs(v / 1000) + " k"; s.style.left = ((v - X0) / (X1 - X0) * 100) + "%"; $("xax").appendChild(s); }
}

// légende : voix officielles (champ métropole et DROM) ; un clic masque ou montre le candidat
function legende() {
  const o = D.officiel, box = $("chips"); box.innerHTML = "";
  D.candidats.forEach((c, k) => {
    const exp = !NON_EXPRIMES.has(c.id);
    const lab = document.createElement("label"); lab.className = "chip" + (state.shown[k] ? "" : " off");
    lab.innerHTML = `<input type="checkbox" ${state.shown[k] ? "checked" : ""}><span class="sw" style="background:${c.couleur}"></span><span class="nm">${c.nom}</span><small>${fmtM(c.voix)} M</small>`
      + `<small>${exp ? fmtP(c.voix / o.exprimes) + " · " : ""}${fmtP(c.voix / o.inscrits)} des ins.</small>`;
    lab.querySelector("input").addEventListener("change", e => { state.shown[k] = e.target.checked; lab.classList.toggle("off", !e.target.checked); peindre(); calculer(); });
    box.appendChild(lab);
  });
}

// ---------- sélection : lasso (coordonnées en données : [inscrits, âge]) ou tous les inscrits
let shapes = [], titreSel = "", cur = null;
const TOUT = "Tous les inscrits";
function zone(aMin, aMax) {                          // toute la pyramide entre deux âges
  const is = D.ages.map((a, i) => i).filter(i => D.ages[i] >= aMin && D.ages[i] <= aMax);
  const poly = [[BND[is[0]][0], aMin - .5], [BND[is[0]][6], aMin - .5], ...is.map(i => [BND[i][6], D.ages[i]]),
                [BND[is.at(-1)][6], aMax + .5], [BND[is.at(-1)][0], aMax + .5], ...is.map(i => [BND[i][0], D.ages[i]]).reverse()];
  poly.cases = { aMin, aMax };
  return poly;
}
function selectionner(polys, titre) { shapes = polys; titreSel = titre; $("toutsel").checked = titre === TOUT; dessinerSel(); calculer(); }

const draw = $("draw"); let dctx, dw, dh;
const versDonnees = (px, py) => [X0 + px / dw * (X1 - X0), AGE1 - py / dh * (AGE1 - AGE0)];
const versPx = (x, a) => [(x - X0) / (X1 - X0) * dw, (AGE1 - a) / (AGE1 - AGE0) * dh];
function redim() { const r = draw.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; draw.width = Math.round(r.width * dpr); draw.height = Math.round(r.height * dpr); dw = r.width; dh = r.height; dctx = draw.getContext("2d"); dctx.setTransform(dpr, 0, 0, dpr, 0, 0); dessinerSel(); }
function chemin(pts) { dctx.beginPath(); pts.forEach((p, i) => { const [x, y] = versPx(p[0], p[1]); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y); }); }
function dessinerSel() {
  if (!dctx || !BND) return; dctx.clearRect(0, 0, dw, dh);
  const partiel = shapes.length && titreSel !== TOUT;
  if (partiel) {                                       // voile gris sur la partie de la pyramide hors sélection
    dctx.save(); dctx.beginPath();
    D.ages.forEach((a, i) => { const [x, y] = versPx(BND[i][0], a); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y); });
    for (let i = NA - 1; i >= 0; i--) { const [x, y] = versPx(BND[i][6], D.ages[i]); dctx.lineTo(x, y); }
    dctx.closePath(); dctx.clip();
    dctx.fillStyle = "rgba(150,148,142,.5)"; dctx.fillRect(0, 0, dw, dh);
    dctx.globalCompositeOperation = "destination-out"; dctx.fillStyle = "#000";
    for (const s of shapes) { chemin(s); dctx.closePath(); dctx.fill(); }
    dctx.restore();
    for (const s of shapes) { chemin(s); dctx.closePath(); dctx.lineWidth = 4; dctx.strokeStyle = "rgba(255,255,255,.9)"; dctx.stroke(); dctx.setLineDash([7, 5]); dctx.lineWidth = 2; dctx.strokeStyle = "#1d2230"; dctx.stroke(); dctx.setLineDash([]); }
  }
  if (cur && cur.length > 1) { chemin(cur); dctx.lineWidth = 2.2; dctx.strokeStyle = "#e0115f"; dctx.stroke(); }
}
const pos = e => { const r = draw.getBoundingClientRect(); return versDonnees(e.clientX - r.left, e.clientY - r.top); };
draw.addEventListener("pointerdown", e => { draw.setPointerCapture(e.pointerId); cur = [pos(e)]; });
draw.addEventListener("pointermove", e => {
  if (!cur) return;
  const p = pos(e), l = cur[cur.length - 1];
  if (Math.hypot((p[0] - l[0]) / (X1 - X0), (p[1] - l[1]) / (AGE1 - AGE0)) > .003) { cur.push(p); dessinerSel(); }
});
draw.addEventListener("pointerup", () => {
  if (!cur) return;
  if (cur.length > 4) {
    const ajout = $("add").checked && shapes.length && titreSel !== TOUT;
    selectionner(ajout ? [...shapes, cur] : [cur], ajout ? `${shapes.length + 1} formes` : "Votre zone");
  }
  cur = null; dessinerSel();
});
draw.addEventListener("pointercancel", () => { cur = null; dessinerSel(); });

// composition de la sélection : chiffres du modèle (pas des taches). Part de chaque case dans la sélection :
// 1 pour une zone d'âges, part de ses pixels couverts pour un lasso ; puis × inscrits de la case × parts
const off = document.createElement("canvas"); off.width = W; off.height = H;
const octx = off.getContext("2d", { willReadFrequently: true });
function calculer() {
  $("seltitle").textContent = shapes.length ? "Sélection · " + titreSel : "Sélection";
  if (!shapes.length) { $("sel").innerHTML = '<div class="empty">Tracez un contour sur la pyramide pour afficher la composition de la zone.</div>'; return; }
  const frac = new Float64Array(NA * ND), lassos = shapes.filter(s => !s.cases);
  if (lassos.length) {
    octx.clearRect(0, 0, W, H); octx.fillStyle = "#000";
    for (const s of lassos) { octx.beginPath(); s.forEach((p, i) => { const x = (p[0] - X0) / (X1 - X0) * W, y = (AGE1 - p[1]) / (AGE1 - AGE0) * H; i ? octx.lineTo(x, y) : octx.moveTo(x, y); }); octx.closePath(); octx.fill(); }
    const px = octx.getImageData(0, 0, W, H).data;
    for (const i of INS) if (px[4 * i + 3] >= 128) frac[CODE[i]]++;
    for (let c = 0; c < NA * ND; c++) if (frac[c]) frac[c] /= PIXCASE[c];
  }
  for (const { cases: z } of shapes.filter(s => s.cases))
    for (let i = 0; i < NA; i++) if (D.ages[i] >= z.aMin && D.ages[i] <= z.aMax) for (let d = 0; d < ND; d++) frac[i * ND + d] = 1;
  if (!frac.some(v => v > 0)) { $("sel").innerHTML = '<div class="empty">Le contour tracé ne recouvre aucune partie de la pyramide.</div>'; return; }
  const A = new Float64Array(K); let insZone = 0;
  for (let c = 0; c < NA * ND; c++) if (frac[c]) {
    const ins = frac[c] * D.inscrits[Math.floor(c / ND)][c % ND];
    insZone += ins; for (let k = 0; k < K; k++) A[k] += ins * SH[k][c];
  }
  const ex = D.candidats.map(c => !NON_EXPRIMES.has(c.id)), exprZ = A.reduce((s, v, k) => ex[k] ? s + v : s, 0);
  const fmtN = v => v >= 1e6 ? `${fmtM(v)} M` : v >= 1000 ? (Math.round(v / 1000) * 1000).toLocaleString("fr-FR") : "moins de 1 000";
  const lignes = D.candidats.map((c, k) => ({ c, k, part: A[k] / TOT[k], ins: A[k] / insZone, exp: ex[k] ? A[k] / exprZ : null }));
  lignes.sort((x, y) => A[y.k] - A[x.k]);
  let h = `<div class="kpi"><div><b>${fmtP(insZone / TOTAL)}</b><small>des inscrits</small></div><div><b>${fmtM(insZone)} M</b><small>d'inscrits</small></div></div>`;
  h += `<table class="res"><thead><tr><th>Candidat</th><th>Score dans la zone<br><small>% des inscrits</small></th><th>Part de son électorat</th><th>Électeurs<br><small>dans la zone</small></th></tr></thead><tbody>`;
  for (const l of lignes) h += `<tr class="${state.shown[l.k] ? "" : "dim"}"><td><div class="nm2"><span class="sq" style="background:${l.c.couleur}"></span>${l.c.nom}</div><div class="barre"><i style="width:${(l.part * 100).toFixed(1)}%;background:${l.c.couleur}"></i></div></td>`
    + `<td><b>${fmtP(l.ins)}${l.exp === null ? "" : `<small class="ins">${fmtP(l.exp)} exp.</small>`}</b></td><td>${fmtP(l.part)}</td><td>${fmtN(A[l.k])}</td></tr>`;
  $("sel").innerHTML = h + `</tbody></table>`;
}

// ---------- tour affiché : candidats, parts par case, surfaces visées
function choisirTour(t) {
  state.tour = t; const T = D.tours[t];
  D.candidats = T.candidats; D.parts = T.parts; D.officiel = T.officiel; K = D.candidats.length;
  SH = D.parts.map(p => { const a = new Float64Array(NA * ND); for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) a[i * ND + d] = p[i][d]; return a; });
  TOT = SH.map(s => s.reduce((u, v, c) => u + v * D.inscrits[Math.floor(c / ND)][c % ND], 0));
  TOTAL = TOT.reduce((a, b) => a + b, 0); CIBLE = TOT.map(v => v / TOTAL);
  state.shown = D.candidats.map(() => true);
  const z = $("tour_txt"); if (z) z.textContent = `au ${t === 0 ? "premier" : "second"} tour du ${T.date}`;
}

// ---------- pilotage
let job = 0;
function lancer() {
  const my = ++job; $("status").textContent = "Calcul…";
  setTimeout(() => {
    if (my !== job) return;
    const t0 = performance.now(), ecart = dessiner();
    peindre(); superposer();
    $("status").textContent = `Prêt (${Math.round(performance.now() - t0)} ms ; surfaces justes à ${(ecart * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} point près)`;
  }, 30);
}

fetch("data_2022.json", { cache: "no-cache" }).then(r => r.json()).then(data => {
  D = data; NA = D.ages.length; ND = D.diplomes.length;
  try { const t = +localStorage.getItem("tour2022"); if (D.tours[t]) state.tour = t; } catch (e) {}
  choisirTour(state.tour);
  $("tour").innerHTML = D.tours.map((t, i) => `<label class="opt"><input type="radio" name="tour" value="${i}" ${i === state.tour ? "checked" : ""}> ${t.nom} <small>(${t.date})</small></label>`).join("");
  $("tour").addEventListener("change", e => {
    choisirTour(+e.target.value); try { localStorage.setItem("tour2022", state.tour); } catch (err) {}
    legende(); calculer(); lancer();                    // mêmes réglages et même sélection
  });
  const t = $("tiles"); t.width = W; t.height = H;
  try { const z = localStorage.getItem("zoom2022"); if (z) $("zoom").value = z; } catch (e) {}
  state.zoom = $("zoom").value / 100; $("zoom_o").textContent = $("zoom").value + " %";
  lisser(); geometrie(); axes(); legende();

  // curseurs des taches ; toucher un curseur repasse le style en « Personnalisé »
  const FMT = { temp: tf, grain: v => v, grav: v => v ? tf(v) : "aucune", portee: v => v + " px", etir: v => v === 1 ? "rondes" : "× " + tf(v) };
  const selStyle = $("style"); let applique = false;
  for (const id of CURSEURS) {
    const maj = () => $(id + "_o").textContent = FMT[id](state[id]);
    $(id).addEventListener("input", e => { state[id] = +e.target.value; maj(); if (!applique) selStyle.value = ""; });
    $(id).addEventListener("change", lancer);
  }
  selStyle.innerHTML = Object.keys(STYLES).map(n => `<option>${n}</option>`).join("") + `<option value="" disabled>Personnalisé</option>`;
  selStyle.addEventListener("change", () => {
    const st = STYLES[selStyle.value]; if (!st) return;
    applique = true;
    for (const id of CURSEURS) { $(id).value = st[id]; $(id).dispatchEvent(new Event("input")); }
    state.liseres = st.liseres; applique = false;
    try { localStorage.setItem("prereglage2022", selStyle.value); } catch (e) {}
    lancer();
  });
  $("reseed").addEventListener("click", () => { state.seed++; lancer(); });
  $("dlines").addEventListener("change", e => { state.dlines = e.target.checked; superposer(); });
  $("zoom").addEventListener("input", e => { $("zoom_o").textContent = e.target.value + " %"; });
  $("zoom").addEventListener("change", e => {
    state.zoom = e.target.value / 100; try { localStorage.setItem("zoom2022", e.target.value); } catch (err) {}
    geometrie(); axes(); redim(); lancer();
  });
  $("all").addEventListener("click", () => { state.shown.fill(true); legende(); peindre(); calculer(); });
  $("none").addEventListener("click", () => { state.shown.fill(false); legende(); peindre(); calculer(); });
  $("clear").addEventListener("click", () => selectionner([], ""));
  $("undo").addEventListener("click", () => selectionner(shapes.slice(0, -1), shapes.length > 2 ? `${shapes.length - 1} formes` : shapes.length === 2 ? "Votre zone" : ""));
  $("toutsel").addEventListener("change", e => selectionner(e.target.checked ? [zone(18, 100)] : [], e.target.checked ? TOUT : ""));
  new ResizeObserver(() => { axes(); if (LAB) superposer(); redim(); }).observe(draw);
  // sur une seule colonne (téléphone, tablette), le tableau de sélection passe juste sous la carte
  const UNE_COLONNE = matchMedia("(max-width:1000px)");
  const placer = () => { const bloc = $("bloc-sel"); UNE_COLONNE.matches ? document.querySelector(".mapbox").after(bloc) : document.querySelector(".panel").prepend(bloc); };
  UNE_COLONNE.addEventListener("change", placer); placer();

  shapes = [zone(18, 100)]; titreSel = TOUT; $("toutsel").checked = true;   // au départ : tous les inscrits
  redim(); calculer();
  let depart = "Lisible, proche des données";
  try { const st = localStorage.getItem("prereglage2022"); if (st && STYLES[st]) depart = st; } catch (e) {}
  selStyle.value = depart; selStyle.dispatchEvent(new Event("change"));   // lance le premier dessin
});
