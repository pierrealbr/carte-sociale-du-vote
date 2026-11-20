// Électorat de chaque candidat : une petite pyramide par candidat, et leur superposition
// Code commun (hypothèse, épaisseurs, dessin) : pyramides.js

// vue superposée : la légende sert d'interrupteur (cliquer sur un nom le retire ou le remet)
const caches = new Set(["Abstention", "Blancs et nuls"]);   // masqués ; l'abstention et les blancs et nuls le sont au départ
let ORDRE = [];
function superposee() {
  const ia = H_.cands.indexOf("Abstention"), ks = ORDRE.filter(k => !caches.has(H_.cands[k]));
  const leg = $("ptleg"); leg.innerHTML = "";
  for (const k of ORDRE) {
    const c = H_.cands[k], b = document.createElement("button");
    b.type = "button"; b.className = "leg" + (caches.has(c) ? " off" : ""); b.setAttribute("aria-pressed", !caches.has(c));
    b.innerHTML = `<i style="background:${couleur(k)}"></i>${court(k, ia)}`;
    b.addEventListener("click", () => { caches.has(c) ? caches.delete(c) : caches.add(c); superposee(); });
    leg.appendChild(b);
  }
  $("ptvide").hidden = ks.length > 0;
  petitePyramide($("ptall"), ks, +$("conc").value);
}
function montrerSeulement(liste) { caches.clear(); for (const c of H_.cands) if (!liste.includes(c)) caches.add(c); superposee(); }
function peinture() {
  const gamma = +$("conc").value, K = H_.cands.length, ia = H_.cands.indexOf("Abstention");
  const expr = H_.TOT.reduce((s, v, k) => estExprime(H_.cands[k]) ? s + v : s, 0), max = Math.max(...H_.TOT);
  const rang = k => k === ia ? 3 : !estExprime(H_.cands[k]) ? 2 : estPetits(H_.cands[k]) ? 1 : 0;   // petits candidats, blancs et nuls, puis abstention en fin de grille
  const ordre = [...Array(K).keys()].sort((a, b) => rang(a) - rang(b) || H_.TOT[b] - H_.TOT[a]);
  ORDRE = ordre; superposee();
  const g = $("ptgrid"); g.innerHTML = "";
  for (const k of ordre) {
    const abst = !estExprime(H_.cands[k]), col = couleur(k), v = fmtM(H_.TOT[k]) + " M";
    const carte = document.createElement("div"); carte.className = "pt-carte";
    const grp = estPetits(H_.cands[k]) ? `<div class="membres" title="Candidats recueillant moins de ${fmtP(SEUIL_PETITS)} des suffrages exprimés, regroupés par camp">${H_.membres[H_.cands[k]].join(", ")}</div>` : "";
    carte.innerHTML = `<div class="t"><b><i style="background:${col}"></i>${court(k, ia)}</b><small>${abst ? v + " · " + fmtP(H_.TOT[k] / D.total) + " des ins." : v + " · " + fmtP(H_.TOT[k] / expr) + " · " + fmtP(H_.TOT[k] / D.total) + " ins."}</small></div>${grp}`
      + `<canvas role="img" aria-label="Où se trouvent les électeurs ${deNom(H_.cands[k])}"></canvas><div class="pt-barre"><i style="width:${(H_.TOT[k] / max * 100).toFixed(1)}%;background:${col}"></i></div>`;
    g.appendChild(carte);
    petitePyramide(carte.querySelector("canvas"), [k], gamma);
  }
}


chargerJSON("data.json").then(data => {
  D = data; lisser(); D.total = D.inscrits.flat().reduce((a, b) => a + b, 0); NA = D.ages.length; ND = D.diplomes.length; BND = bornes(D.inscritsLisses);
  const sel = $("hyp"); remplirHypotheses(sel);
  // participation : mêmes réglages que sur la Carte (common.js) ; on redessine quand le curseur est relâché
  brancherParticipation(PART, () => chargerHypothese(sel.value), peinture);
  const note = () => { const v = D.hypotheses[sel.value], ouverte = !!$("sondage").querySelector("details[open]");
    $("sondage").innerHTML = `<b>${v.groupe}</b><details class="notice"${ouverte ? " open" : ""}><summary>Notice du sondage</summary><p>${v.note}</p></details>`; };
  chargerHypothese(sel.value); note();
  const MEM = etatPage("electorats");   // réglages et candidats masqués du dernier passage (common.js)
  if (MEM) {
    for (const id of ["conc", "boost"]) if (MEM[id] != null) $(id).value = MEM[id];
    if (Array.isArray(MEM.caches)) { caches.clear(); MEM.caches.forEach(c => caches.add(c)); }
    if (MEM.part) { for (const g in PART) if (typeof MEM.part[g] === "number") { PART[g] = MEM.part[g]; $(`part_${g}`).value = MEM.part[g]; } chargerHypothese(sel.value); }
  }
  garderEtat("electorats", () => ({ conc: $("conc").value, boost: $("boost").value, caches: [...caches], part: PART }));
  sel.addEventListener("change", () => { chargerHypothese(sel.value); note(); peinture(); });
  const concTxt = () => $("conc_o").textContent = $("conc").value;
  concTxt(); $("conc").addEventListener("input", concTxt); $("conc").addEventListener("change", peinture);
  const boostTxt = () => $("boost_o").textContent = +$("boost").value === 1 ? "aucun" : "× " + (+$("boost").value).toLocaleString("fr-FR", { minimumFractionDigits: 1 });
  boostTxt(); $("boost").addEventListener("input", boostTxt); $("boost").addEventListener("change", peinture);
  $("pttous").addEventListener("click", () => montrerSeulement(H_.cands.filter(estExprime)));
  $("ptaucun").addEventListener("click", () => montrerSeulement([]));
  document.addEventListener("theme", peinture);   // les graduations sont dessinées dans la couleur du texte
  let larg = 0, t = 0;
  new ResizeObserver(e => { const w = Math.round(e[0].contentRect.width); if (w === larg) return; larg = w;
    clearTimeout(t); t = setTimeout(peinture, 150); }).observe(document.querySelector(".ep"));
  peinture();
});
