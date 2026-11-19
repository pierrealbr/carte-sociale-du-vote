// Commun aux pages : couleurs, formats, lissage des inscrits

// candidats : registre unique candidats.json, recopié dans site/registre.js (REGISTRE) par scripts/04_export_site.py
const COULEURS = Object.fromEntries([...REGISTRE.candidats, ...REGISTRE.non_candidats].filter(c => c.couleur).map(c => [c.nom, c.couleur]));
// blocs politiques : petits candidats regroupés par camp (pyramides.js)
const BLOCS = REGISTRE.blocs.map(b => [b, REGISTRE.candidats.filter(c => c.couleur && c.bloc === b).map(c => c.nom)]);
// ni l'abstention ni les blancs et nuls ne sont des suffrages exprimés
const NON_EXPRIMES = new Set(["Abstention", "Blancs et nuls"]);
const estExprime = c => !NON_EXPRIMES.has(c);
const COURTS = Object.fromEntries(REGISTRE.candidats.filter(c => c.court).map(c => [c.nom, c.court]));
const PAPER = [247, 246, 242];
const AGE_MIN = 17.5, AGE_MAX = 100.5;              // bords de la pyramide (18 ans … 100 ans et +)

// ---------- chargement des fichiers de données (relus à chaque visite, sans cache périmé)
const chargerJSON = nom => fetch(nom, { cache: "no-cache" }).then(r => r.json());

const $ = id => document.getElementById(id);
const fmtM = v => (v / 1e6).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtP = v => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";
const nom = c => COURTS[c] || c;
// « de » devant un nom, élidé devant une voyelle : « de Le Pen », « d'Attal », « d'Eric Zemmour »
const deNom = n => (/^[aeiouyàâéèêîô]/i.test(n) ? "d'" : "de ") + n;


// ---------- lissage des effectifs d'un âge à l'autre (noyau gaussien), total de chaque diplôme conservé
// Les effectifs par année d'âge du recensement sont un peu irréguliers ; on garde les grandes formes
// (baby-boom, creux de la guerre) mais on adoucit les dents de scie. Le lissage ne sert qu'au dessin
// (D.inscritsLisses) : voix, participation et sélections se calculent sur les effectifs bruts (D.inscrits).
// Avant 26 ans, la composition change très vite d'une année à l'autre (bac à 18 ans, licence vers 21 ans,
// master vers 23 ans) : un lissage large y donnerait aux diplômés du supérieur de 18 ans plusieurs fois
// leur place. L'écart-type part donc de 0,4 an à 18 ans et monte en ligne droite jusqu'à 1,6 an à 26 ans.
const LISSAGE = { min: 0.4, max: 1.6, ageMin: 18, ageMax: 26 };   // écart-type, en années
const sigmaLissage = a => LISSAGE.min + (LISSAGE.max - LISSAGE.min) * Math.min(1, Math.max(0, (a - LISSAGE.ageMin) / (LISSAGE.ageMax - LISSAGE.ageMin)));
function lisser() {
  const n = D.ages.length, nd = D.diplomes.length, src = D.inscrits.map(r => r.slice()), out = src.map(r => r.map(() => 0));
  for (let d = 0; d < nd; d++) {
    let avant = 0, apres = 0;
    for (let i = 0; i < n; i++) {
      const sigma = sigmaLissage(D.ages[i]), R = Math.ceil(3 * sigma);
      let s = 0, w = 0;
      for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { const k = Math.exp(-((i - j) ** 2) / (2 * sigma * sigma)); s += k * src[j][d]; w += k; }
      out[i][d] = s / w; avant += src[i][d]; apres += out[i][d];
    }
    for (let i = 0; i < n; i++) out[i][d] *= avant / apres;
  }
  D.inscritsLisses = out.map(r => r.map(Math.round));   // pour le dessin seulement ; D.inscrits reste brut pour les chiffres
}

// ---------- partage T : ce que le dessin fait à la composition de chaque zone (audit du 18 novembre 2026, M1)
// Un pixel prend la couleur qui maximise ln s_k + b_k + T × g_k, g de loi de Gumbel : la surface attendue de chaque
// couleur dans une case vaut softmax((ln s_k + b_k) / T). À T = 1, c'est s_k ; sous 1, le premier de la case grossit.
// b est le même calage que sur le dessin (chaque candidat garde sa surface totale), trouvé ici sans pixel par
// b_k += T × ln(cible_k / attendu_k), pondéré par les inscrits. Zone : tranche d'âge × diplôme (36 zones).
// SH : un tableau à plat [âge × ND + diplôme] par candidat ; b0 : départ (le b précédent, pour aller vite).
// opts.poids : poids de chaque case (par défaut les inscrits ; le dessin passe le nombre de pixels de chaque case) ;
// opts.cible : surfaces visées (par défaut la part de chaque candidat). Le dessin s'en sert pour partir de b
// calculé (app.js, attribuer), au lieu de le chercher en tâtonnant sur les pixels.
// Renvoie la part des inscrits dessinée d'une autre couleur que le modèle, zone par zone, et le détail.
const ZONES_AGE = REGISTRE.zones_age;   // scripts/commun.py, via site/registre.js
function partageT(SH, T, b0, opts = {}) {
  const K = SH.length, NA_ = D.ages.length, ND_ = D.diplomes.length, C = NA_ * ND_;
  const w = new Float64Array(C), zone = new Int16Array(C);
  for (let i = 0; i < NA_; i++) for (let d = 0; d < ND_; d++) {
    w[i * ND_ + d] = opts.poids ? opts.poids[i * ND_ + d] : D.inscrits[i][d];
    zone[i * ND_ + d] = ZONES_AGE.findIndex(([lo, hi]) => D.ages[i] >= lo && D.ages[i] <= hi) * ND_ + d;
  }
  const cible = new Float64Array(K), att = new Float64Array(K), E = new Float64Array(C * K), p = new Float64Array(K);
  for (let c = 0; c < C; c++) for (let k = 0; k < K; k++) cible[k] += w[c] * SH[k][c];
  const tot = cible.reduce((a, v) => a + v, 0); for (let k = 0; k < K; k++) cible[k] = opts.cible ? opts.cible[k] : cible[k] / tot;
  const b = b0 && b0.length === K ? Float64Array.from(b0) : new Float64Array(K);
  const Tt = Math.max(.05, T);
  for (let it = 0; it < 300; it++) {
    att.fill(0);
    for (let c = 0; c < C; c++) {
      let m = -Infinity; for (let k = 0; k < K; k++) { p[k] = (Math.log(Math.max(SH[k][c], 1e-6)) + b[k]) / Tt; if (p[k] > m) m = p[k]; }
      let s = 0; for (let k = 0; k < K; k++) { p[k] = Math.exp(p[k] - m); s += p[k]; }
      for (let k = 0; k < K; k++) { E[c * K + k] = p[k] / s; att[k] += w[c] * p[k] / s; }
    }
    let pire = 0; for (let k = 0; k < K; k++) pire = Math.max(pire, Math.abs(att[k] / tot - cible[k]));
    if (pire < 1e-4) break;
    for (let k = 0; k < K; k++) b[k] += Tt * Math.log(cible[k] / Math.max(att[k] / tot, 1e-12));
  }
  // par zone : surface attendue et part du modèle, en inscrits
  const NZ = ZONES_AGE.length * ND_, ze = Array.from({ length: NZ }, () => new Float64Array(K)), zm = Array.from({ length: NZ }, () => new Float64Array(K)), zn = new Float64Array(NZ);
  for (let c = 0; c < C; c++) { const z = zone[c]; zn[z] += w[c]; for (let k = 0; k < K; k++) { ze[z][k] += w[c] * E[c * K + k]; zm[z][k] += w[c] * SH[k][c]; } }
  let dep = 0; const depZ = new Float64Array(NZ);                  // depZ : part de chaque zone dessinée d'une autre couleur
  for (let z = 0; z < NZ; z++) for (let k = 0; k < K; k++) { const e = Math.max(0, ze[z][k] - zm[z][k]); dep += e; depZ[z] += zn[z] ? e / zn[z] : 0; }
  // part dessinée et part du modèle d'un candidat dans une zone (tranche d'âge zi × diplôme d)
  const zonePart = (k, zi, d) => { const z = zi * ND_ + d; return [ze[z][k] / zn[z], zm[z][k] / zn[z]]; };
  return { deplace: dep / tot, deplaceZones: depZ, b, zonePart };
}

// ---------- fiabilité zone par zone (page Limites et hachures de la pyramide) : mêmes zones que les fourchettes
// (scripts/incertitude.py, ZONES_AGE × diplôme). Niveau d'une zone pour un candidat : largeur de sa fourchette à 90 %
// rapportée à son score parmi les exprimés ; sous 15 % : solide (0), 15 à 35 % : moyenne (1), au-delà : large (2).
const SEUILS_FIABILITE = [.15, .35];
const niveauFiabilite = r => r < SEUILS_FIABILITE[0] ? 0 : r < SEUILS_FIABILITE[1] ? 1 : 2;
// voix exprimées par zone et par candidat (parts de data.json, avant tout réglage de participation)
function scoresZonesExprimes(H) {
  const P = H.parts, c = H.candidats, ex = c.map(n => estExprime(n)), NA_ = D.ages.length, ND_ = D.diplomes.length;
  const za = D.ages.map(a => ZONES_AGE.findIndex(([lo, hi]) => a >= lo && a <= hi));
  const V = c.map(() => new Float64Array(ZONES_AGE.length * ND_)), E = new Float64Array(ZONES_AGE.length * ND_);
  for (let i = 0; i < NA_; i++) for (let d = 0; d < ND_; d++) {
    const z = za[i] * ND_ + d, n = D.inscrits[i][d];
    c.forEach((_, k) => { if (ex[k]) { V[k][z] += P[k][i][d] * n; E[z] += P[k][i][d] * n; } });
  }
  return { V, E };
}
// niveau de chaque zone pour un candidat : tableau [zone = tranche × ND + diplôme], ou null sans fourchette
function niveauxIncertitude(H, HF, cand) {
  const j = HF ? HF.candidats.indexOf(cand) : -1, k = H.candidats.indexOf(cand);
  if (j < 0 || k < 0) return null;
  const { V, E } = scoresZonesExprimes(H);
  return Int8Array.from(E, (e, z) => niveauFiabilite((HF.haut[j][z] - HF.bas[j][z]) / Math.max(V[k][z] / e, 1e-4)));
}

// incertitude des chiffres du modèle dans chaque zone, pour les candidats affichés (sans rien du dessin) : somme des
// largeurs de leurs fourchettes à 90 % rapportée à la somme de leurs scores dans la zone, soit l'erreur relative moyenne
// de leurs chiffres, pondérée par leur poids. Avec un seul candidat, c'est exactement niveauxIncertitude (mêmes seuils).
function niveauxModeleCumules(H, HF, affiches) {
  if (!HF) return null;
  const { V, E } = scoresZonesExprimes(H);
  const paires = HF.candidats.map((c, j) => [j, H.candidats.indexOf(c)]).filter(([j, k]) => k >= 0 && affiches.has(HF.candidats[j]));
  if (!paires.length) return null;
  return Int8Array.from(E, (e, z) => {
    let larg = 0, score = 0;
    for (const [j, k] of paires) { larg += HF.haut[j][z] - HF.bas[j][z]; score += V[k][z] / e; }
    return niveauFiabilite(larg / Math.max(score, 1e-4));
  });
}

// précision de ce qu'on voit dans chaque zone, pour les candidats affichés : part de la surface de la zone qui pourrait
// avoir une autre couleur = hasard des sondages + effet loupe du partage des taches.
//   hasard : √(Σ (demi-largeur de la fourchette à 90 %)²) sur les candidats affichés. Avec tous les candidats, cette
//     combinaison retombe sur la mesure exacte des 100 tirages (melange90 de fourchettes.json) à 5 % près en médiane.
//   loupe : écart entre la surface dessinée et le modèle, les candidats masqués comptant comme une seule couleur
//     (½ (Σ_affichés |écart| + |Σ_affichés écart|)) ; loupeZone(z) le donne, null pour l'ignorer.
// Sous 5 % : précis (0) ; 5 à 10 % : moins (1) ; au-delà : peu fiable (2).
const SEUILS_CUMUL = [.05, .10];
function niveauxCumules(HF, affiches, loupeZone) {
  if (!HF) return null;
  const js = HF.candidats.map((c, j) => j).filter(j => affiches.has(HF.candidats[j]));
  return Int8Array.from(HF.bas[0], (_, z) => {
    let h2 = 0; for (const j of js) { const w = (HF.haut[j][z] - HF.bas[j][z]) / 2; h2 += w * w; }
    const v = Math.sqrt(h2) + (loupeZone ? loupeZone(z) : 0);
    return v < SEUILS_CUMUL[0] ? 0 : v < SEUILS_CUMUL[1] ? 1 : 2;
  });
}

// parts lissées d'un âge à l'autre (σ = 3 ans sur ±9 ans, pondéré par les inscrits du dessin) : les profils par
// tranche d'âge laissent de petites marches aux frontières de tranches. Sert au dessin des électorats (pyramides.js),
// aux petites pyramides de la page Limites et au graphique γ de la page Méthodes. sh : parts à plat, indice âge × ND + diplôme.
function lisserAge(sh) {
  const NA_ = D.ages.length, ND_ = D.diplomes.length, out = new Float64Array(NA_ * ND_), S = 3, R = 9;
  for (let i = 0; i < NA_; i++) for (let d = 0; d < ND_; d++) {
    let s = 0, q = 0;
    for (let j = Math.max(0, i - R); j <= Math.min(NA_ - 1, i + R); j++) { const g = Math.exp(-((i - j) ** 2) / (2 * S * S)) * D.inscritsLisses[j][d]; s += g * sh[j * ND_ + d]; q += g; }
    out[i * ND_ + d] = s / q;
  }
  return out;
}

// fonction d'erreur (approximation d'Abramowitz et Stegun, erreur < 1,5e-7)
// erf : taches.js (chargé par les pages qui en ont besoin, et par les workers)

// bornes des couloirs de diplôme à chaque âge (en inscrits), du bord gauche au bord droit :
// Sans diplôme, CAP-BEP, Bac | Bac+2, Bac+3/4, Bac+5
function bornes(ins) {
  return ins.map(r => { const g1 = -r[2], g2 = g1 - r[1], g3 = g2 - r[0], d1 = r[3], d2 = d1 + r[4], d3 = d2 + r[5]; return [g3, g2, g1, 0, d1, d2, d3]; });
}
// ---------- état d'une page (réglages, sélection) gardé le temps de la visite, dans cet onglet (sessionStorage) :
// on le retrouve en revenant sur la page. L'hypothèse, le modèle, le zoom et le préréglage restent en localStorage.
function etatPage(cle) { try { return JSON.parse(sessionStorage.getItem("etat:" + cle)); } catch (e) { return null; } }
function garderEtat(cle, lire) {   // écrit au départ de la page (lien, retour, rechargement)
  addEventListener("pagehide", () => { try { sessionStorage.setItem("etat:" + cle, JSON.stringify(lire())); } catch (e) {} });
}

function remplirHypotheses(sel) {
  const groupes = new Map();
  for (const [h, v] of Object.entries(D.hypotheses)) {
    if (!groupes.has(v.groupe)) { const g = document.createElement("optgroup"); g.label = v.groupe; sel.appendChild(g); groupes.set(v.groupe, g); }
    const o = document.createElement("option"); o.value = h; o.textContent = v.court; groupes.get(v.groupe).appendChild(o);
  }
  try { const h = localStorage.getItem("hyp"); if (h && h in D.hypotheses) sel.value = h; } catch (e) {}
  sel.addEventListener("change", () => { try { localStorage.setItem("hyp", sel.value); } catch (e) {} });
}

// ---------- participation réglable
// Les parts de chaque case sont en % des inscrits ; l'abstention vaut 1 − p. On décale p sur l'échelle logit :
//   logit p' = logit p + x_global + x_jeunes·[18-29 ans] + x_âgés·[65 ans et +] + x_peu·[sans diplôme, CAP-BEP]
//              + x_sup·[bac+2 et plus]
// Chaque curseur est donné en points de participation de son groupe, curseur seul : son décalage x est trouvé
// par dichotomie en laissant les autres à 0, puis les décalages s'additionnent. Les effets ne se contredisent donc
// jamais (monter un curseur fait toujours monter la participation) ; un groupe qui en recoupe un autre bouge
// simplement un peu plus ou un peu moins que son curseur. Le curseur global est en points de participation
// d'ensemble, appliqué après les autres. Dans chaque case, les votants
// gardent le même partage entre candidats : seul leur nombre change. Ordres de grandeur : d'une présidentielle à
// la suivante, la participation des 18-29 ou des 65 ans et plus s'est écartée de 1 à 4 points de ce que prévoyait
// la forme précédente (INSEE, 2002-2022).
const GROUPES_PART = {
  jeunes: (a, d) => a <= 29,
  ages: (a, d) => a >= 65,
  peu: (a, d) => d <= 1,
  sup: (a, d) => d >= 3,
};
function ajusterParticipation(h, r) {
  const ia = h.candidats.indexOf("Abstention"), NA_ = D.ages.length, ND_ = D.diplomes.length;
  const sig = x => 1 / (1 + Math.exp(-x));
  const L0 = [], W = [];
  for (let i = 0; i < NA_; i++) for (let d = 0; d < ND_; d++) {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, 1 - h.parts[ia][i][d]));
    L0.push(Math.log(p / (1 - p))); W.push(D.inscrits[i][d]);
  }
  const membre = Object.fromEntries(Object.entries(GROUPES_PART).map(([g, f]) => [g, L0.map((_, c) => f(D.ages[Math.floor(c / ND_)], c % ND_))]));
  const x = { jeunes: 0, ages: 0, peu: 0, sup: 0, global: 0 };
  const lp = c => L0[c] + x.global + (membre.jeunes[c] ? x.jeunes : 0) + (membre.ages[c] ? x.ages : 0) + (membre.peu[c] ? x.peu : 0) + (membre.sup[c] ? x.sup : 0);
  const taux = (sel) => { let s = 0, n = 0; for (let c = 0; c < L0.length; c++) if (!sel || sel[c]) { s += W[c] * sig(lp(c)); n += W[c]; } return s / n; };
  const caler = (cle, sel, cible) => { let lo = -6, hi = 6; for (let it = 0; it < 50; it++) { x[cle] = (lo + hi) / 2; if (taux(sel) > cible) hi = x[cle]; else lo = x[cle]; } };
  const base = { tout: taux(null) };
  for (const g of Object.keys(GROUPES_PART)) base[g] = taux(membre[g]);
  const seuls = {};                                      // décalage de chaque groupe, calé curseur seul
  for (const g of Object.keys(GROUPES_PART)) if (r[g]) {
    for (const k in x) x[k] = 0;
    caler(g, membre[g], base[g] + r[g] / 100);
    seuls[g] = x[g];
  }
  for (const k in x) x[k] = seuls[k] || 0;               // puis on les additionne
  if (r.global) { const avant = taux(null); caler("global", null, avant + r.global / 100); }
  const parts = h.parts.map(m => m.map(row => row.slice()));
  for (let c = 0; c < L0.length; c++) {
    const i = Math.floor(c / ND_), d = c % ND_, p0 = 1 - h.parts[ia][i][d], p1 = sig(lp(c));
    for (let k = 0; k < h.candidats.length; k++) parts[k][i][d] = k === ia ? 1 - p1 : h.parts[k][i][d] / Math.max(p0, 1e-9) * p1;
  }
  const res = { base: base.tout, nouvelle: taux(null) };
  // participation par âge et par diplôme, avant / après (pour les graphiques descriptifs)
  const moy = (filtre, avecX) => { let s = 0, n = 0; for (let c = 0; c < L0.length; c++) if (filtre(c)) { s += W[c] * sig(avecX ? lp(c) : L0[c]); n += W[c]; } return s / n; };
  res.age = D.ages.map((_, i) => moy(c => Math.floor(c / ND_) === i, false));
  res.ageNouv = D.ages.map((_, i) => moy(c => Math.floor(c / ND_) === i, true));
  res.dip = D.diplomes.map((_, d) => moy(c => c % ND_ === d, false));
  res.dipNouv = D.diplomes.map((_, d) => moy(c => c % ND_ === d, true));
  for (const g of Object.keys(GROUPES_PART)) res[g] = [base[g], taux(membre[g])];
  return { parts, participation: res };
}
