// Carte sociale du vote — rendu en taches
// Données : data.json (scripts/04_export_site.py) ; constantes et lissage dans common.js

const W = 1100, H = 820, N = W * H;
// Paramètres d'adresse, pour intégrer la pyramide ailleurs :
//   vue        : pyramide seule, sans réglages ni panneau ;    hyp     : hypothèse de data.json ;
//   montrer    : candidats affichés, séparés par des virgules (les autres en blanc).
const ADR = new URLSearchParams(location.search), VUE = ADR.has("vue");
if (VUE) document.documentElement.classList.add("vue");
let AGE0 = AGE_MIN, AGE1 = AGE_MAX;                  // bords du cadre (dépendent du zoom)


let D, NA, ND, X0, X1, BND;          // données et géométrie
let CODE, INS, NI, PIXCASE, PIXC;                   // case de chaque pixel, pixels dans la pyramide
const state = { hyp: null, T: 0.45, grain: 5, seed: 1, shown: {}, dlines: true, grav: 0, portee: 10, etir: 1, liseres: true,
                part: { global: 0, jeunes: 0, ages: 0, peu: 0, sup: 0 } };   // participation : écarts au sondage, en points
let H_ = null;                       // hypothèse courante : {cands, SH, LOGSH, TARGET, TOT}
let NOISE = new Map(), NOISE_KEY = "";
let LAB = null;
// ---------- géométrie : bornes des couloirs de diplôme à chaque âge (en inscrits)
// ordre gauche (du centre vers l'extérieur) : Bac, CAP-BEP, Sans diplôme ; droite : Bac+2, Bac+3/4, Bac+5
function geometrie() {
  NA = D.ages.length; ND = D.diplomes.length;
  BND = D.inscritsLisses.map(r => {
    const g1 = -r[2], g2 = g1 - r[1], g3 = g2 - r[0];
    const d1 = r[3], d2 = d1 + r[4], d3 = d2 + r[5];
    return [g3, g2, g1, 0, d1, d2, d3];              // 7 bornes, 6 couloirs : Sans, CAP, Bac | Bac+2, Bac+3/4, Bac+5
  });
  // cadrage : la pyramide serrée (avec une petite marge) occupe state.zoom de la largeur et de la hauteur
  const maxG = Math.max(...BND.map(b => -b[0])), maxD = Math.max(...BND.map(b => b[6]));
  const gx = -maxG * 1.04, dx = maxD * 1.06, cx = (gx + dx) / 2, wx = (dx - gx) / state.zoom;
  X0 = cx - wx / 2; X1 = cx + wx / 2;
  const ha = (AGE_MAX - AGE_MIN) / state.zoom, marge = ha - (AGE_MAX - AGE_MIN);
  AGE0 = AGE_MIN - marge * .55; AGE1 = AGE_MAX + marge * .45;   // un peu plus d'air sous l'axe des 18 ans
  const COUL = [0, 1, 2, 3, 4, 5];                   // couloir -> indice de diplôme
  CODE = new Uint16Array(N).fill(65535);
  for (let py = 0; py < H; py++) {
    const age = AGE1 - (py + 0.5) / H * (AGE1 - AGE0);
    if (age < AGE_MIN || age > AGE_MAX) continue;
    const f = Math.min(NA - 1, Math.max(0, age - D.ages[0]));
    const i0 = Math.floor(f), i1 = Math.min(NA - 1, i0 + 1), t = f - i0;
    const b = BND[i0].map((v, j) => v * (1 - t) + BND[i1][j] * t);   // bornes lissées entre deux âges
    const ia = Math.min(NA - 1, Math.max(0, Math.round(age - D.ages[0])));
    for (let px = 0; px < W; px++) {
      const x = X0 + (px + 0.5) / W * (X1 - X0);
      if (x < b[0] || x > b[6]) continue;
      let c = 0; while (c < 5 && x > b[c + 1]) c++;
      CODE[py * W + px] = ia * ND + COUL[c];
    }
  }
  const tmp = []; for (let i = 0; i < N; i++) if (CODE[i] !== 65535) tmp.push(i);
  INS = Int32Array.from(tmp); NI = INS.length; GEO_V++;
  // pixels par case : à cause de l'arrondi des lignes (8 ou 9 lignes par année d'âge), du lissage et de
  // l'interpolation des bords entre deux âges, une case a en moyenne 6 % de pixels de trop ou de moins (22 %
  // avant 21 ans) ; les chiffres d'un lasso pondèrent donc chaque pixel par inscrits de sa case / pixels de sa case
  PIXCASE = new Float64Array(NA * ND); for (const i of INS) PIXCASE[CODE[i]]++;
  PIXC = new Uint16Array(NI); for (let j = 0; j < NI; j++) PIXC[j] = CODE[INS[j]];   // case de chaque pixel (calage)
}

// ---------- hypothèse : parts par case, cibles de surface
function chargerHypothese(nomHyp) {
  const h0 = D.hypotheses[nomHyp];
  const adj = ajusterParticipation(h0, state.part);   // participation réglée (common.js)
  const h = { candidats: h0.candidats, parts: adj.parts }, K = h.candidats.length;
  afficherParticipation(adj.participation);
  const SH = h.candidats.map((_, k) => { const a = new Float32Array(NA * ND); for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) a[i * ND + d] = Math.max(1e-6, h.parts[k][i][d]); return a; });
  const LOGSH = SH.map(a => a.map(v => Math.log(v)));
  const TOT = new Float64Array(K);                   // voix (en inscrits) par candidat
  for (let k = 0; k < K; k++) for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) TOT[k] += h.parts[k][i][d] * D.inscrits[i][d];
  // surface visée = part des inscrits (bruts) de chaque candidat : la correction b rattrape aussi les petits
  // écarts de la géométrie (inscrits lissés, arrondi des lignes de pixels)
  const s = TOT.reduce((a, b) => a + b, 0);
  H_ = { cands: h.candidats, SH, LOGSH, TOT, TARGET: Array.from(TOT, v => v / s) };
  for (const c of H_.cands) if (!(c in state.shown)) state.shown[c] = true;
  majContraste();
}

// ---------- contraste : part de la surface des zones déplacée par le partage T (partageT, common.js)
let B_PARTAGE = null, LOUPE = null;
function majContraste() {
  if (!H_) return;
  const r = partageT(H_.SH, state.T, B_PARTAGE); B_PARTAGE = r.b; LOUPE = r;
  if ($("incert").value.startsWith("*") && LAB) superposer();     // la précision de ce qu'on voit dépend du partage
  // court, pour tenir sur une ligne sous le curseur ; l'infobulle explique. Avec la gravité, l'écart est plus grand.
  $("contraste").textContent = r.deplace < 5e-4 ? "Loupe : aucune" : `Loupe : ${state.grav > 0 ? "≥ " : ""}${fmtP(r.deplace)} déplacé`;
}

function afficherParticipation(r) {
  const f = v => (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
  const modifie = Object.values(state.part).some(v => v);
  $("part_resume").textContent = modifie ? `${f(r.nouvelle)} (sondage : ${f(r.base)})` : f(r.base);
  graphesParticipation(r);
  // valeur réelle du groupe : elle bouge aussi quand un autre curseur touche une partie de ses membres
  for (const g of ["jeunes", "ages", "peu", "sup"]) $(`part_${g}_o`).textContent = Math.abs(r[g][1] - r[g][0]) > 5e-4 ? `${f(r[g][0])} → ${f(r[g][1])}` : f(r[g][0]);
  $("part_global_o").textContent = state.part.global ? (state.part.global > 0 ? "+" : "−") + Math.abs(state.part.global).toLocaleString("fr-FR") + (Math.abs(state.part.global) >= 2 ? " pts" : " pt") : "aucun";
}

// ---------- participation : graphiques descriptifs (sondage en pointillé / creux, réglage en couleur)
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, at, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); parent && parent.appendChild(e); return e; }
function graphesParticipation(r) {
  for (const parAge of [true, false]) {
    const box = $(parAge ? "part_g_age" : "part_g_dip"), W = 360, H = 170, m = { l: 34, r: 10, t: 10, b: 22 };
    const y0 = parAge ? .2 : .4, y1 = 1, modifie = parAge ? r.ageNouv.some((v, i) => Math.abs(v - r.age[i]) > 1e-4) : r.dipNouv.some((v, d) => Math.abs(v - r.dip[d]) > 1e-4);
    const X = parAge ? (a => m.l + (a - 18) / 82 * (W - m.l - m.r)) : (d => m.l + (d + .5) / 6 * (W - m.l - m.r));
    const Y = v => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);
    box.innerHTML = "";
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "part-svg", role: "img", "aria-label": parAge ? "Participation selon l'âge" : "Participation selon le diplôme" }, box);
    for (let v = y0; v <= y1 + 1e-9; v += .2) {
      svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "part-grille" }, svg);
      svgEl("text", { x: m.l - 4, y: Y(v) + 3, class: "part-axe", "text-anchor": "end" }, svg).textContent = Math.round(v * 100) + " %";
    }
    if (parAge) {
      for (const a of [20, 40, 60, 80, 100]) svgEl("text", { x: X(a), y: H - 5, class: "part-axe", "text-anchor": "middle" }, svg).textContent = a + " ans";
      const chemin = vs => vs.map((v, i) => `${i ? "L" : "M"}${X(D.ages[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      if (modifie) svgEl("path", { d: chemin(r.age), class: "part-base" }, svg);
      svgEl("path", { d: chemin(r.ageNouv), class: "part-nouv" }, svg);
    } else {
      ["Sans dipl.", "CAP-BEP", "Bac", "Bac+2", "Bac+3/4", "Bac+5"].forEach((l, d) => {
        svgEl("text", { x: X(d), y: H - 5, class: "part-axe", "text-anchor": "middle" }, svg).textContent = l;
        if (modifie) { svgEl("line", { x1: X(d), x2: X(d), y1: Y(r.dip[d]), y2: Y(r.dipNouv[d]), class: "part-tige" }, svg); svgEl("circle", { cx: X(d), cy: Y(r.dip[d]), r: 3.5, class: "part-pt-base" }, svg); }
        svgEl("circle", { cx: X(d), cy: Y(r.dipNouv[d]), r: 4.5, class: "part-pt" }, svg);
        svgEl("text", { x: X(d), y: Y(r.dipNouv[d]) - 8, class: "part-val", "text-anchor": "middle" }, svg).textContent = Math.round(r.dipNouv[d] * 100);
      });
    }
  }
}

// ---------- bruit lissé par candidat -> loi de Gumbel
// ---------- bruit : un champ par candidat (champBruit, taches.js), stable d'une hypothèse à l'autre.
// Calculé dans des workers (taches-travail.js), plusieurs candidats en parallèle, sans geler la page (audit du
// 18/11/2026, P4) ; sans worker (navigateur, fichier ouvert en local), sur place. Même code : même dessin.
let GEO_V = 0;                                       // version du cadrage (geometrie()) : INS change avec le zoom
const cleBruit = () => state.seed + ":" + state.grain + ":" + state.etir + ":" + GEO_V;
const POOL = (() => {
  // pas de workers dans les vues intégrées (plusieurs vues à la fois dans une même page, et l'export PDF n'attend pas les workers)
  if (typeof Worker === "undefined" || location.protocol === "file:" || VUE) return null;
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)), attente = new Map();
    const ws = Array.from({ length: n }, () => { const w = new Worker("taches-travail.js"); w.geo = -1; w.charge = 0;
      w.onmessage = e => { const r = attente.get(e.data.id); attente.delete(e.data.id); w.charge--; r && r(e.data.g || e.data.d || null); };
      w.onerror = () => { w.casse = true; for (const r of attente.values()) r(null); attente.clear(); };
      return w; });
    let id = 0;
    const envoyer = (w, msg) => {
      if (w.geo !== GEO_V) { w.postMessage({ geo: GEO_V, INS, W, H }); w.geo = GEO_V; }
      const m = ++id; w.charge++;
      return new Promise(r => { attente.set(m, r); w.postMessage({ id: m, geo: GEO_V, ...msg }); });
    };
    const libres = () => ws.filter(x => !x.casse);
    return {
      calculer(cand) {
        const w = libres().sort((a, b) => a.charge - b.charge)[0];
        return w ? envoyer(w, { cand, seed: state.seed, grain: state.grain, etir: state.etir }) : Promise.resolve(null);
      },
      // densités de gravité des K candidats, réparties entre les workers ; null si un worker a échoué
      async densites(K, R) {
        const lw = libres(); if (!lw.length) return null;
        const parts = lw.map((w, i) => [...Array(K).keys()].filter(k => k % lw.length === i));
        const res = await Promise.all(lw.map((w, i) => parts[i].length ? envoyer(w, { LAB, ks: parts[i], R }) : Promise.resolve([])));
        if (res.some(r => !r)) return null;
        const out = new Array(K); parts.forEach((ks, i) => ks.forEach((k, q) => out[k] = res[i][q]));
        return out;
      },
    };
  } catch (e) { return null; }
})();
// prépare les champs des candidats qui manquent (en parallèle) ; ceux qu'un worker n'a pas pu faire le seront sur place
const EN_COURS = new Map();
async function preparerBruit(cands) {
  const cle = cleBruit();
  if (cle !== NOISE_KEY) { NOISE.clear(); NOISE_KEY = cle; }
  if (!POOL) return;
  const manquants = cands.filter(c => !NOISE.has(c));
  // un champ déjà demandé pour ces réglages n'est pas redemandé (curseurs bougés pendant le calcul)
  const champs = await Promise.all(manquants.map(c => {
    const k = cle + "|" + c;
    if (!EN_COURS.has(k)) EN_COURS.set(k, POOL.calculer(c).finally(() => EN_COURS.delete(k)));
    return EN_COURS.get(k);
  }));
  if (cleBruit() !== cle) return;                    // réglages changés entre-temps : un nouveau calcul suivra
  manquants.forEach((c, i) => { if (champs[i] && champs[i].length === NI) NOISE.set(c, champs[i]); });
}
function bruit(cand) {
  const cle = cleBruit();
  if (cle !== NOISE_KEY) { NOISE.clear(); NOISE_KEY = cle; }
  if (!NOISE.has(cand)) NOISE.set(cand, champBruit(cand, state.seed, state.grain, state.etir, W, H, INS));
  return NOISE.get(cand);
}

// ---------- tableaux à plat pour le calage (audit du 18/11/2026, P3) : la case de chaque pixel (PIXC, geometrie()),
// ln s + b rangé par case et par candidat (ctx.LB, refait à chaque changement de b), le bruit rangé pixel par pixel
// (ctx.GF[j × K + k]) et, avec la gravité, la densité (ctx.DF). Le score d'un pixel, (ln s + b) + T × g [+ gravité × densité],
// est calculé dans le même ordre qu'avant : le dessin est identique au pixel près.
function contexte(G) {
  const K = G.length, GF = new Float32Array(NI * K);
  for (let k = 0; k < K; k++) { const g = G[k]; for (let j = 0, o = k; j < NI; j++, o += K) GF[o] = g[j]; }
  return { K, L: H_.LOGSH, T: state.T, GF, DF: null, grav: state.grav, LB: new Float64Array(NA * ND * K) };
}
function calculerLB(ctx, b) {
  const { K, L, LB } = ctx, C = NA * ND;
  for (let k = 0; k < K; k++) { const l = L[k], bk = b[k]; for (let c = 0, o = k; c < C; c++, o += K) LB[o] = l[c] + bk; }
}
// couleur gagnante d'un pixel sur `pas` : comptée dans cnt et/ou écrite dans LAB
function parcourir(ctx, b, pas, cnt, ecrire) {
  calculerLB(ctx, b);
  const { K, LB, GF, T, DF, grav } = ctx; let n = 0;
  for (let j = 0; j < NI; j += pas) {
    const o = PIXC[j] * K, q = j * K; let best = -Infinity, bk = 0;
    if (DF) { for (let k = 0; k < K; k++) { const v = LB[o + k] + T * GF[q + k] + grav * DF[q + k]; if (v > best) { best = v; bk = k; } } }
    else { for (let k = 0; k < K; k++) { const v = LB[o + k] + T * GF[q + k]; if (v > best) { best = v; bk = k; } } }
    if (cnt) cnt[bk]++;
    if (ecrire) LAB[INS[j]] = bk;
    n++;
  }
  return n;
}

// ---------- ajustement de b : chaque couleur doit couvrir sa part des pixels (compte sur un pixel sur `pas`).
// Le pas est proportionnel au partage T (quand T est petit, un petit changement de b fait basculer des zones
// entières), borné, et décroît au fil des itérations. Un pas plein et fixe faisait osciller le calcul avec de
// grosses taches ou un partage bas : des couleurs disparaissaient (jusqu'à 50 points d'écart de surface).
// Arrêt dès que toutes les surfaces sont justes.
function ajuster(b, ctx, iterations, pas) {
  const K = b.length, cnt = new Float64Array(K), s = Math.max(.05, Math.min(1, state.T));
  for (let it = 0; it < iterations; it++) {
    cnt.fill(0); const n = parcourir(ctx, b, pas, cnt, false);
    let pire = 0; for (let k = 0; k < K; k++) pire = Math.max(pire, Math.abs(cnt[k] / n - H_.TARGET[k]));
    if (pire < 3e-4) break;                                   // toutes les surfaces à 0,03 point près : inutile de continuer
    const amorti = .6 * Math.pow(.15, it / (iterations - 1));
    for (let k = 0; k < K; k++) b[k] += Math.max(-.5 * s, Math.min(.5 * s, amorti * s * (Math.log(H_.TARGET[k]) - Math.log(Math.max(cnt[k] / n, 1e-5)))));
  }
}

// ---------- tirage : argmax(log p + b + T·g), b ajusté pour que chaque surface égale les voix
// Départ calculé (audit du 18/11/2026, P3 a) : avec un bruit de Gumbel, la surface attendue de chaque couleur dans une
// case vaut softmax((ln s + b) / T) ; partageT() (common.js) en déduit b sur les 498 cases, sans pixel, en quelques ms.
// Sur le vrai tirage (bruit lissé en taches), les surfaces tombent alors à 0,3-1,3 point près ; quelques passes de
// finition sur tous les pixels font le reste. Avant : 120 itérations à tâtons sur un pixel sur 5, à partir de b = 0.
// Renvoie false si un autre calcul a été lancé pendant l'attente des workers (gravité) : on abandonne celui-ci.
async function attribuer(my) {
  const ctx = contexte(H_.cands.map(bruit));
  const b = Float64Array.from(partageT(H_.SH, state.T, null, { poids: PIXCASE, cible: H_.TARGET }).b);
  LAB = new Uint8Array(N).fill(255);
  parcourir(ctx, b, 1, null, true);
  if (state.grav > 0 && !(await graviter(ctx, b, my))) return false;
  ajusterVisible(b, ctx, 30, .8);                            // finition sur tous les pixels
  return true;
}

// ---------- liseré : le trait blanc prend un pixel à chaque bord de tache (bord gauche ou haut, comme dans
// peindre()). Les taches petites et éparpillées ont plus de bord pour leur surface : sans correction, elles
// perdaient jusqu'à 10 % de leur surface visible au profit des grandes plaques (abstention, Le Pen). On réajuste
// donc b sur les pixels visibles, comptés sur toute l'image : chaque couleur occupe sa part des voix dans ce qui
// reste coloré une fois les liserés tracés. Sans liseré, la même finition compte tous les pixels : ajuster() ne
// regarde qu'un pixel sur 5 (ou 3), ce qui laissait jusqu'à 0,13 point d'écart sur l'image entière.
const estBord = (i, l) => { const x = i % W; return (x > 0 && LAB[i - 1] !== l && LAB[i - 1] !== 255) || (i >= W && LAB[i - W] !== l && LAB[i - W] !== 255); };
// Pas proportionnel à T + gravité : la gravité rend les surfaces peu sensibles à b, un pas réglé sur T seul
// laissait jusqu'à 0,6 point d'écart après 30 itérations.
function ajusterVisible(b, ctx, iterations = 30, pas0 = .5) {
  const K = b.length, vis = new Float64Array(K), s = Math.max(.05, Math.min(1, state.T)) + state.grav;
  for (let it = 0; ; it++) {
    parcourir(ctx, b, 1, null, true);
    vis.fill(0); let n = 0;
    for (const i of INS) { const l = LAB[i]; if (!state.liseres || !estBord(i, l)) { vis[l]++; n++; } }
    let pire = 0; for (let k = 0; k < K; k++) pire = Math.max(pire, Math.abs(vis[k] / n - H_.TARGET[k]));
    if (pire < 3e-4 || it === iterations) break;
    const amorti = pas0 * Math.pow(.15, it / (iterations - 1));
    for (let k = 0; k < K; k++) b[k] += Math.max(-.5 * s, Math.min(.5 * s, amorti * s * (Math.log(H_.TARGET[k]) - Math.log(Math.max(vis[k] / n, 1e-5)))));
  }
}

// ---------- gravité : chaque pixel est attiré par les pixels de même couleur autour de lui
// On mesure, pour chaque candidat, la densité de ses pixels dans un rayon « portée » (flou en boîte de
// l'indicatrice), et on l'ajoute au score : score = ln p + b + T·g + gravité × densité. Les pixels isolés
// rejoignent les taches voisines, les taches proches fusionnent. b est réajusté à chaque passe pour
// que chaque surface reste égale aux voix. Ajoute la densité au contexte (ctx.DF).
// Les densités des candidats sont calculées en parallèle dans les workers (densite, taches.js), sinon sur place.
async function graviter(ctx, b, my) {
  const K = ctx.K, R = Math.max(1, Math.round(state.portee / 2)), DF = new Float32Array(NI * K);
  for (let passe = 0; passe < 3; passe++) {
    let d = POOL && await POOL.densites(K, R);
    if (my !== job) return false;
    if (!d) d = [...Array(K).keys()].map(k => densite(LAB, k, R, W, H, INS));
    for (let k = 0; k < K; k++) { const dk = d[k]; for (let j = 0, o = k; j < NI; j++, o += K) DF[o] = dk[j]; }
    ctx.DF = DF;
    ajuster(b, ctx, 30, 3);
    parcourir(ctx, b, 1, null, true);
  }
  return true;
}

// ---------- rendu
const tiles = $("tiles"); tiles.width = W; tiles.height = H; const tctx = tiles.getContext("2d");
const RGB = c => [1, 3, 5].map(j => parseInt(COULEURS[c].slice(j, j + 2), 16));
function peindre() {
  const im = tctx.createImageData(W, H), d = im.data, cols = H_.cands.map(RGB), vis = H_.cands.map(c => state.shown[c]);
  for (let i = 0; i < N; i++) {
    const o = 4 * i, l = LAB[i];
    let c = PAPER;
    if (l !== 255) {
      c = vis[l] ? cols[l] : [255, 255, 255];
      const x = i % W, bord = (x > 0 && LAB[i - 1] !== l && LAB[i - 1] !== 255) || (i >= W && LAB[i - W] !== l && LAB[i - W] !== 255);
      if (bord && vis[l] && state.liseres) c = PAPER;
    }
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  tctx.putImageData(im, 0, 0);
  superposer();
}
const over = $("over");
// ---------- incertitude : zones hachurées pour un candidat (niveaux de la page Limites, niveauxIncertitude de common.js)
// moyenne : hachures fines et espacées ; large : serrées. Pas de gris : il se confondrait avec l'abstention et les blancs.
function motifHachure(c, dpr, pas, epaisseur, alpha) {
  const t = Math.max(2, Math.round(pas * dpr)), m = document.createElement("canvas"); m.width = m.height = t;
  const g = m.getContext("2d");
  g.strokeStyle = "rgb(29,34,48)"; g.globalAlpha = alpha; g.lineWidth = epaisseur * dpr;   // sombre : la pyramide est sur papier clair, quel que soit le thème
  for (const o of [-t, 0, t]) { g.beginPath(); g.moveTo(o, t); g.lineTo(o + t, 0); g.stroke(); }   // diagonale qui se raccorde d'un carreau à l'autre
  return c.createPattern(m, "repeat");
}
let CONTOUR = null;   // contour blanc des zones d'incertitude, dessiné en dernier par superposer()
function hachures(c, P, dpr) {
  // valeurs du menu : "" (rien), "#" (chiffres, candidats affichés), un nom (chiffres, ce candidat),
  // "*" (dessin, candidats affichés), "*" + nom (dessin, ce candidat seul : même calcul que "*" avec lui seul affiché)
  const cand = $("incert").value, leg = $("incert-leg"), cumul = cand.startsWith("*"), seul = cumul && cand.length > 1 ? cand.slice(1) : null;
  const HF = FOURCH && FOURCH.hypotheses[state.hyp];
  let N_ = null;
  if (cand && HF && cumul) {
    const aff = seul ? new Set([seul]) : new Set(H_.cands.filter(c => state.shown[c])), ks = H_.cands.map((c, k) => k).filter(k => aff.has(H_.cands[k]));
    const loupeZone = LOUPE && (z => {                               // effet loupe sur les seuls candidats affichés
      const zi = Math.floor(z / ND), d = z % ND; let sa = 0, s = 0;
      for (const k of ks) { const [des, mod] = LOUPE.zonePart(k, zi, d), e = des - mod; sa += Math.abs(e); s += e; }
      return (sa + Math.abs(s)) / 2;
    });
    N_ = aff.size ? niveauxCumules(HF, aff, loupeZone) : null;
  } else if (cand === "#" && HF) N_ = niveauxModeleCumules(D.hypotheses[state.hyp], HF, new Set(H_.cands.filter(c => state.shown[c])));
  else if (cand && HF) N_ = niveauxIncertitude(D.hypotheses[state.hyp], HF, cand);
  leg.hidden = !cand;
  if (!cand) return;
  if (!N_) { leg.textContent = (cumul || cand === "#") && HF ? "Aucun candidat affiché (parmi ceux qui ont une fourchette)." : `Pas de fourchette ${cumul ? "" : "pour " + nom(cand) + " "}avec ces données (modèle publié seulement ; make incertitude).`; return; }
  const motifs = [null, motifHachure(c, dpr, 8, 1, .45), motifHachure(c, dpr, 4, 1.2, .65)];
  const za = D.ages.map(a => ZONES_AGE.findIndex(([lo, hi]) => a >= lo && a <= hi));
  for (let zi = 0; zi < ZONES_AGE.length; zi++) {
    const idx = D.ages.map((a, i) => i).filter(i => za[i] === zi);
    if (!idx.length) continue;
    const a0 = Math.max(AGE_MIN, D.ages[idx[0]] - .5), a1 = Math.min(AGE_MAX, D.ages[idx[idx.length - 1]] + .5);
    for (let d = 0; d < ND; d++) {
      const n = N_[zi * ND + d]; if (!n) continue;
      // couloir du diplôme d entre les âges de la tranche : bord gauche puis bord droit (bornes interpolées aux extrémités)
      const bord = (j, a) => { const f = Math.min(NA - 1, Math.max(0, a - D.ages[0])), i0 = Math.floor(f), i1 = Math.min(NA - 1, i0 + 1), t = f - i0; return BND[i0][j] * (1 - t) + BND[i1][j] * t; };
      const ages = [a0, ...idx.map(i => D.ages[i]), a1];
      c.beginPath();
      ages.forEach((a, q) => { const [x, y] = P(bord(d, a), a); q ? c.lineTo(x, y) : c.moveTo(x, y); });
      for (let q = ages.length - 1; q >= 0; q--) { const [x, y] = P(bord(d + 1, ages[q]), ages[q]); c.lineTo(x, y); }
      c.closePath(); c.fillStyle = motifs[n]; c.fill();
    }
  }
  // contour blanc des régions d'incertitude : un trait seulement là où le niveau change d'une zone à sa voisine
  // (les zones voisines de même niveau forment une seule région, non découpée), et au bord de la pyramide
  // autour des zones hachurées
  const niv = (zi, d) => zi < 0 || zi >= ZONES_AGE.length || d < 0 || d >= ND ? -1 : N_[zi * ND + d];
  const bordC = (j, a) => { const f = Math.min(NA - 1, Math.max(0, a - D.ages[0])), i0 = Math.floor(f), i1 = Math.min(NA - 1, i0 + 1), t = f - i0; return BND[i0][j] * (1 - t) + BND[i1][j] * t; };
  const differe = (n, m) => m === -1 ? n > 0 : n !== m;
  const contour = new Path2D();   // tracé après les lignes de diplôme (superposer), pour passer au-dessus
  for (let zi = 0; zi < ZONES_AGE.length; zi++) {
    const idx = D.ages.map((a, i) => i).filter(i => za[i] === zi);
    if (!idx.length) continue;
    const a0 = Math.max(AGE_MIN, D.ages[idx[0]] - .5), a1 = Math.min(AGE_MAX, D.ages[idx[idx.length - 1]] + .5);
    const ages = [a0, ...idx.map(i => D.ages[i]), a1];
    for (let d = 0; d < ND; d++) {
      const n = niv(zi, d);
      const cote = j => ages.forEach((a, q) => { const [x, y] = P(bordC(j, a), a); q ? contour.lineTo(x, y) : contour.moveTo(x, y); });
      if (differe(n, niv(zi, d - 1)) && (d > 0 || n > 0)) cote(d);                        // côté gauche (voisin plus à gauche)
      if (d === ND - 1 && n > 0) cote(d + 1);                                               // bord droit de la pyramide
      for (const [a, voisin] of [[a0, niv(zi - 1, d)], [a1, niv(zi + 1, d)]])                // bas et haut de la zone
        if (differe(n, voisin) && (voisin !== -1 || n > 0) && !(voisin !== -1 && a === a1)) {   // chaque frontière horizontale une seule fois
          const [x0, y] = P(bordC(d, a), a), [x1] = P(bordC(d + 1, a), a); contour.moveTo(x0, y); contour.lineTo(x1, y);
        }
      if (zi === ZONES_AGE.length - 1 && n > 0) { const [x0, y] = P(bordC(d, a1), a1), [x1] = P(bordC(d + 1, a1), a1); contour.moveTo(x0, y); contour.lineTo(x1, y); }
    }
  }
  CONTOUR = () => { c.strokeStyle = "#fff"; c.lineWidth = 2.2 * dpr; c.lineJoin = "round"; c.stroke(contour); };
  if (cumul) {
    const nAff = H_.cands.filter(c => state.shown[c]).length;
    const qui = seul ? `pour ${nom(seul)}` : nAff === H_.cands.length ? "pour tous les candidats" : nAff === 1 ? "pour le candidat affiché" : `pour les ${nAff} candidats affichés`;
    leg.innerHTML = `<b>Précision du dessin, ${qui}.</b> Part de la surface de chaque zone `
      + (seul ? `où la couleur de ${nom(seul)} pourrait être mal placée, par excès ou par défaut. ` : `qui pourrait porter une autre couleur, les candidats masqués étant comptés comme une seule couleur. `)
      + `Elle cumule l'incertitude des sondages et l'accentuation due au partage des taches (réglé à ${tf(state.T)}, sans effet à 1). Le regroupement (gravité) l'augmente encore.`
      + `<span class="niv"><span><i></i>sans hachures : précis (moins de 5 %)</span><span><i class="moy"></i>moins précis (5 à 10 %)</span><span><i class="lar"></i>peu fiable (plus de 10 %)</span>`
      + `<a href="limites.html">page Limites</a></span>`;
    return;
  }
  if (cand === "#") {
    const aff = H_.cands.filter(c => state.shown[c] && estExprime(c)).length, tous = aff === H_.cands.filter(estExprime).length;
    leg.innerHTML = `<b>Incertitude des estimations du modèle, ${tous ? "pour tous les candidats" : aff === 1 ? "pour le candidat affiché" : `pour les ${aff} candidats affichés`}.</b> `
      + `Dans chaque zone, largeur des intervalles à 90 % rapportée aux scores, soit l'erreur relative moyenne des chiffres du tableau de sélection. `
      + `Elle ne dépend pas du dessin ; le score national du sondage est repris sans modification.`
      + `<span class="niv"><span><i></i>sans hachures : solide (moins de 15 %)</span><span><i class="moy"></i>moyenne (15 à 35 %)</span><span><i class="lar"></i>large (plus de 35 %)</span>`
      + `<a href="limites.html#carte">détail par candidat</a></span>`;
    return;
  }
  leg.innerHTML = `<b>Incertitude sur la répartition des électeurs ${deNom(nom(cand))} par âge et par diplôme.</b> `
    + `Elle ne porte pas sur son score national, repris du sondage. Largeur de l'intervalle à 90 % de son score dans chaque zone, rapportée à ce score.`
    + `<span class="niv"><span><i></i>sans hachures : solide (moins de 15 %)</span><span><i class="moy"></i>moyenne (15 à 35 %)</span><span><i class="lar"></i>large (plus de 35 %)</span>`
    + `<a href="limites.html#carte">détail zone par zone</a></span>`;
}
const majCumul = () => { if (["*", "#"].includes($("incert").value) && LAB) superposer(); };   // la précision cumulée dépend des candidats affichés
let INCERT_VOULU = null;   // choix du dernier passage, appliqué quand les fourchettes sont arrivées (chargement à part)
function remplirIncertitude() {
  const sel = $("incert"), avant = INCERT_VOULU ?? sel.value, H = D.hypotheses[state.hyp];
  if (FOURCH) INCERT_VOULU = null;
  const cands = H.candidats.filter(estExprime);
  sel.innerHTML = '<option value="">Ne pas afficher</option>' + (FOURCH
    ? '<optgroup label="Estimations du modèle"><option value="#">Candidats affichés (cumulé)</option>' + cands.map(c => `<option value="${c}">${nom(c)}</option>`).join("") + "</optgroup>"
      + '<optgroup label="Précision du dessin"><option value="*">Candidats affichés (cumulé)</option>' + cands.map(c => `<option value="*${c}">${nom(c)}</option>`).join("") + "</optgroup>"
    : '<option value="" disabled>Intervalles non calculés</option>');
  sel.value = (cands.includes(avant) || cands.includes(avant.slice(1)) || avant === "*" || avant === "#") && FOURCH ? avant : "";
}

function superposer() {
  const r = over.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  over.width = Math.round(r.width * dpr); over.height = Math.round(r.height * dpr);
  const c = over.getContext("2d"), sx = over.width / (X1 - X0), sy = over.height / (AGE1 - AGE0);
  const etroit = r.width < 430, ech = Math.max(.72, Math.min(1, r.width / 700));   // petits écrans : textes réduits
  const P = (x, a) => [(x - X0) * sx, (AGE1 - a) * sy];
  c.clearRect(0, 0, over.width, over.height);
  const trace = j => { c.beginPath(); D.ages.forEach((a, i) => { const [x, y] = P(BND[i][j], a); i ? c.lineTo(x, y) : c.moveTo(x, y); }); };
  CONTOUR = null; hachures(c, P, dpr);
  if (state.dlines) for (const j of [1, 2, 3, 4, 5]) {
    trace(j); c.setLineDash([]); c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 2.6 * dpr; c.stroke();
    c.setLineDash([3 * dpr, 3 * dpr]); c.strokeStyle = "rgba(29,34,48,.8)"; c.lineWidth = 1.1 * dpr; c.stroke(); c.setLineDash([]);
  }
  for (const j of [0, 6]) { trace(j); c.strokeStyle = "rgba(29,34,48,.55)"; c.lineWidth = 1.1 * dpr; c.stroke(); }
  c.setLineDash([5 * dpr, 4 * dpr]); c.strokeStyle = "rgba(29,34,48,.45)"; c.lineWidth = 1 * dpr;   // frontières des générations
  for (const g of GENS.slice(1)) { const [, y] = P(0, g.max + .5); c.beginPath(); c.moveTo(0, y); c.lineTo(over.width, y); c.stroke(); }
  c.setLineDash([]);
  if (CONTOUR) CONTOUR();   // contour des zones d'incertitude au-dessus des lignes de diplôme et de génération
  if (state.dlines && !etroit) {                       // nom de chaque couloir, les six sur une même diagonale
    c.font = `500 ${10.5 * ech * dpr}px ${getComputedStyle(document.body).fontFamily}`; c.textAlign = "center"; c.textBaseline = "middle";
    // la diagonale relie le milieu des deux couloirs extrêmes, pris là où ils sont le plus larges ; chaque autre
    // étiquette va à l'âge où le milieu de son couloir passe au plus près de cette droite
    const dansAges = i => D.ages[i] >= 24 && D.ages[i] <= 88, milieu = (i, d) => (BND[i][d] + BND[i][d + 1]) / 2;
    const plusLarge = d => { let ia = 0, best = -1; for (let i = 0; i < NA; i++) if (dansAges(i)) { const wd = BND[i][d + 1] - BND[i][d]; if (wd > best) { best = wd; ia = i; } } return ia; };
    const iA = plusLarge(0), iB = plusLarge(5), aA = D.ages[iA], aB = D.ages[iB], xA = milieu(iA, 0), xB = milieu(iB, 5);
    const droite = a => xA + (xB - xA) * (a - aA) / (aB - aA);
    D.diplomes.forEach((nm, d) => {
      let ia = 0, best = Infinity;
      for (let i = 0; i < NA; i++) if (dansAges(i)) { const e = Math.abs(milieu(i, d) - droite(D.ages[i])); if (e < best) { best = e; ia = i; } }
      const [xa, y] = P(BND[ia][d], D.ages[ia]), [xb] = P(BND[ia][d + 1], D.ages[ia]);
      const x = (xa + xb) / 2, w = c.measureText(nm).width + 10 * dpr, h = 16 * dpr;
      c.fillStyle = "rgba(255,255,255,.9)"; c.strokeStyle = "rgba(29,34,48,.5)"; c.lineWidth = 1 * dpr;
      c.beginPath(); c.roundRect ? c.roundRect(x - w / 2, y - h / 2, w, h, 3 * dpr) : c.rect(x - w / 2, y - h / 2, w, h); c.fill(); c.stroke();
      c.fillStyle = "#1d2230"; c.fillText(nm, x, y + .5 * dpr);
    });
  }
}

// ---------- axes
function axes() {
  $("yax").innerHTML = ""; $("xax").innerHTML = "";
  for (const a of [20, 30, 40, 50, 60, 70, 80, 90, 100]) { const s = document.createElement("span"); s.textContent = a; s.style.top = ((AGE1 - a) / (AGE1 - AGE0) * 100) + "%"; $("yax").appendChild(s); }
  const pas = $("map").getBoundingClientRect().width < 430 ? 400e3 : 200e3;
  for (let v = -800e3; v <= 800e3; v += pas) { if (v < X0 || v > X1) continue; const s = document.createElement("span"); s.textContent = v === 0 ? "0" : Math.abs(v / 1000) + " k"; s.style.left = ((v - X0) / (X1 - X0) * 100) + "%"; $("xax").appendChild(s); }
}

// ---------- légende
function legende() {
  const box = $("chips"); box.innerHTML = "";
  const exprimes = H_.cands.reduce((s, c, k) => estExprime(c) ? s + H_.TOT[k] : s, 0);
  H_.cands.forEach((cand, k) => {
    const lab = document.createElement("label"); lab.className = "chip" + (state.shown[cand] ? "" : " off");
    const pct = !estExprime(cand) ? fmtP(H_.TOT[k] / D.total) + " des ins." : `${fmtP(H_.TOT[k] / exprimes)} · ${fmtP(H_.TOT[k] / D.total)} des ins.`;
    lab.innerHTML = `<input type="checkbox" ${state.shown[cand] ? "checked" : ""}><span class="sw" style="background:${COULEURS[cand]}"></span><span class="nm">${cand}</span><small>${fmtM(H_.TOT[k])} M</small><small>${pct}</small>`;
    lab.querySelector("input").addEventListener("change", e => { state.shown[cand] = e.target.checked; lab.classList.toggle("off", !e.target.checked); peindre(); majCumul(); });
    box.appendChild(lab);
  });
}

// ---------- générations
// L'âge de la pyramide est l'âge révolu au 1er janvier 2026 (répertoire électoral ; recensement vieilli de 4 ans),
// soit 2025 − année de naissance : les nés en 1946 ont 79 ans, les nés en 2007 en ont 18 (ceux de 2008 ne sont
// pas encore inscrits). Le recensement mêle cinq années de collecte : les bornes restent floues d'un an ou deux.
const GENS = [
  { nom: "Silencieuse", lettre: "S", ans: "avant 1946", min: 80, max: 100, coul: "#9a7442" },
  { nom: "Baby-boomers", lettre: "BB", ans: "1946-64", min: 61, max: 79, coul: "#4a7fd6" },
  { nom: "Génération X", lettre: "X", ans: "1965-80", min: 45, max: 60, coul: "#1fa58f" },
  { nom: "Millennials", lettre: "Y", ans: "1981-96", min: 29, max: 44, coul: "#e8842c" },
  { nom: "Génération Z", lettre: "Z", ans: "1997-2007", min: 18, max: 28, coul: "#e8457f" },
];
function generations() {
  const box = $("gens"); box.innerHTML = "";
  for (const g of GENS) {
    let ins = 0; const v = new Float64Array(H_.cands.length);
    D.ages.forEach((a, i) => { if (a < g.min || a > g.max) return; for (let d = 0; d < ND; d++) { ins += D.inscrits[i][d]; H_.cands.forEach((_, k) => v[k] += H_.SH[k][i * ND + d] * D.inscrits[i][d]); } });
    const ia = H_.cands.indexOf("Abstention"), expr = H_.cands.reduce((s, c, k) => estExprime(c) ? s + v[k] : s, 0);
    const tops = [...v.keys()].filter(k => estExprime(H_.cands[k])).sort((a, b) => v[b] - v[a]).slice(0, 2)
      .map(k => `${H_.cands[k].split(" ").slice(1).join(" ")} ${Math.round(v[k] / expr * 100)} % <i>(${Math.round(v[k] / ins * 100)} % ins.)</i>`).join(", ");
    const b = document.createElement("button"); b.type = "button"; b.className = "gen";
    b.style.top = ((AGE1 - g.max - .5) / (AGE1 - AGE0) * 100) + "%";
    b.style.height = ((g.max - g.min + 1) / (AGE1 - AGE0) * 100) + "%";
    b.title = `Sélectionner : ${g.nom} (${g.ans})`;
    b.innerHTML = `<span class="bar" style="background:${g.coul}"></span><span class="lettre" style="color:${g.coul}">${g.lettre}</span><span class="txt"><b style="color:${g.coul}">${g.nom} <span class="yrs">· ${g.ans}</span></b><span class="tops">${tops}</span><span class="ab">abst. ${Math.round(v[ia] / ins * 100)} % · ${fmtM(ins)} M</span></span>`;
    b.addEventListener("click", () => selectionner([zone(g.min, g.max, 0, ND - 1)], `${g.nom} (${g.min}-${g.max === 100 ? "100+" : g.max} ans)`));
    g.el = b; box.appendChild(b);
  }
}

// ---------- sélection : lasso et zones toutes faites (coordonnées en données : [inscrits, âge])
let shapes = [], titreSel = "", cur = null;
function zone(aMin, aMax, dMin, dMax) {               // polygone qui suit les couloirs de diplôme
  const is = D.ages.map((a, i) => i).filter(i => D.ages[i] >= aMin && D.ages[i] <= aMax);
  const g = is.map(i => [BND[i][dMin], D.ages[i]]), dr = is.map(i => [BND[i][dMax + 1], D.ages[i]]);
  const lo = [[BND[is[0]][dMin], aMin - .5], [BND[is[0]][dMax + 1], aMin - .5]];
  const hi = [[BND[is.at(-1)][dMax + 1], aMax + .5], [BND[is.at(-1)][dMin], aMax + .5]];
  const poly = [lo[0], lo[1], ...dr, hi[0], hi[1], ...g.reverse()];
  poly.cases = { aMin, aMax, dMin, dMax };             // zone exacte en âges × diplômes : calculer() somme ses cases
  return poly;
}
const TOUT = "Tous les inscrits";
function selectionner(polys, titre) { shapes = polys; titreSel = titre; $("toutsel").checked = titre === TOUT; GENS.forEach(g => g.el && g.el.classList.toggle("on", titre.startsWith(g.nom))); dessinerSel(); calculer(); }

const draw = $("draw"); let dctx, dw, dh;
const versDonnees = (px, py) => [X0 + px / dw * (X1 - X0), AGE1 - py / dh * (AGE1 - AGE0)];
const versPx = (x, a) => [(x - X0) / (X1 - X0) * dw, (AGE1 - a) / (AGE1 - AGE0) * dh];
function redim() { const r = draw.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; draw.width = Math.round(r.width * dpr); draw.height = Math.round(r.height * dpr); dw = r.width; dh = r.height; dctx = draw.getContext("2d"); dctx.setTransform(dpr, 0, 0, dpr, 0, 0); dessinerSel(); }
function chemin(pts) { dctx.beginPath(); pts.forEach((p, i) => { const [x, y] = versPx(p[0], p[1]); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y); }); }
function dessinerSel() {
  if (!dctx) return; dctx.clearRect(0, 0, dw, dh);
  if (shapes.length) {                                 // voile gris sur la partie de la pyramide hors sélection
    dctx.save();
    dctx.beginPath();                                  // contour de la pyramide : le voile ne déborde pas sur le fond
    D.ages.forEach((a, i) => { const [x, y] = versPx(BND[i][0], a); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y); });
    for (let i = NA - 1; i >= 0; i--) { const [x, y] = versPx(BND[i][6], D.ages[i]); dctx.lineTo(x, y); }
    dctx.closePath(); dctx.clip();
    dctx.fillStyle = "rgba(150,148,142,.5)"; dctx.fillRect(0, 0, dw, dh);
    dctx.globalCompositeOperation = "destination-out"; dctx.fillStyle = "#000";
    for (const s of shapes) { chemin(s); dctx.closePath(); dctx.fill(); }   // on découpe les zones sélectionnées
    dctx.restore();
  }
  for (const s of shapes) { chemin(s); dctx.closePath(); dctx.lineWidth = 4; dctx.strokeStyle = "rgba(255,255,255,.9)"; dctx.stroke(); dctx.setLineDash([7, 5]); dctx.lineWidth = 2; dctx.strokeStyle = "#1d2230"; dctx.stroke(); dctx.setLineDash([]); }
  if (cur && cur.length > 1) { chemin(cur); dctx.lineWidth = 2.2; dctx.strokeStyle = "#e0115f"; dctx.stroke(); }
}
const pos = e => { const r = draw.getBoundingClientRect(); return versDonnees(e.clientX - r.left, e.clientY - r.top); };
draw.addEventListener("pointerdown", e => { draw.setPointerCapture(e.pointerId); cur = [pos(e)]; });
draw.addEventListener("pointermove", e => {
  if (!cur) return;
  const p = pos(e), l = cur[cur.length - 1];
  if (Math.hypot((p[0] - l[0]) / (X1 - X0), (p[1] - l[1]) / (AGE1 - AGE0)) > .003) { cur.push(p); dessinerSel(); }
});
draw.addEventListener("pointerup", e => {
  if (!cur) return;
  if (cur.length > 4) {
    const ajout = $("add").checked && shapes.length;
    selectionner(ajout ? [...shapes, cur] : [cur], ajout ? `${shapes.length + 1} formes` : "Votre zone");
  }
  cur = null; dessinerSel();
});
draw.addEventListener("pointercancel", () => { cur = null; dessinerSel(); });

const off = document.createElement("canvas"); off.width = W; off.height = H;
const octx = off.getContext("2d", { willReadFrequently: true });
function calculer() {
  $("seltitle").textContent = shapes.length ? "Sélection · " + titreSel : "Sélection";
  if (!shapes.length) { $("sel").innerHTML = '<div class="empty">Tracez un contour sur la pyramide, ou sélectionnez une génération, pour afficher la composition de la zone.</div>'; return; }
  // part de chaque case dans la sélection : 1 pour les cases d'une zone toute faite (générations, groupes,
  // tous les inscrits), part de ses pixels couverts pour un lasso
  const frac = new Float64Array(NA * ND), lassos = shapes.filter(s => !s.cases);
  if (lassos.length) {
    octx.clearRect(0, 0, W, H); octx.fillStyle = "#000";
    for (const s of lassos) { octx.beginPath(); s.forEach((p, i) => { const x = (p[0] - X0) / (X1 - X0) * W, y = (AGE1 - p[1]) / (AGE1 - AGE0) * H; i ? octx.lineTo(x, y) : octx.moveTo(x, y); }); octx.closePath(); octx.fill(); }
    const px = octx.getImageData(0, 0, W, H).data;
    for (const i of INS) if (px[4 * i + 3] >= 128) frac[CODE[i]]++;
    for (let c = 0; c < NA * ND; c++) if (frac[c]) frac[c] /= PIXCASE[c];
  }
  for (const { cases: z } of shapes.filter(s => s.cases))
    for (let i = 0; i < NA; i++) if (D.ages[i] >= z.aMin && D.ages[i] <= z.aMax) for (let d = z.dMin; d <= z.dMax; d++) frac[i * ND + d] = 1;
  if (!frac.some(v => v > 0)) { $("sel").innerHTML = '<div class="empty">Le contour tracé ne recouvre aucune partie de la pyramide.</div>'; return; }
  // chiffres issus du modèle (pas des taches) : part de chaque case dans la sélection × ses inscrits
  const K = H_.cands.length, A = new Float64Array(K);
  let insZone = 0;
  for (let c = 0; c < NA * ND; c++) if (frac[c]) {
    const ins = frac[c] * D.inscrits[Math.floor(c / ND)][c % ND];
    insZone += ins; for (let k = 0; k < K; k++) A[k] += ins * H_.SH[k][c];
  }
  const ex = H_.cands.map(estExprime), exprZ = A.reduce((s, v, k) => ex[k] ? s + v : s, 0);
  // fourchette à 90 % du score parmi les exprimés : moyenne des bornes des zones (tranche d'âge × diplôme) touchées,
  // pondérée par leurs exprimés dans la sélection ; cela suppose que les erreurs vont dans le même sens d'une zone à
  // l'autre, donc une fourchette plutôt large que trop étroite
  const fourchette = {};
  const HF = FOURCH && FOURCH.hypotheses[state.hyp];
  if (HF) {
    const za = D.ages.map(a => FOURCH.zones_age.findIndex(([lo, hi]) => a >= lo && a <= hi)), wz = new Float64Array(FOURCH.zones_age.length * ND);
    for (let c = 0; c < NA * ND; c++) if (frac[c]) {
      let e = 0; for (let k = 0; k < K; k++) if (ex[k]) e += H_.SH[k][c];
      wz[za[Math.floor(c / ND)] * ND + c % ND] += frac[c] * D.inscrits[Math.floor(c / ND)][c % ND] * e;
    }
    const tw = wz.reduce((a, v) => a + v, 0);
    HF.candidats.forEach((c, j) => {
      let lo = 0, hi = 0; for (let z = 0; z < wz.length; z++) if (wz[z]) { lo += wz[z] * HF.bas[j][z]; hi += wz[z] * HF.haut[j][z]; }
      fourchette[c] = [lo / tw, hi / tw];
    });
  }
  // nombre d'électeurs : en millions au-delà du million, arrondi au millier en dessous
  const fmtN = v => v >= 1e6 ? `${fmtM(v)} M` : v >= 1000 ? (Math.round(v / 1000) * 1000).toLocaleString("fr-FR") : "moins de 1 000";
  const fmtF = v => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: v < .1 ? 1 : 0 });
  // abstention, blancs et nuls : en % des inscrits seulement
  const lignes = H_.cands.map((c, k) => ({ c, k, part: A[k] / H_.TOT[k], score: !ex[k] ? A[k] / insZone : A[k] / exprZ,
    scoreIns: !ex[k] ? null : A[k] / insZone }));
  lignes.sort((x, y) => A[y.k] - A[x.k]);   // classement sur le nombre d'inscrits de la zone : l'abstention y est un « candidat » comme les autres
  const avecIns = (v, vi, f) => vi === null ? fmtP(v) : `${fmtP(vi)}<small class="ins">${fmtP(v)} exp.${f ? ` (${fmtF(f[0])}-${fmtF(f[1])})` : ""}</small>`;   // % des inscrits en gros, % des exprimés en petit
  // barre sous chaque nom : part de l'électorat du candidat située dans la zone, sur une échelle de 0 à 100 %
  let h = `<div class="kpi"><div><b>${fmtP(insZone / D.total)}</b><small>des inscrits</small></div><div><b>${fmtM(insZone)} M</b><small>d'inscrits</small></div></div>`;
  h += `<table class="res"><thead><tr><th>Candidat</th><th>Score dans la zone<br><small>% des inscrits</small></th><th>Part de son électorat</th><th>Électeurs<br><small>dans la zone</small></th></tr></thead><tbody>`;
  for (const l of lignes) h += `<tr class="${state.shown[l.c] ? "" : "dim"}"><td><div class="nm2"><span class="sq" style="background:${COULEURS[l.c]}"></span>${nom(l.c)}</div><div class="barre"><i style="width:${(l.part * 100).toFixed(1)}%;background:${COULEURS[l.c]}"></i></div></td><td><b>${avecIns(l.score, l.scoreIns, fourchette[l.c])}</b></td><td>${fmtP(l.part)}</td><td>${fmtN(A[l.k])}</td></tr>`;
  h += `</tbody></table>`;
  $("sel").innerHTML = h;
}

// ---------- pilotage
let job = 0;
function lancer(nouveauBruit) {
  const my = ++job; $("status").textContent = "Calcul…";
  setTimeout(async () => { if (my !== job) return; const t0 = performance.now();
    if (nouveauBruit) NOISE_KEY = "";
    await preparerBruit(H_.cands);                     // workers : la page reste libre pendant ce temps
    if (my !== job) return;                            // un autre calcul a été demandé entre-temps
    if (!(await attribuer(my))) return;
    legende(); generations(); peindre(); calculer();
    $("status").textContent = `Prêt (${Math.round(performance.now() - t0)} ms)`; }, 30);
}
const tf = v => (+v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// fourchettes à 90 % par zone (scripts/incertitude.py) : seulement si elles correspondent aux données affichées
let FOURCH = null;
chargerJSON("data.json").then(data => {
  chargerJSON("fourchettes.json").then(f => { if (f.empreinte === data.empreinte) { FOURCH = f; remplirIncertitude(); if (shapes.length) calculer(); if (LAB) superposer(); } }, () => {});
  D = data; lisser(); D.total = D.inscrits.flat().reduce((a, b) => a + b, 0);
  if (!VUE) try { const z = localStorage.getItem("zoom"); if (z) $("zoom").value = z; } catch (e) {}
  state.zoom = $("zoom").value / 100; $("zoom_o").textContent = $("zoom").value + " %";
  geometrie(); axes();
  const sel = $("hyp"); remplirHypotheses(sel);
  if (ADR.get("hyp") in D.hypotheses) sel.value = ADR.get("hyp");
  // état laissé au dernier passage sur la page (etatPage, common.js) ; jamais dans une vue intégrée
  const MEM = VUE ? null : etatPage("pyramide");
  if (MEM) {
    Object.assign(state.shown, MEM.shown || {});
    for (const g in state.part) if (MEM.part && typeof MEM.part[g] === "number") { state.part[g] = MEM.part[g]; $(`part_${g}`).value = MEM.part[g]; }
    if (MEM.seed) state.seed = MEM.seed;
    if (typeof MEM.incert === "string") INCERT_VOULU = MEM.incert;
  }
  // notice du sondage repliée ; on garde son état (ouverte ou non) quand on change d'hypothèse
  const note = () => { const v = D.hypotheses[sel.value], ouverte = !!$("sondage").querySelector("details[open]");
    $("sondage").innerHTML = `<b>${v.groupe}</b><details class="notice"${ouverte ? " open" : ""}><summary>Notice du sondage</summary><p>${v.note}</p></details>`; };
  state.hyp = sel.value; chargerHypothese(state.hyp); note();
  if (ADR.get("montrer")) { const m = ADR.get("montrer").split(","); for (const c of H_.cands) state.shown[c] = m.includes(c); }
  sel.addEventListener("change", note);
  $("temp_o").textContent = tf(state.T); $("grain_o").textContent = state.grain;
  sel.addEventListener("change", () => { state.hyp = sel.value; chargerHypothese(state.hyp); remplirIncertitude(); lancer(false); });
  $("temp").addEventListener("input", e => { state.T = +e.target.value; $("temp_o").textContent = tf(state.T); majContraste(); });
  $("temp").addEventListener("change", () => lancer(false));
  $("grain").addEventListener("input", e => { state.grain = +e.target.value; $("grain_o").textContent = state.grain; });
  $("grain").addEventListener("change", () => lancer(true));
  $("reseed").addEventListener("click", () => { state.seed++; lancer(true); });
  const curseur = (id, cle, fmt, nouveauBruit) => {
    const o = $(id + "_o"), maj = () => o.textContent = fmt(state[cle]);
    state[cle] = +$(id).value; maj();
    $(id).addEventListener("input", e => { state[cle] = +e.target.value; maj(); });
    $(id).addEventListener("change", () => lancer(nouveauBruit));
  };
  curseur("grav", "grav", v => v ? tf(v) : "aucune", false);
  $("grav").addEventListener("input", majContraste);
  curseur("portee", "portee", v => v + " px", false);
  curseur("etir", "etir", v => v === 1 ? "rondes" : "× " + tf(v), true);
  // participation : chaque curseur recalcule les parts de l'hypothèse (même tirage de taches)
  for (const g of ["global", "jeunes", "ages", "peu", "sup"]) {
    $(`part_${g}`).addEventListener("input", e => { state.part[g] = +e.target.value; chargerHypothese(state.hyp); });
    $(`part_${g}`).addEventListener("change", () => lancer(false));
  }
  $("part_reset").addEventListener("click", () => {
    for (const g of ["global", "jeunes", "ages", "peu", "sup"]) { state.part[g] = 0; $(`part_${g}`).value = 0; }
    chargerHypothese(state.hyp); lancer(false);
  });
  // préréglages de style : chacun fixe les curseurs des taches ; toucher un curseur repasse en « Personnalisé »
  const STYLES = {
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
  const selStyle = $("style");
  selStyle.innerHTML = Object.keys(STYLES).map(n => `<option>${n}</option>`).join("") + `<option value="" disabled>Personnalisé</option>`;
  let applique = false;
  selStyle.addEventListener("change", () => {
    const st = STYLES[selStyle.value]; if (!st) return;
    applique = true;
    for (const id of ["temp", "grain", "grav", "portee", "etir"]) { $(id).value = st[id]; $(id).dispatchEvent(new Event("input")); }
    state.liseres = st.liseres;                        // le liseré suit le style (plus de case à cocher)
    applique = false;
    lancer(true);
    if (!VUE) try { localStorage.setItem("prereglage2", selStyle.value); } catch (e) {}   // une vue intégrée ne touche pas au choix de la page d'accueil
  });
  for (const id of ["temp", "grain", "grav", "portee", "etir"])
    $(id).addEventListener("input", () => { if (!applique) selStyle.value = ""; });
  // à l'ouverture : le dernier préréglage choisi dans ce navigateur, sinon « Lisible, proche des données »
  // (T = 0,7 : la loupe ne déplace plus que 7 % environ de la surface des zones). Nouvelle clé « prereglage2 » le
  // 19/11/2026 : tout le monde repart une fois sur ce réglage, même après avoir choisi un autre préréglage avant.
  let depart = "Lisible, proche des données";
  if (!VUE) try { const st = localStorage.getItem("prereglage2"); if (st && STYLES[st]) depart = st; } catch (e) {}
  selStyle.value = depart; selStyle.dispatchEvent(new Event("change"));
  if (MEM && MEM.curseurs) {                           // réglages personnalisés : remis par-dessus le préréglage
    for (const id of ["temp", "grain", "grav", "portee", "etir"]) if (id in MEM.curseurs) { $(id).value = MEM.curseurs[id]; $(id).dispatchEvent(new Event("input")); }
    if ("liseres" in MEM.curseurs) { state.liseres = MEM.curseurs.liseres; selStyle.value = ""; }
  }
  if (MEM) { if (typeof MEM.dlines === "boolean") $("dlines").checked = state.dlines = MEM.dlines; if (typeof MEM.ajout === "boolean") $("add").checked = MEM.ajout; }
  $("dlines").addEventListener("change", e => { state.dlines = e.target.checked; superposer(); });
  remplirIncertitude();
  $("incert").addEventListener("change", () => { INCERT_VOULU = null; superposer(); });
  $("all").addEventListener("click", () => { H_.cands.forEach(c => state.shown[c] = true); legende(); peindre(); calculer(); majCumul(); });
  $("none").addEventListener("click", () => { H_.cands.forEach(c => state.shown[c] = false); legende(); peindre(); calculer(); majCumul(); });
  $("clear").addEventListener("click", () => selectionner([], ""));
  $("toutsel").addEventListener("change", e => selectionner(e.target.checked ? [zone(18, 100, 0, ND - 1)] : [], e.target.checked ? TOUT : ""));
  $("zoom").addEventListener("input", e => { $("zoom_o").textContent = e.target.value + " %"; });
  $("zoom").addEventListener("change", e => {
    state.zoom = e.target.value / 100; try { localStorage.setItem("zoom", e.target.value); } catch (err) {}
    geometrie(); axes(); chargerHypothese(state.hyp); redim(); lancer(true);   // nouveau cadrage : on recalcule tout
  });
  $("undo").addEventListener("click", () => selectionner(shapes.slice(0, -1), shapes.length > 2 ? `${shapes.length - 1} formes` : shapes.length === 2 ? "Votre zone" : ""));
  new ResizeObserver(() => { axes(); if (LAB) superposer(); redim(); }).observe(draw);
  shapes = [zone(18, 100, 0, ND - 1)]; titreSel = TOUT; $("toutsel").checked = true;   // au départ : tous les inscrits sélectionnés
  if (MEM && Array.isArray(MEM.formes)) {             // sélection du dernier passage : zones âge × diplôme ou tracés au lasso (coordonnées des données)
    shapes = MEM.formes.map(f => f.cases ? zone(f.cases.aMin, f.cases.aMax, f.cases.dMin, f.cases.dMax) : f);
    titreSel = MEM.titre || ""; $("toutsel").checked = titreSel === TOUT;
    GENS.forEach(g => g.el && g.el.classList.toggle("on", !!titreSel && titreSel.startsWith(g.nom)));
  }
  if (!VUE) garderEtat("pyramide", () => {
    const st = selStyle.value === "" ? { liseres: state.liseres } : null;
    if (st) for (const id of ["temp", "grain", "grav", "portee", "etir"]) st[id] = +$(id).value;
    return { shown: state.shown, part: state.part, seed: state.seed, curseurs: st, dlines: state.dlines, ajout: $("add").checked,
             incert: INCERT_VOULU ?? $("incert").value, formes: shapes.map(s => s.cases ? { cases: s.cases } : s), titre: titreSel };
  });
  lancer(true);
});
