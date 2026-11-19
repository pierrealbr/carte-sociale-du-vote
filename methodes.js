// Graphiques de la page « Méthodes » (SVG maison, avec survol)
// Données : construction.json (scripts/06_export_construction.py) et data.json

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const css = v => getComputedStyle(document.body).getPropertyValue(v).trim();
const pct = (v, d = 0) => (v * 100).toLocaleString("fr-FR", { maximumFractionDigits: d }) + " %";
const num = (v, d = 2) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const DIP = ["Sans diplôme", "CAP-BEP", "Bac", "Bac+2", "Bac+3/4", "Bac+5 et +"];
const dipCoul = i => `var(--dip${i})`;

// ---------- graphique en lignes (ou en aires empilées), avec légende, survol et lignes de référence
// o : { x0, x1, y0, y1, xTicks:[[x, libellé]], yTicks:[v], yFmt, xFmt, series:[{nom, coul, pts:[[x,y]], tirets, points, seulPoints}],
//       empile, refs:[{y, lib}], hauteur, unite }
function graphe(fig, o) {
  const box = fig.querySelector(".g-corps");
  box.innerHTML = "";
  const W = o.largeur || 640, H = o.hauteur || 280, m = { l: 46, r: 14, t: 12, b: 30 };
  const X = x => m.l + (x - o.x0) / (o.x1 - o.x0) * (W - m.l - m.r);
  const Y = y => m.t + (o.y1 - y) / (o.y1 - o.y0) * (H - m.t - m.b);
  // légende (toujours, dès 2 séries)
  if (o.series.length > 1 && !o.sansLegende) {
    const lg = document.createElement("div"); lg.className = "g-leg";
    lg.innerHTML = o.series.map(s => `<span><i class="${s.seulPoints ? "pt" : s.tirets ? "tir" : ""}" style="--c:${s.coul}"></i>${s.nom}</span>`).join("");
    box.appendChild(lg);
  }
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": fig.querySelector("figcaption b")?.textContent || "" }, box);
  const g = el("g", {}, svg);
  for (const v of o.yTicks) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "g-grille" }, g);
    el("text", { x: m.l - 6, y: Y(v), class: "g-axe", "text-anchor": "end", "dominant-baseline": "middle" }, g).textContent = (o.yFmt || String)(v);
  }
  for (const [x, lib] of o.xTicks) el("text", { x: X(x), y: H - m.b + 18, class: "g-axe", "text-anchor": "middle" }, g).textContent = lib;
  el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "g-base" }, g);
  for (const r of o.refs || []) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), class: "g-ref" }, g);
    if (r.lib) el("text", { x: W - m.r, y: Y(r.y) - 5, class: "g-axe", "text-anchor": "end" }, g).textContent = r.lib;
  }
  if (o.empile) {                                      // aires empilées : chaque série = sa part, cumulée de bas en haut
    const xs = o.series[0].pts.map(p => p[0]);
    let bas = xs.map(() => 0);
    for (const s of o.series) {
      const haut = bas.map((b, i) => b + s.pts[i][1]);
      const d = xs.map((x, i) => `${i ? "L" : "M"}${X(x)},${Y(haut[i])}`).join("") + xs.map((x, i) => `L${X(xs[xs.length - 1 - i])},${Y(bas[xs.length - 1 - i])}`).join("") + "Z";
      el("path", { d, fill: s.coul, class: "g-aire" }, g);
      bas = haut;
    }
  } else {
    for (const s of o.series) {
      if (!s.seulPoints) el("path", { d: s.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join(""), class: "g-ligne" + (s.tirets ? " tir" : ""), stroke: s.coul }, g);
      if (s.points || s.seulPoints) for (const p of s.pts) el("circle", { cx: X(p[0]), cy: Y(p[1]), r: 4.5, fill: s.coul, class: "g-pt" }, g);
    }
  }
  // survol : réticule vertical + infobulle avec la valeur de chaque série au x le plus proche
  const xs = [...new Set(o.series.flatMap(s => s.pts.map(p => p[0])))].sort((a, b) => a - b);
  const ret = el("line", { y1: m.t, y2: H - m.b, class: "g-ret", visibility: "hidden" }, svg);
  const bulle = document.createElement("div"); bulle.className = "g-bulle"; bulle.hidden = true; box.appendChild(bulle);
  const zone = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
  const montrer = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
    const xv = o.x0 + (px - m.l) / (W - m.l - m.r) * (o.x1 - o.x0);
    const x = xs.reduce((a, b) => Math.abs(b - xv) < Math.abs(a - xv) ? b : a);
    ret.setAttribute("x1", X(x)); ret.setAttribute("x2", X(x)); ret.setAttribute("visibility", "visible");
    const lignes = o.series.map(s => { const p = s.pts.find(q => q[0] === x); return p ? `<tr><td><i style="background:${s.coul}"></i>${s.nom}</td><td>${(o.yFmt || String)(p[1], true)}</td></tr>` : ""; }).join("");
    bulle.innerHTML = `<b>${(o.xFmt || String)(x)}</b><table>${lignes}</table>`;
    bulle.hidden = false;
    const bx = (X(x) / W) * r.width, droite = bx > r.width * .6;
    bulle.style.left = droite ? "" : `${bx + 12}px`; bulle.style.right = droite ? `${r.width - bx + 12}px` : "";
  };
  zone.addEventListener("pointermove", montrer); zone.addEventListener("pointerdown", montrer);
  zone.addEventListener("pointerleave", () => { bulle.hidden = true; ret.setAttribute("visibility", "hidden"); });
}

// ---------- démonstration des taches : deux candidats, le bleu passe de 80 % (à gauche) à 20 % (à droite)
function taches(cv, T, grain) {
  const n = 150; cv.width = n; cv.height = n;
  let s = 12345 + grain;
  const R = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const champ = () => {
    let a = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) { const u = R() || 1e-9, v = R(); a[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v); }
    const r = Math.round(grain * .9);
    if (r > 0) for (let pas = 0; pas < 3; pas++) {          // trois flous en boîte, horizontal puis vertical
      const b = new Float32Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let t = 0; for (let k = -r; k <= r; k++) t += a[y * n + Math.min(n - 1, Math.max(0, x + k))]; b[y * n + x] = t; }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let t = 0; for (let k = -r; k <= r; k++) t += b[Math.min(n - 1, Math.max(0, y + k)) * n + x]; a[y * n + x] = t; }
    }
    let m = 0, q = 0; for (const v of a) { m += v; q += v * v; } m /= a.length; const sd = Math.sqrt(q / a.length - m * m);
    return a.map(v => { const z = (v - m) / sd, u = Math.min(1 - 1e-9, Math.max(1e-9, .5 * (1 + erf(z / Math.SQRT2)))); return -Math.log(-Math.log(u)); });
  };
  const gA = champ(), gB = champ(), pa = i => .8 - .6 * (i % n) / (n - 1);
  const lA = i => Math.log(pa(i)), lB = i => Math.log(1 - pa(i));
  let b = 0;                                             // correction pour que le bleu occupe 50 % de la surface (sa part moyenne)
  for (let it = 0; it < 40; it++) { let c = 0; for (let i = 0; i < n * n; i++) if (lA(i) + b + T * gA[i] > lB(i) + T * gB[i]) c++; b += .6 * (Math.log(.5) - Math.log(Math.max(c / (n * n), 1e-6))); }
  const ctx = cv.getContext("2d"), im = ctx.createImageData(n, n), cA = [22, 36, 110], cB = [208, 19, 47];
  let cnt = 0;
  for (let i = 0; i < n * n; i++) { const A = lA(i) + b + T * gA[i] > lB(i) + T * gB[i]; if (A) cnt++; const c = A ? cA : cB; im.data.set([...c, 255], i * 4); }
  ctx.putImageData(im, 0, 0);
  return cnt / (n * n);
}

// ---------- les graphiques
let C, D;
let TR, GR;   // tranches d'âge et groupes de diplôme des instituts : construction.json (scripts/commun.py)
const GR_LIB = ["< bac", "Bac", "Bac+2", "Bac+3/4", "Bac+5"];
const CANDS = ["Jean-Luc Mélenchon", "Raphaël Glucksmann", "Edouard Philippe", "Bruno Retailleau", "Marine Le Pen"];
// en mode sombre, le bleu marine de Le Pen disparaît sur le fond : on l'éclaircit
const sombre = () => { const b = css("--bg"); return parseInt(b.slice(1, 3), 16) < 80; };
const coulCand = c => c === "Marine Le Pen" && sombre() ? "#7f95e0" : COULEURS[c];
const court = c => c.split(" ").slice(1).join(" ");
const agesTicks = [20, 30, 40, 50, 60, 70, 80, 90, 100].map(a => [a, a]);

function tout() {
  const f = id => document.getElementById(id);
  // 1a. composition par diplôme selon l'âge
  const tot = D.inscritsLisses.map(r => r.reduce((a, b) => a + b, 0));
  graphe(f("g-compo"), { x0: 18, x1: 100, y0: 0, y1: 1, xTicks: agesTicks, yTicks: [0, .25, .5, .75, 1], yFmt: v => pct(v), xFmt: a => `${a} ans${a === 100 ? " et +" : ""}`, empile: true,
    series: DIP.map((d, j) => ({ nom: d, coul: dipCoul(j), pts: D.ages.map((a, i) => [a, D.inscritsLisses[i][j] / tot[i]]) })) });
  // 1b. survie sur 4 ans
  const SV = C.survie;   // quotients de mortalité de l'INSEE par sexe (scripts/06_export_construction.py)
  graphe(f("g-survie"), { x0: 18, x1: 100, y0: 0, y1: 1, hauteur: 220, xTicks: agesTicks, yTicks: [0, .2, .4, .6, .8, 1], yFmt: v => pct(v), xFmt: a => `${a} ans en 2026`,
    series: [["Femmes", "#c2410c"], ["Hommes", "#1d4ed8"]].map(([s, coul]) => ({ nom: s, coul, pts: SV.ages.map((a, i) => [a, SV[s][i]]) })) });
  // 2a. participation par âge et diplôme
  const P = C.participation_modele;
  graphe(f("g-partic"), { x0: 18, x1: 100, y0: .2, y1: 1, xTicks: agesTicks, yTicks: [.2, .3, .4, .5, .6, .7, .8, .9, 1], yFmt: v => pct(v), xFmt: a => `${a} ans`,
    series: [...DIP.map((d, j) => ({ nom: d, coul: dipCoul(j), pts: P.ages.map((a, i) => [a, P.parts[d][i]]) })),
      { nom: "INSEE 2022, tous diplômes (au moins un tour)", coul: "var(--fg)", seulPoints: true, pts: C.participation_insee.map(p => [p.age, p.taux / 100]) }] });
  // 2b. abstention par âge et par diplôme : modèle, ancien modèle et Ipsos (construction.json, abstention_2022)
  const AB = C.abstention_2022, cAge = [21, 29.5, 42, 54.5, 64.5, 78], libAge = AB.age.groupes;
  const LIGNES = [["modele", "Modèle (INSEE)"], ["ancien", "Ancien modèle"], ["ipsos", "Ipsos 2022"]];
  graphe(f("g-abst"), { x0: 18, x1: 82, y0: 0, y1: .5, hauteur: 240, xTicks: cAge.map((x, i) => [x, libAge[i]]), yTicks: [0, .1, .2, .3, .4, .5], yFmt: v => pct(v), xFmt: x => libAge[cAge.indexOf(x)] + " ans",
    series: [{ nom: "Modèle (INSEE, 1er tour)", coul: "var(--accent)", points: true, pts: cAge.map((x, i) => [x, AB.age.modele[i] / 100]) },
      { nom: "Ancien modèle (au moins un tour)", coul: "var(--muted)", points: true, tirets: true, pts: cAge.map((x, i) => [x, AB.age.ancien[i] / 100]) },
      { nom: "Ipsos 2022 (déclaré)", coul: "var(--fg)", points: true, tirets: true, pts: cAge.map((x, i) => [x, AB.age.ipsos[i] / 100]) }] });
  for (const [id, t] of [["t-abst-age", AB.age], ["t-abst-dip", AB.diplome]])
    f(id).innerHTML = `<thead><tr><th>Abstention</th>${t.groupes.map(g => `<th>${g.replace("<", "&lt;")}</th>`).join("")}</tr></thead><tbody>`
      + LIGNES.map(([k, lib]) => `<tr><td>${lib}</td>${t[k].map(v => `<td>${Math.round(v)} %</td>`).join("")}</tr>`).join("") + "</tbody>";
  const ecart = k => AB.age[k].reduce((s, v, i) => s + Math.abs(v - AB.age.ipsos[i]), 0) / AB.age.ipsos.length;
  f("abst-ecart-ancien").textContent = num(ecart("ancien"), 1); f("abst-ecart").textContent = num(ecart("modele"), 1);
  f("abst-ecart-2534-ancien").textContent = Math.round(Math.abs(AB.age.ancien[1] - AB.age.ipsos[1]));
  f("abst-ecart-2534").textContent = Math.round(Math.abs(AB.age.modele[1] - AB.age.ipsos[1]));
  // bilan : effet des réglages choisis à la main (scripts/sensibilite.py)
  if (C.sensibilite && f("t-sensibilite")) {
    const inds = Object.keys(C.sensibilite[0]).filter(k => !["reglage", "nom", "valeur", "actuel"].includes(k));
    let corps = "", avant = "";
    for (const r of C.sensibilite) {
      const nom = r.nom === avant ? "" : r.nom; avant = r.nom;
      corps += `<tr${r.actuel ? ' class="actuel"' : ""}><td style="text-align:left">${nom}</td><td>${r.actuel ? "<b>" : ""}${num(r.valeur, r.valeur < 20 ? 1 : 0)}${r.actuel ? " (actuel)</b>" : ""}</td>`
        + inds.map(k => `<td>${r.actuel ? "<b>" : ""}${num(r[k], 2)}${r.actuel ? "</b>" : ""}</td>`).join("") + "</tr>";
    }
    f("t-sensibilite").innerHTML = `<thead><tr><th style="text-align:left">Réglage</th><th>Valeur</th>${inds.map(k => `<th>${k}</th>`).join("")}</tr></thead><tbody>${corps}</tbody>`;
  }
  // 3. test sur 2022 : vote par diplôme, publié / reconstitué
  for (const [id, c] of [["g-bt-lepen", "Le Pen"], ["g-bt-macron", "Macron"], ["g-bt-melenchon", "Mélenchon"]]) {
    const b = C.backtest[c], libs = ["< bac", "Bac", "Bac+2", "Bac+3 et +"];
    graphe(f(id), { x0: -.3, x1: 3.3, y0: 0, y1: .4, largeur: 300, hauteur: 280, xTicks: libs.map((l, i) => [i, l]), yTicks: [0, .1, .2, .3, .4], yFmt: v => pct(v), xFmt: i => libs[i], sansLegende: true,
      series: [{ nom: "Publié (Ipsos)", coul: "var(--fg)", points: true, pts: b.map((r, i) => [i, r.publie_ipsos / 100]) },
        { nom: "Âge + profession", coul: "var(--accent)", points: true, pts: b.map((r, i) => [i, r.modele_age_profession / 100]) },
        { nom: "Âge seul", coul: "var(--muted)", tirets: true, pts: b.map((r, i) => [i, r.modele_age_seul / 100]) }] });
  }
  // 4. indices moyens des instituts
  const ind = (src, cles) => CANDS.map(c => ({ nom: court(c), coul: coulCand(c), points: true, pts: cles.map((k, i) => [i, src[c][k]]) }));
  graphe(f("g-ind-age"), { x0: -.3, x1: 4.3, y0: .4, y1: 2.5, xTicks: TR.map((t, i) => [i, t]), yTicks: [.5, 1, 1.5, 2, 2.5], yFmt: v => num(v, v % .5 ? 2 : 1), xFmt: i => TR[i] + " ans",
    refs: [{ y: 1, lib: "comme en moyenne" }], series: ind(C.indices_age, TR) });
  graphe(f("g-ind-dip"), { x0: -.3, x1: 4.3, y0: .4, y1: 1.6, xTicks: GR_LIB.map((t, i) => [i, t]), yTicks: [.4, .6, .8, 1, 1.2, 1.4, 1.6], yFmt: v => num(v, 1), xFmt: i => GR_LIB[i],
    refs: [{ y: 1, lib: "comme en moyenne" }], series: ind(C.indices_diplome, GR) });
  // 5. résultat : score parmi les votants, par âge, pour chaque diplôme
  let nomH = Object.keys(D.hypotheses)[0];
  try { const h = localStorage.getItem("hyp"); if (h && h in D.hypotheses) nomH = h; } catch (e) {}
  const h = D.hypotheses[nomH], ia = h.candidats.indexOf("Abstention"), ibn = h.candidats.indexOf("Blancs et nuls");
  const exprimes = (i, j) => 1 - h.parts[ia][i][j] - (ibn >= 0 ? h.parts[ibn][i][j] : 0);
  f("g-res-hyp").textContent = `${h.groupe} — ${h.court}`;
  for (const [id, c] of [["g-res-lepen", "Marine Le Pen"], ["g-res-melenchon", "Jean-Luc Mélenchon"]]) {
    const k = h.candidats.indexOf(c);
    if (k < 0) continue;
    graphe(f(id), { x0: 18, x1: 100, y0: 0, y1: .7, largeur: 380, hauteur: 320, xTicks: agesTicks.filter((_, i) => i % 2 === 0), yTicks: [0, .1, .2, .3, .4, .5, .6, .7], yFmt: v => pct(v), xFmt: a => `${a} ans`, sansLegende: true,
      series: DIP.map((d, j) => ({ nom: d, coul: dipCoul(j), pts: D.ages.map((a, i) => [a, h.parts[k][i][j] / exprimes(i, j)]) })) });
  }
  // 7. épaisseur de la couche selon γ (même calcul que pyramides.js)
  const NA = D.ages.length, ND = DIP.length, kLP = h.candidats.indexOf("Marine Le Pen");
  const epais = (k, gam) => { const sh = lisserAge(h.parts[k].flat()), w = sh.map(v => Math.pow(v, gam));
    let tot = 0; for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) tot += h.parts[k][i][d] * D.inscrits[i][d];
    const depot = l => { let x = 0; for (let i = 0; i < NA; i++) for (let d = 0; d < ND; d++) x += Math.min(1, l * w[i * ND + d]) * D.inscritsLisses[i][d]; return x; };
    let lo = -60, hi = 60; for (let it = 0; it < 70; it++) { const m = (lo + hi) / 2; depot(Math.exp(m)) < tot ? lo = m : hi = m; }
    const l = Math.exp((lo + hi) / 2); return w.map(v => Math.min(1, l * v)); };
  if (kLP >= 0) {
    const E = [1, 3, 8].map(g => epais(kLP, g));
    for (const [id, d] of [["g-gam-cap", 1], ["g-gam-b5", 5]])
      graphe(f(id), { x0: 18, x1: 100, y0: 0, y1: 1, largeur: 380, hauteur: 300, xTicks: agesTicks.filter((_, i) => i % 2 === 0), yTicks: [0, .25, .5, .75, 1], yFmt: v => num(v, 2), xFmt: a => `${a} ans`, sansLegende: true,
        series: [1, 3, 8].map((g, x) => ({ nom: `γ = ${g}`, coul: `var(--dip${[1, 3, 5][x]})`, pts: D.ages.map((a, i) => [a, E[x][i * ND + d]]) })) });
  }
  // 6. partage T : surface déplacée zone par zone (partageT, common.js), sur la première hypothèse de data.json
  {
    const nomH = Object.keys(D.hypotheses)[0], h = D.hypotheses[nomH], ND_ = D.diplomes.length;
    const SH = h.parts.map(pk => Float64Array.from(pk.flat()));
    const k = n => h.candidats.indexOf(n), iM = k("Jean-Luc Mélenchon"), iL = k("Marine Le Pen");
    const lignes = [[.3, "« Bastions marqués »"], [.35, "« Lisible »"], [.45, "« Par défaut »"], [.5, ""], [.6, ""], [.7, "« Lisible, proche des données », à l'ouverture (sans gravité)"], [.8, ""], [1, "« Pointillisme »"]];
    let b = null, corps = "", ouverture = null;
    const z = (r, i, zi, d) => i < 0 ? "—" : (([x]) => pct(x))(r.zonePart(i, zi, d));
    let modM = "", modL = "";
    for (const [T, nom] of lignes) {
      const r = partageT(SH, T, b); b = r.b;
      if (T === .7) ouverture = r.deplace;
      if (iM >= 0) modM = pct(r.zonePart(iM, 0, 4)[1]);
      if (iL >= 0) modL = pct(r.zonePart(iL, 5, 0)[1]);
      corps += `<tr><td style="text-align:left">${T.toLocaleString("fr-FR")}${nom ? " " + nom : ""}</td><td>${pct(r.deplace, 1)}</td><td>${z(r, iM, 0, 4)}</td><td>${z(r, iL, 5, 0)}</td></tr>`;
    }
    $("t-partage").innerHTML = `<thead><tr><th style="text-align:left">Partage T</th><th>Surface déplacée</th><th>Mélenchon, 18-24 ans bac+3/4<br>(modèle : ${modM})</th><th>Le Pen, 80 ans et + sans diplôme<br>(modèle : ${modL})</th></tr></thead><tbody>${corps}</tbody>`;
    document.querySelectorAll(".js-dep-ouverture").forEach(e => e.textContent = pct(ouverture));
    document.querySelectorAll(".js-dep-hyp").forEach(e => e.textContent = `« ${nomH} »`);
  }
  // 6. taches
  for (const cv of document.querySelectorAll(".demo canvas")) {
    const part = taches(cv, +cv.dataset.t, +cv.dataset.grain);
    cv.nextElementSibling.querySelector("small").textContent = `bleu : ${pct(part, 1)} de la surface`;
  }
}

Promise.all([chargerJSON("construction.json"), chargerJSON("data.json")])
  .then(([c, d]) => { C = c; D = d; TR = C.tranches_instituts; GR = C.groupes_diplome; lisser(); tout(); document.addEventListener("theme", tout); ouvrirCible(); });   // graphiques dessinés : la cible est à sa place définitive

// résumé / explication détaillée : bouton « Tout déplier » ; un lien vers un graphique ou une étape ouvre son bloc
const blocs = () => [...document.querySelectorAll("details.detail")];
const majBouton = () => { document.getElementById("toutdeplier").textContent = blocs().every(d => d.open) ? "Tout replier" : "Tout déplier"; };
document.getElementById("toutdeplier").addEventListener("click", () => { const ouvrir = !blocs().every(d => d.open); blocs().forEach(d => d.open = ouvrir); majBouton(); });
blocs().forEach(d => d.addEventListener("toggle", majBouton));
function ouvrirCible() { const t = location.hash && document.getElementById(location.hash.slice(1)); const d = t && t.closest("details.detail"); if (d) { d.open = true; t.scrollIntoView(); } }
window.addEventListener("hashchange", ouvrirCible); ouvrirCible();
