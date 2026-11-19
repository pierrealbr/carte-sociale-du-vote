// Page « Limites » : ce qui est solide ou fragile dans le modèle et dans le dessin.
// Données : data.json (04), fourchettes.json (scripts/incertitude.py), construction.json (06 : réglages, abstention 2022).
// Calculs communs : partageT (loupe du partage des taches), lisserAge (petites pyramides) dans common.js.

let D, F = null, C = null, NA, ND;
const NON_EXP = new Set(["Abstention", "Blancs et nuls"]);
const pct1 = v => (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const pts = v => (v * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ZLAB = ZONES_AGE.map(([lo, hi]) => [lo, hi, hi > 100 ? `${lo} ans et +` : `${lo}-${hi} ans`]);   // zones de common.js

const scoresZones = scoresZonesExprimes;                  // common.js
const classe = r => ["f1", "f2", "f3"][niveauFiabilite(r)];

function carte() {
  const nomH = $("f-hyp").value, H = D.hypotheses[nomH], cand = $("f-cand").value, k = H.candidats.indexOf(cand);
  const { V, E } = scoresZones(H), HF = F && F.hypotheses[nomH], j = HF ? HF.candidats.indexOf(cand) : -1;
  let h = `<thead><tr><th></th>${D.diplomes.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>`;
  for (let zi = ZLAB.length - 1; zi >= 0; zi--) {
    h += `<tr><th class="age">${ZLAB[zi][2]}</th>`;
    for (let d = 0; d < ND; d++) {
      const z = zi * ND + d, s = V[k][z] / E[z];
      if (j < 0) { h += `<td><b>${pct1(s)}</b></td>`; continue; }
      const lo = HF.bas[j][z], hi = HF.haut[j][z], r = (hi - lo) / Math.max(s, 1e-4);
      h += `<td class="${classe(r)}" title="Intervalle à 90 % : ${pct1(lo)} à ${pct1(hi)}"><b>${pct1(s)}</b><small>${pts(lo)} – ${pts(hi)}</small></td>`;
    }
    h += "</tr>";
  }
  $("carte-f").innerHTML = h + "</tbody>";
  $("carte-note").textContent = !F ? "Intervalles non disponibles (commande make incertitude) ; seuls les scores sont affichés."
    : j < 0 ? "Aucun intervalle n'est disponible pour ce candidat dans cette hypothèse."
    : "En gros caractères, le score parmi les suffrages exprimés dans la zone ; en petits caractères, l'intervalle à 90 %, en points. Les tranches les plus âgées figurent en haut.";
}

function tableCandidats() {
  const nomH = $("f-hyp").value, H = D.hypotheses[nomH], HF = F && F.hypotheses[nomH];
  if (!HF) { $("tab-cands").innerHTML = "<tbody><tr><td>Intervalles non disponibles (commande make incertitude).</td></tr></tbody>"; return; }
  const { V, E } = scoresZones(H), tot = E.reduce((a, v) => a + v, 0);
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const lignes = HF.candidats.map((c, j) => {
    const k = H.candidats.indexOf(c), nat = V[k].reduce((a, v) => a + v, 0) / tot;
    const larg = HF.haut[j].map((h, z) => h - HF.bas[j][z]), rel = larg.map((l, z) => l / Math.max(V[k][z] / E[z], 1e-4));
    return { c, nat, l: med(larg), r: med(rel) };
  }).sort((a, b) => b.nat - a.nat);
  const verdict = r => ['<span class="fiab f1">Solide</span>', '<span class="fiab f2">Moyen</span>', '<span class="fiab f3">Fragile</span>'][niveauFiabilite(r)];
  $("tab-cands").innerHTML = `<thead><tr><th>Candidat</th><th>Score national</th><th>Largeur médiane</th><th>Rapportée au score</th><th>Profil</th></tr></thead><tbody>`
    + lignes.map(l => `<tr><td>${nom(l.c)}</td><td>${pct1(l.nat)}</td><td>${pts(l.l)} pt</td><td>${Math.round(l.r * 100)} %</td><td>${verdict(l.r)}</td></tr>`).join("") + "</tbody>";
}

function tableSensibilite() {
  if (!C || !C.sensibilite) { $("tab-sensibilite").innerHTML = ""; return; }
  const S = C.sensibilite, inds = Object.keys(S[0]).filter(k => !["reglage", "nom", "valeur", "actuel"].includes(k));
  let corps = "", avant = "";
  for (const r of S) {
    const n = r.nom === avant ? "" : r.nom; avant = r.nom;
    corps += `<tr${r.actuel ? ' class="actuel"' : ""}><td>${n}</td><td>${r.valeur.toLocaleString("fr-FR")}${r.actuel ? " (actuel)" : ""}</td>`
      + inds.map(k => `<td>${r[k].toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`).join("") + "</tr>";
  }
  $("tab-sensibilite").innerHTML = `<thead><tr><th>Réglage</th><th>Valeur</th>${inds.map(k => `<th>${k}</th>`).join("")}</tr></thead><tbody>${corps}</tbody>`;
  if (C.abstention_2022) {
    const A = C.abstention_2022.age, ecart = A.modele.reduce((s, v, i) => s + Math.abs(v - A.ipsos[i]), 0) / A.ipsos.length;
    $("abst-test").innerHTML = `Test sur l'élection de 2022. Pour l'abstention par âge, le modèle s'écarte en moyenne de ${ecart.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} points des estimations d'Ipsos le jour du premier tour de 2022, sur six tranches d'âge. C'est l'ordre de grandeur de l'erreur à attendre sur l'abstention d'un groupe (page Méthodes, étape 2).`;
  }
}

// ---------- 2. dessin : partage T (grande pyramide)
const SH_de = H => H.parts.map(pk => Float64Array.from(pk.flat(), v => Math.max(v, 1e-6)));
let B_T = null;
function loupeT() {
  const H = D.hypotheses[$("f-hyp").value], T = +$("f-t").value, SH = SH_de(H);
  $("f-t-o").textContent = T.toLocaleString("fr-FR", { minimumFractionDigits: 2 });
  const r = partageT(SH, T, B_T); B_T = r.b;
  const k = H.candidats.indexOf($("f-cand").value);
  const [dess, mod] = k >= 0 ? r.zonePart(k, 0, 4) : [0, 0];
  $("f-t-res").innerHTML = r.deplace < 5e-4 ? "Aucune surface n'est déplacée : chaque zone a la composition du modèle."
    : `${pct1(r.deplace)} de la surface des zones porte une autre couleur que dans le modèle. Par exemple, chez les 18-24 ans titulaires d'un bac+3/4, ${nom($("f-cand").value)} occupe ${pct1(dess)} de la surface dessinée, pour ${pct1(mod)} des inscrits dans le modèle.`;
}
function tableT() {
  const H = D.hypotheses[$("f-hyp").value], SH = SH_de(H);
  let b = null, corps = "";
  for (const [T, n] of [[.3, "Bastions marqués"], [.35, "Lisible"], [.45, "Par défaut"], [.6, ""], [.7, "Lisible, proche des données (ouverture), Mosaïque fine"], [.85, ""], [1, "Fidèle, Pointillisme"]]) {
    const r = partageT(SH, T, b); b = r.b;
    corps += `<tr${T === .7 ? ' class="actuel"' : ""}><td>${T.toLocaleString("fr-FR")}${n ? " · " + n : ""}</td><td>${pct1(r.deplace)}</td></tr>`;
  }
  $("tab-t").innerHTML = `<thead><tr><th>Partage (styles correspondants)</th><th>Surface déplacée</th></tr></thead><tbody>${corps}</tbody>`;
}

// ---------- 2. dessin : concentration γ (petites pyramides, même calcul que epaisseurs() de pyramides.js, sans renforcement)
function deplacementGamma(SHk, gamma) {
  const n = NA * ND, w = lisserAge(SHk).map(v => Math.pow(v, gamma)), insL = new Float64Array(n), ins = new Float64Array(n);
  for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) { insL[i * ND + d] = D.inscritsLisses[i][d]; ins[i * ND + d] = D.inscrits[i][d]; }
  let voix = 0; for (let c = 0; c < n; c++) voix += SHk[c] * ins[c];
  const depot = l => { let s = 0; for (let c = 0; c < n; c++) s += Math.min(1, l * w[c]) * insL[c]; return s; };
  let lo = -60, hi = 60;
  for (let it = 0; it < 70; it++) { const m = (lo + hi) / 2; depot(Math.exp(m)) < voix ? lo = m : hi = m; }
  const l = Math.exp((lo + hi) / 2);
  const za = D.ages.map(a => ZLAB.findIndex(([a0, a1]) => a >= a0 && a <= a1));
  const pz = new Float64Array(ZLAB.length * ND), vz = new Float64Array(ZLAB.length * ND);
  for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) {
    const c = i * ND + d, z = za[i] * ND + d;
    pz[z] += Math.min(1, l * w[c]) * insL[c]; vz[z] += SHk[c] * ins[c];
  }
  const sp = pz.reduce((a, v) => a + v, 0), sv = vz.reduce((a, v) => a + v, 0);
  let e = 0; for (let z = 0; z < pz.length; z++) e += Math.abs(pz[z] / sp - vz[z] / sv);
  return e / 2;
}
function tableGamma() {
  const H = D.hypotheses[$("f-hyp").value], SH = SH_de(H), tot = H.candidats.map((_, k) => SH[k].reduce((s, v, c) => s + v * D.inscrits[Math.floor(c / ND)][c % ND], 0));
  const ex = H.candidats.map((c, k) => k).filter(k => !NON_EXP.has(H.candidats[k]));
  const texp = ex.reduce((s, k) => s + tot[k], 0);
  const grands = ex.filter(k => tot[k] / texp >= .05).sort((a, b) => tot[b] - tot[a]);
  const GAMMAS = [1, 2, 4, 8, 12, 20];
  $("tab-gamma").innerHTML = `<thead><tr><th>Candidat</th>${GAMMAS.map(g => `<th>Concentration ${g}${g === 8 ? " (défaut)" : ""}</th>`).join("")}</tr></thead><tbody>`
    + grands.map(k => `<tr><td>${nom(H.candidats[k])}</td>${GAMMAS.map(g => `<td>${pct1(deplacementGamma(SH[k], g))}</td>`).join("")}</tr>`).join("") + "</tbody>";
}

function tout() { carte(); tableCandidats(); tableSensibilite(); B_T = null; loupeT(); tableT(); tableGamma(); }

chargerJSON("data.json").then(data => {
  D = data; lisser(); NA = D.ages.length; ND = D.diplomes.length;
  if (D.tris_age) document.querySelectorAll(".js-n-sondages").forEach(e => e.textContent = `${D.tris_age.sondages} sondages de ${D.tris_age.instituts} instituts`);
  remplirHypotheses($("f-hyp"));
  const remplirCands = () => {
    const H = D.hypotheses[$("f-hyp").value], avant = $("f-cand").value;
    const ex = H.candidats.filter(c => !NON_EXP.has(c));
    $("f-cand").innerHTML = ex.map(c => `<option value="${c}">${nom(c)}</option>`).join("");
    $("f-cand").value = ex.includes(avant) ? avant : ex.includes("Jean-Luc Mélenchon") ? "Jean-Luc Mélenchon" : ex[0];
  };
  remplirCands();
  $("f-hyp").addEventListener("change", () => { remplirCands(); tout(); });
  $("f-cand").addEventListener("change", () => { carte(); loupeT(); });
  $("f-t").addEventListener("input", loupeT);
  Promise.all([
    chargerJSON("fourchettes.json").then(f => { if (f.empreinte === D.empreinte) F = f; }, () => {}),
    chargerJSON("construction.json").then(c => { C = c; }, () => {}),
  ]).then(tout);
});
