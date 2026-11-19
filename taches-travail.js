// Worker : calcule le champ de bruit d'un candidat hors de la page (audit du 18/11/2026, P4).
// Messages reçus : { geo, INS, W, H } (pixels de la pyramide, une fois par cadrage) ;
//                  { id, geo, cand, seed, grain, etir } (un champ) -> { id, g } (g transféré, sans copie) ;
//                  { id, geo, LAB, ks, R } (densités de gravité des candidats ks) -> { id, d }.
importScripts("taches.js");
let GEO = -1, INS = null, W = 0, H = 0;
onmessage = e => {
  const m = e.data;
  if (m.INS) { GEO = m.geo; INS = m.INS; W = m.W; H = m.H; return; }
  if (m.geo !== GEO) { postMessage({ id: m.id, perime: true }); return; }
  if (m.LAB) {                                       // gravité : densités des candidats m.ks (une passe)
    const d = m.ks.map(k => densite(m.LAB, k, m.R, W, H, INS));
    postMessage({ id: m.id, d }, d.map(x => x.buffer)); return;
  }
  const g = champBruit(m.cand, m.seed, m.grain, m.etir, W, H, INS);
  postMessage({ id: m.id, g }, [g.buffer]);
};
