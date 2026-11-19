// Calculs purs des taches, sans page ni DOM : partagés par app.js (fil principal) et taches-travail.js (workers,
// audit du 18/11/2026, P4). Même code des deux côtés : le bruit est identique au bit près, d'où le même dessin.

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function erf(x) { const t = 1 / (1 + .3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

// flou en boîte de rayons différents en x et en y (taches allongées), sur une image W × H
function boxBlurXY(src, dst, rx, ry, W, H) {
  const N = W * H, tmp = new Float32Array(N);
  if (rx > 0) { const n = 2 * rx + 1;
    for (let y = 0; y < H; y++) { let acc = 0; const o = y * W; for (let x = -rx; x <= rx; x++) acc += src[o + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) { tmp[o + x] = acc / n; acc += src[o + Math.min(W - 1, x + rx + 1)] - src[o + Math.max(0, x - rx)]; } } }
  else tmp.set(src);
  if (ry > 0) { const n = 2 * ry + 1, col = new Float32Array(H);
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -ry; y <= ry; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) { col[y] = acc / n; acc += tmp[Math.min(H - 1, y + ry + 1) * W + x] - tmp[Math.max(0, y - ry) * W + x]; }
      for (let y = 0; y < H; y++) dst[y * W + x] = col[y]; } }
  else dst.set(tmp);
}

// champ de bruit d'un candidat : gaussien, lissé en taches (trois flous en boîte), ramené à une loi de Gumbel sur
// les pixels de la pyramide (INS). Stable d'une hypothèse à l'autre : il ne dépend que du candidat et des réglages.
function champBruit(cand, seed, grain, etir, W, H, INS) {
  const N = W * H, NI = INS.length;
  let h = 0; for (const ch of cand) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const R = rng(seed * 2654435761 + grain * 97 + h), a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i += 2) { const u1 = R() || 1e-9, u2 = R(), m = Math.sqrt(-2 * Math.log(u1)); a[i] = m * Math.cos(6.283185 * u2); if (i + 1 < N) a[i + 1] = m * Math.sin(6.283185 * u2); }
  // étirement e : les taches sont e fois plus larges que hautes (même surface moyenne)
  const r = grain * .9, rx = Math.max(1, Math.round(r * Math.sqrt(etir))), ry = Math.max(1, Math.round(r / Math.sqrt(etir)));
  boxBlurXY(a, b, rx, ry, W, H); boxBlurXY(b, a, rx, ry, W, H); boxBlurXY(a, b, rx, ry, W, H);
  let s = 0, s2 = 0; for (let j = 0; j < NI; j++) { const v = b[INS[j]]; s += v; s2 += v * v; }
  const mu = s / NI, sd = Math.sqrt(s2 / NI - mu * mu) || 1, g = new Float32Array(NI);
  for (let j = 0; j < NI; j++) { const z = (b[INS[j]] - mu) / sd, u = Math.min(1 - 1e-9, Math.max(1e-9, .5 * (1 + erf(z / Math.SQRT2)))); g[j] = -Math.log(-Math.log(u)); }
  return g;
}

// gravité : densité des pixels du candidat k autour de chaque pixel de la pyramide (indicatrice floutée deux fois,
// noyau en cloche de rayon ≈ portée), rangée comme INS
function densite(LAB, k, R, W, H, INS) {
  const N = W * H, NI = INS.length, ind = new Float32Array(N), tmp = new Float32Array(N), out = new Float32Array(NI);
  for (let j = 0; j < NI; j++) if (LAB[INS[j]] === k) ind[INS[j]] = 1;
  boxBlurXY(ind, tmp, R, R, W, H); boxBlurXY(tmp, ind, R, R, W, H);
  for (let j = 0; j < NI; j++) out[j] = ind[INS[j]];
  return out;
}
