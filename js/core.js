/* Flow Diagram: parsing of ADAPT circuits and the probability-flow computation. No DOM; also loads in Node (tests/). */
// ---------- parsing ----------
function parseComplex(s) {
  s = s.replace(/[()\s*]/g, '');
  if (s === '' || s === '+') return [1, 0];
  if (s === '-') return [-1, 0];
  if (!/[jJ]$/.test(s)) return [Number(s), 0];
  s = s.slice(0, -1);
  let k = -1;
  for (let i = s.length - 1; i > 0; i--) if ((s[i] === '+' || s[i] === '-') && !/[eE]/.test(s[i - 1])) { k = i; break; }
  const num = t => t === '' || t === '+' ? 1 : t === '-' ? -1 : Number(t);
  if (k < 0) return [0, num(s)];
  return [Number(s.slice(0, k)), num(s.slice(k))];
}

// A term: {x: bitmask of X/Y, z: bitmask of Z/Y, ny: number of Y, c: [re, im]}
function termFrom(paulis, c) {
  let x = 0, z = 0, ny = 0;
  for (const [p, q] of paulis) {
    if (q > 30) throw new Error('more than 31 qubits are not supported');
    const b = 1 << q;
    if (p === 'X') x |= b; else if (p === 'Y') { x |= b; z |= b; ny++; } else if (p === 'Z') z |= b;
  }
  return { x, z, ny, c };
}

function parseOperator(s) {
  if (/\b(Adjoint|Exp|Evolution|Prod|SProd)\s*\(/.test(s))
    throw new Error('the operator is a symbolic expression (e.g. Adjoint(...)); print op.simplify() in PennyLane');
  if (/SparsePauliOp|\(\s*['"][IXYZ]+['"]\s*,/.test(s)) return { fmt: 'qiskit', ...parseQiskit(s) };
  const bracket = /\[([^\]]*)\]/g, pl = /(?:[IXYZ]\(\s*\d+\s*\)\s*@\s*)*[IXYZ]\(\s*\d+\s*\)/g;
  const fmt = /\[[^\]]*\]/.test(s) ? 'openfermion' : 'pennylane';
  const re = fmt === 'openfermion' ? bracket : pl;
  const terms = []; let last = 0, m, nq = 0;
  while ((m = re.exec(s))) {
    let coef = s.slice(last, m.index).replace(/[\s*()]/g, '').replace(/^\+/, '');
    if (fmt === 'pennylane') coef = s.slice(last, m.index).replace(/[\s*]/g, '').replace(/^\)+/, '').replace(/\(+$/, '').replace(/^\+/, '');
    const body = fmt === 'openfermion' ? m[1] : m[0];
    const ps = [...body.matchAll(/([IXYZ])\(?\s*(\d+)\s*\)?/g)].map(t => [t[1], +t[2]]);
    for (const [, q] of ps) nq = Math.max(nq, q + 1);
    terms.push(termFrom(ps, parseComplex(coef)));
    last = m.index + m[0].length;
  }
  if (!terms.length) throw new Error('no Pauli terms found');
  return { fmt, terms, nq };
}

function parseQiskit(s) {
  let labels, coefs;
  const tl = [...s.matchAll(/\(\s*['"]([IXYZ]+)['"]\s*,\s*\(?([^()]*?)\)?\s*\)/g)];
  if (tl.length) { labels = tl.map(t => t[1]); coefs = tl.map(t => parseComplex(t[2])); }
  else {
    labels = [...s.matchAll(/['"]([IXYZ]+)['"]/g)].map(t => t[1]);
    const cm = s.match(/coeffs\s*=\s*\[([\s\S]*?)\]/);
    coefs = cm ? cm[1].replace(/\s+/g, '').split(',').filter(Boolean).map(parseComplex) : labels.map(() => [1, 0]);
  }
  if (!labels.length || labels.length !== coefs.length) throw new Error('could not read SparsePauliOp');
  const nq = labels[0].length;
  const terms = labels.map((l, i) => termFrom([...l].reverse().map((p, q) => [p, q]), coefs[i]));
  return { terms, nq };
}

// PennyLane gates: U = exp(i theta G) with G = op.generator(), so H = -G (U = exp(-i theta H)).
const PL_GATES = {
  SingleExcitation: { n: 2, terms: [['XY', 0.25], ['YX', -0.25]] },
  DoubleExcitation: { n: 4, terms: [['XXXY', 0.0625], ['XXYX', 0.0625], ['XYXX', -0.0625], ['XYYY', 0.0625],
                                    ['YXXX', -0.0625], ['YXYY', 0.0625], ['YYXY', -0.0625], ['YYYX', -0.0625]] },
};
function lineErr(e, line, k) {
  const err = new Error(`line ${line}${k != null ? ` (operation ${k + 1})` : ''}: ${e.message}`); err.line = line; return err;
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
function parseGates(text) {
  const ops = [], re = /(SingleExcitation|DoubleExcitation)\(([\s\S]*?),\s*wires\s*=\s*\[([^\]]*)\]\s*\)/g;
  let m, nq = 0;
  while ((m = re.exec(text))) {
    const g = PL_GATES[m[1]], wires = m[3].split(',').map(Number);
    const num = m[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (!num || wires.length !== g.n || wires.some(isNaN)) throw lineErr(new Error('could not read ' + m[0].slice(0, 60)), lineOf(text, m.index));
    wires.forEach(w => { nq = Math.max(nq, w + 1); });
    const terms = g.terms.map(([ps, c]) => termFrom([...ps].map((p, i) => [p, wires[i]]), [-c, 0]));
    ops.push({ theta: Number(num[0]), kind: 'gate', fmt: 'pennylane', terms, nq, name: m[1] });
  }
  let hf = null;
  const bs = text.match(/BasisState\(\s*(?:array|tensor)?\(?\s*\[([01,\s]+)\]/);
  if (bs) hf = bs[1].split(',').map(t => t.trim()).filter(Boolean).join('');
  return { ops, nq, hf };
}

function parseCircuit(text) {
  if (!/^\s*[-+]?[\d.]+(?:[eE][-+]?\d+)?\s*\|/m.test(text) && /(Single|Double)Excitation\(/.test(text)) {
    const g = parseGates(text);
    if (!g.ops.length) throw new Error('no operations found');
    const e = text.match(/electrons\s*[:=]\s*(\d+)/i);
    return { ops: g.ops, fmt: 'pennylane-gates', nq: g.nq + (g.nq % 2), electrons: e ? +e[1] : null, hf: g.hf };
  }
  const ops = []; let cur = null, electrons = null;
  const rows = text.split('\n');
  for (let li = 0; li < rows.length; li++) {
    const line = rows[li].trim();
    if (!line) continue;
    if (line.startsWith('#')) { const e = line.match(/electrons\s*[:=]\s*(\d+)/i); if (e) electrons = +e[1]; continue; }
    const m = line.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*\|(.*)$/);
    if (m) { cur = { theta: Number(m[1]), text: m[2], line: li + 1 }; ops.push(cur); }
    else if (cur) cur.text += '\n' + line;
    else throw lineErr(new Error('a block must start with "angle | operator" (or paste PennyLane gates): ' + line.slice(0, 40)), li + 1);
  }
  if (!ops.length) throw new Error('no operations found');
  const parsed = ops.map((o, k) => { try {
    const p = parseOperator(o.text);
    // combine like Pauli strings (unsimplified printouts can contain cancelling duplicates)
    const merged = new Map();
    for (const t of p.terms) {
      const key = t.x + ',' + t.z, u = merged.get(key);
      if (u) { u.c = [u.c[0] + t.c[0], u.c[1] + t.c[1]]; } else merged.set(key, { ...t, c: [...t.c] });
    }
    p.terms = [...merged.values()].filter(t => Math.hypot(t.c[0], t.c[1]) > 1e-14);
    if (!p.terms.length) throw new Error('all terms cancel');
    const im = p.terms.every(t => Math.abs(t.c[0]) < 1e-12), rl = p.terms.every(t => Math.abs(t.c[1]) < 1e-12);
    if (!im && !rl) throw new Error('coefficients must be all real (H) or all imaginary (A)');
    // store H with U = exp(-i theta H); for A (imaginary coefs), H = iA
    if (im && !rl) p.terms.forEach(t => { t.c = [-t.c[1], t.c[0]]; });
    p.terms.forEach(t => { t.c = [t.c[0], 0]; });
    return { theta: o.theta, kind: im && !rl ? 'A' : 'H', ...p };
  } catch (e) { throw e.line ? e : lineErr(e, o.line, k); } });
  const fmt = parsed[0].fmt, nq = Math.max(...parsed.map(p => p.nq));
  return { ops: parsed, fmt, nq: nq + (fmt === 'qiskit' ? 0 : nq % 2), electrons };
}

function hfState(fmt, nq, ne, order) {
  const na = Math.ceil(ne / 2), nb = ne - na, M = nq / 2; let b = 0;
  if ((order || (fmt === 'qiskit' ? 'blocked' : 'interleaved')) === 'blocked') { for (let i = 0; i < na; i++) b |= 1 << i; for (let i = 0; i < nb; i++) b |= 1 << (M + i); }
  else for (let i = 0; i < ne; i++) b |= 1 << i;
  return b;
}

const popcount = v => { let c = 0; while (v) { v &= v - 1; c++; } return c; };

// P|b> = i^ny (-1)^{popcount(b & z)} |b ^ x>
function applyTerms(terms, b) {
  const out = new Map();
  for (const t of terms) {
    const ph = ((t.ny + 2 * popcount(b & t.z)) % 4 + 4) % 4; // power of i
    const [re, im] = [[1, 0], [0, 1], [-1, 0], [0, -1]][ph];
    const b2 = b ^ t.x, v = out.get(b2) || [0, 0];
    v[0] += t.c[0] * re - t.c[1] * im; v[1] += t.c[0] * im + t.c[1] * re;
    out.set(b2, v);
  }
  return out;
}

// ---------- computation ----------
function compute(circ, hf, F = 24, maxStates = 20000) {
  const K = circ.ops.length;
  const index = new Map([[hf, 0]]), states = [hf], cols = circ.ops.map(() => []);
  for (let n = 0; n < states.length; n++) {
    for (let k = 0; k < K; k++) {
      const col = [];
      for (const [b2, v] of applyTerms(circ.ops[k].terms, states[n])) {
        if (Math.hypot(v[0], v[1]) < 1e-12) continue;
        if (!index.has(b2)) { if (states.length >= maxStates) throw new Error(`more than ${maxStates} configurations reached`); index.set(b2, states.length); states.push(b2); }
        col.push([index.get(b2), v[0], v[1]]);
      }
      cols[k][n] = col;
    }
  }
  const N = states.length;
  // sparse H_k as entry lists (row i, col j, re, im)
  const Hs = cols.map(cl => { const e = []; cl.forEach((col, j) => col.forEach(([i, re, im]) => e.push(i, j, re, im))); return e; });
  let herm = 0;
  for (const e of Hs) {
    const m = new Map(); for (let a = 0; a < e.length; a += 4) m.set(e[a] * N + e[a + 1], [e[a + 2], e[a + 3]]);
    for (const [key, v] of m) { const i = Math.floor(key / N), j = key % N, w = m.get(j * N + i) || [0, 0]; herm = Math.max(herm, Math.hypot(v[0] - w[0], v[1] + w[1])); }
  }
  const matvec = (e, xr, xi, yr, yi) => { yr.fill(0); yi.fill(0); for (let a = 0; a < e.length; a += 4) { const i = e[a], j = e[a + 1], hr = e[a + 2], hi = e[a + 3]; yr[i] += hr * xr[j] - hi * xi[j]; yi[i] += hr * xi[j] + hi * xr[j]; } };
  const norm1 = e => { const r = new Float64Array(N); for (let a = 0; a < e.length; a += 4) r[e[a]] += Math.hypot(e[a + 2], e[a + 3]); return Math.max(0, ...r); };
  // v <- exp(-i tau H) v, Taylor with substeps
  function expStep(e, tau, vr, vi, nH) {
    const s = Math.max(1, Math.ceil(Math.abs(tau) * nH / 0.5)), h = tau / s;
    const tr = new Float64Array(N), ti = new Float64Array(N), yr = new Float64Array(N), yi = new Float64Array(N);
    for (let sub = 0; sub < s; sub++) {
      tr.set(vr); ti.set(vi);
      for (let n = 1; n < 40; n++) {
        matvec(e, tr, ti, yr, yi);
        let mx = 0;
        for (let i = 0; i < N; i++) { const r = h * yi[i] / n, im = -h * yr[i] / n; tr[i] = r; ti[i] = im; vr[i] += r; vi[i] += im; mx = Math.max(mx, Math.abs(r), Math.abs(im)); }
        if (mx < 1e-17) break;
      }
    }
  }
  const vr = new Float64Array(N), vi = new Float64Array(N); vr[0] = 1;
  const probs = [], amps = [], flows = [], ops = [];
  let normErr = 0, contErr = 0, imagMax = 0;
  const P = () => {
    const p = new Float64Array(N), a = new Float32Array(N);
    for (let i = 0; i < N; i++) { p[i] = vr[i] * vr[i] + vi[i] * vi[i]; a[i] = vr[i]; imagMax = Math.max(imagMax, Math.abs(vi[i])); }
    amps.push(a); return p;
  };
  probs.push(P());
  for (let k = 0; k < K; k++) {
    const e = Hs[k], th = circ.ops[k].theta, nH = norm1(e);
    // edges (i<j) of this operation
    const edgeIdx = new Map(), edges = [];
    for (let a = 0; a < e.length; a += 4) { const i = e[a], j = e[a + 1]; if (i === j) continue; const key = Math.min(i, j) * N + Math.max(i, j); if (!edgeIdx.has(key)) { edgeIdx.set(key, edges.length); edges.push([Math.min(i, j), Math.max(i, j)]); } }
    const Jint = new Float64Array(edges.length);
    const instFlow = () => { // J_{j->i} = 2 theta Im(conj(c_i) H_ij c_j), accumulated on edge (lo, hi) as flow lo->hi
      const J = new Float64Array(edges.length);
      for (let a = 0; a < e.length; a += 4) {
        const i = e[a], j = e[a + 1]; if (i === j) continue;
        const hr = e[a + 2], hi = e[a + 3];
        const pr = hr * vr[j] - hi * vi[j], pi = hr * vi[j] + hi * vr[j]; // H_ij c_j
        const val = 2 * th * (vr[i] * pi - vi[i] * pr); // Im(conj(c_i) * H_ij c_j)
        const ed = edgeIdx.get(Math.min(i, j) * N + Math.max(i, j));
        // val is flow j -> i; store as flow lo -> hi; each unordered pair is visited twice (ij and ji)
        J[ed] += 0.5 * (i > j ? val : -val);
      }
      return J;
    };
    const start = probs[probs.length - 1];
    // composite Simpson over the F + 1 frames (F even)
    const wS = f => (f === 0 || f === F ? 1 : f % 2 ? 4 : 2) / (3 * F);
    let J = instFlow();
    const Jinst = [Float32Array.from(J)];
    for (let a = 0; a < J.length; a++) Jint[a] += wS(0) * J[a];
    for (let f = 1; f <= F; f++) {
      expStep(e, th / F, vr, vi, nH);
      probs.push(P());
      J = instFlow();
      Jinst.push(Float32Array.from(J));
      for (let a = 0; a < J.length; a++) Jint[a] += wS(f) * J[a];
    }
    const end = probs[probs.length - 1];
    let n = 0; for (let i = 0; i < N; i++) n += end[i]; normErr = Math.max(normErr, Math.abs(n - 1));
    const net = new Float64Array(N); edges.forEach(([lo, hi], a) => { net[hi] += Jint[a]; net[lo] -= Jint[a]; });
    for (let i = 0; i < N; i++) contErr = Math.max(contErr, Math.abs(end[i] - start[i] - net[i]));
    const Jpeak = new Float32Array(edges.length);
    for (const Jf of Jinst) for (let a = 0; a < Jf.length; a++) Jpeak[a] = Math.max(Jpeak[a], Math.abs(Jf[a]));
    let peak = 0; for (const v of Jpeak) peak = Math.max(peak, v);
    flows.push({ edges, Jint, Jinst, Jpeak, peak });
    ops.push({ theta: th, kind: circ.ops[k].kind, nterms: circ.ops[k].terms.length, nedges: edges.length });
  }
  return { N, K, F, states, probs, amps, flows, ops, imagMax, checks: { normErr, contErr, herm } };
}

// ---------- spin order ----------
function spinOrb(q, nq, order) { const M = nq / 2; return order === 'blocked' ? [q % M, q >= M ? 1 : 0] : [q >> 1, q & 1]; }
function alphaMask(nq, order) { let m = 0; for (let q = 0; q < nq; q++) if (spinOrb(q, nq, order)[1] === 0) m |= 1 << q; return m; }
// operations that would change the number of α electrons under this spin order (a sign that the order is wrong)
function spinFlips(circ, order) { const a = alphaMask(circ.nq, order); return circ.ops.filter(op => op.terms.some(t => popcount(t.x & a) % 2)).length; }

// spin order: auto = the format's convention, unless that makes operations flip spin and the other order does not
function resolveOrder(circ, choice = 'auto') {
  const def = circ.fmt === 'qiskit' ? 'blocked' : 'interleaved', other = def === 'blocked' ? 'interleaved' : 'blocked';
  if (choice !== 'auto') return { order: choice, note: '' };
  if (spinFlips(circ, def) && !spinFlips(circ, other)) return { order: other, note: `auto chose ${other}: with ${def}, operations would flip spin` };
  return { order: def, note: '' };
}

if (typeof module !== 'undefined') module.exports = { parseCircuit, hfState, compute, parseComplex, popcount, spinOrb, spinFlips, resolveOrder };
