/* Flow Diagram: user interface, drawing, export and share links. Uses the globals of core.js and examples.js. */
const $ = id => document.getElementById(id);
let R = null, frame = 0, fpos = 0, playing = false, clock = 0, lastT = 0, hover = -1, recorder = null, scrubbing = false;
const pins = [];
const BASE_FPS = 20, MAX_PINS = 4, PIN_DASH = [[], [6, 3], [2, 3], [8, 3, 2, 3]];
const FMT_NAME = { openfermion: 'OpenFermion', qiskit: 'Qiskit', pennylane: 'PennyLane Pauli sums', 'pennylane-gates': 'PennyLane gates' };

function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function rankColor(r) { return css('--r' + Math.min(r, 5)); }
const rankShort = r => ['HF', 'S', 'D', 'T', 'Q'][r] || r + '×';
const rankLong = r => ['HF reference', 'singles (S)', 'doubles (D)', 'triples (T)', 'quadruples (Q)'][r] || r + '-fold';
const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mixRgb = (a, b, s) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * s)).join(',')})`;
const bez = (p0, c, p2, s) => { const u = 1 - s; return [u * u * p0[0] + 2 * u * s * c[0] + s * s * p2[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p2[1]]; };
function toast(t, ms = 2200) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => { el.style.display = 'none'; }, ms); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

// ---------- reading the circuit: spin order, HF, names ----------
const bitsOf = (b, nq) => [...Array(nq)].map((_, q) => (b >> q) & 1).join('');
function orbName(p, homo) { return p <= homo ? (p === homo ? 'H' : `H−${homo - p}`) : (p === homo + 1 ? 'L' : `L+${p - homo - 1}`); }

// a configuration as an excitation from HF in HOMO/LUMO terms, e.g. "H² → L²", "Hα → L+1α"
function exLabel(b) {
  if (b === R.hf) return 'HF';
  const { nq } = R.circ, from = new Map(), to = new Map();
  for (let q = 0; q < nq; q++) {
    const h = (R.hf >> q) & 1, s = (b >> q) & 1; if (h === s) continue;
    const [p, sp] = spinOrb(q, nq, R.order), m = h ? from : to;
    m.set(p, (m.get(p) || '') + (sp ? 'β' : 'α'));
  }
  const fmt = m => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([p, s]) => orbName(p, R.homo) + (s.length === 2 ? '²' : s)).join(' ');
  return `${fmt(from)} → ${fmt(to)}`;
}
function occString(b) {
  const { nq } = R.circ, M = nq / 2; let s = '';
  for (let p = 0; p < M; p++) {
    let a = 0, bb = 0;
    for (let q = 0; q < nq; q++) { const [pp, sp] = spinOrb(q, nq, R.order); if (pp === p && (b >> q) & 1) sp ? bb = 1 : a = 1; }
    s += a && bb ? '2' : a ? '↑' : bb ? '↓' : '0';
  }
  return s;
}

function describeOps(res) {
  const keys = new Map(), { nq } = res.circ;
  return res.circ.ops.map(op => {
    const masks = [...new Set(op.terms.map(t => t.x))].filter(x => x);
    const rank = Math.max(1, ...masks.map(x => popcount(x) / 2));
    const x = masks[0] || 0, from = [], to = [];
    for (let q = 0; q < nq; q++) if ((x >> q) & 1) {
      const [p, sp] = spinOrb(q, nq, res.order), name = orbName(p, res.homo) + (sp ? 'β' : 'α');
      ((res.hf >> q) & 1 ? from : to).push(name);
    }
    const text = `${from.join(' ')} → ${to.join(' ')}${masks.length > 1 ? ' (+ spin partners)' : ''}`;
    const key = op.terms.map(t => `${t.x},${t.z},${t.c[0].toFixed(9)}`).sort().join(';');
    if (!keys.has(key)) keys.set(key, keys.size);
    return { rank, text, id: keys.get(key), theta: op.theta };
  });
}
function letter(n) { let s = ''; n++; while (n > 0) { n--; s = String.fromCharCode(97 + n % 26) + s; n = Math.floor(n / 26); } return s; }

function selectLine(line) {
  const ta = $('src'), lines = ta.value.split('\n');
  let start = 0; for (let i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
  const end = start + (lines[line - 1] || '').length;
  ta.focus(); ta.setSelectionRange(start, end);
  ta.scrollTop = Math.max(0, (line - 4) * 17.4);
}

// ---------- run ----------
function run(o = {}) {
  const msg = $('msg'); msg.className = 'msg'; msg.textContent = '';
  try {
    const t0 = performance.now();
    const circ = parseCircuit($('src').value);
    if (circ.electrons != null && $('nel').value === '' && !o.keepFields) $('nel').value = circ.electrons;
    const hfText = $('hf').value.trim() || circ.hf || '';
    if (hfText) {
      if (!/^[01]+$/.test(hfText)) throw new Error('the HF bitstring must be 0/1, qubit 0 first');
      circ.nq = Math.max(circ.nq, hfText.length + (hfText.length % 2));
    }
    const { order, note: autoNote } = resolveOrder(circ, $('order').value);
    let hf;
    if (hfText) { hf = 0; [...hfText].forEach((ch, q) => { if (ch === '1') hf |= 1 << q; }); }
    else {
      const ne = parseInt($('nel').value);
      if (!(ne >= 0)) { $('reading').hidden = false; $('nel').focus(); throw new Error('enter the number of electrons (or the HF bitstring) above the diagram'); }
      hf = hfState(circ.fmt, circ.nq, ne, order);
    }
    const res = compute(circ, hf);
    res.circ = circ; res.hf = hf; res.order = order; res.autoNote = autoNote; res.flips = spinFlips(circ, order);
    res.homo = -1; for (let q = 0; q < circ.nq; q++) if ((hf >> q) & 1) res.homo = Math.max(res.homo, spinOrb(q, circ.nq, order)[0]);
    res.rank = res.states.map(b => popcount(b ^ hf) / 2);
    res.desc = describeOps(res);
    layout(res);
    R = res;
    res.series = []; for (let fr = 0; fr <= res.K * res.F; fr++) res.series.push(rankWeights(res.probs[fr]));
    pins.length = 0; hover = -1; playing = false;
    renderReading(performance.now() - t0);
    drawChecks(); renderPins();
    ['share', 'png', 'svg', 'rec'].forEach(id => { $(id).disabled = false; });
    $('empty').style.display = 'none'; $('mapkey').hidden = false; $('side').hidden = false;
    if (!o.keepOpen) $('input').open = false;
    setFrame(o.frame || 0);
  } catch (e) {
    msg.className = 'msg err'; msg.textContent = e.message;
    $('input').open = true;
    if (e.line) selectLine(e.line);
  }
}

function renderReading(ms) {
  const c = R.circ, a = alphaMask(c.nq, R.order);
  $('reading').hidden = false;
  $('fmtchip').textContent = `${FMT_NAME[c.fmt] || c.fmt} · ${R.K} operations · ${c.nq} qubits · ${R.N} configurations · ${ms.toFixed(0)} ms`;
  $('hfinfo').textContent = `HF ${bitsOf(R.hf, c.nq)} = ${popcount(R.hf & a)}α ${popcount(R.hf & ~a)}β, ${R.order}${R.autoNote ? ' (' + R.autoNote + ')' : ''}`;
  const w = $('warn'); w.innerHTML = '';
  if (R.flips) {
    const other = R.order === 'blocked' ? 'interleaved' : 'blocked', ok = !spinFlips(c, other);
    w.textContent = `⚠ ${R.flips} of ${R.K} operations flip spin with the ${R.order} order${ok ? ` — the ${other} order fits` : ''}`;
    if (ok) { const b = document.createElement('button'); b.textContent = `use ${other}`; b.onclick = () => { $('order').value = other; run({ keepFields: true, frame }); }; w.appendChild(b); }
  }
  const first = $('src').value.split('\n').find(l => l.trim().startsWith('#'));
  $('sumtext').textContent = first ? first.replace(/^#\s*/, '') : `${R.K} operations`;
}

function layout(res) {
  const maxR = Math.max(...res.rank), groups = [];
  for (let r = 0; r <= maxR; r++) groups.push(res.states.map((b, i) => [b, i]).filter(([, i]) => res.rank[i] === r).sort((a, b) => a[0] - b[0]).map(x => x[1]));
  const live = groups.filter(g => g.length), gap = live.length > 1 ? 0.06 * 2 * Math.PI / live.length : 0;
  const total = 2 * Math.PI - gap * live.length, N = res.N;
  res.angle = new Float64Array(N); res.groups = groups; res.step = total / N;
  let a = 0;
  for (const g of live) { const w = total * g.length / N; g.forEach((i, n) => { res.angle[i] = a + w * (n + 0.5) / g.length; }); a += w + gap; }
  const off = -Math.PI / 2 - res.angle[0]; for (let i = 0; i < N; i++) res.angle[i] += off;  // HF at top
}

function setupCanvas(c) {
  const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return [ctx, w, h];
}
function geom(w, h) { const s = Math.min(w, h), rad = s * 0.35; return { cx: w / 2, cy: h / 2, rad, rmax: Math.min(rad * 0.16, Math.max(6, rad * Math.PI / Math.sqrt(R.N) * 0.9)) }; }
const opAt = fr => Math.min(R.K - 1, Math.floor(fr / R.F));
const LAST = () => R.K * R.F;

function setFrame(fr) {
  frame = Math.max(0, Math.min(LAST(), Math.round(fr))); fpos = frame;
  const k = opAt(frame), f = frame - k * R.F, d = R.desc[k];
  const what = (d, k) => `<b>${k + 1}</b> <span class="muted">[${letter(d.id)}]</span> ${rankShort(d.rank)} ${d.text} <span class="muted">· θ = ${d.theta.toFixed(4)}</span>`;
  $('oplabel').innerHTML = frame === LAST() ? `Final state after ${R.K} operations` :
    frame === 0 ? `HF reference <span class="muted">· next: operation</span> ${what(d, k)}` :
    `Operation ${what(d, k)} <span class="muted">· ${Math.round(100 * f / R.F)}%</span>`;
  drawStrip(); drawRanks(); drawPins();
}
const stepOp = dir => { if (!R) return; const k = frame / R.F; setFrame((dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1) * R.F); };

// ---------- the map (also used for PNG, SVG and video) ----------
function drawMap(ctx, w, h, o = {}) {
  const particles = o.particles !== false, net = o.net ?? $('net').checked;
  ctx.clearRect(0, 0, w, h);
  if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h); }
  const g = geom(w, h), k = opAt(frame), f = frame - k * R.F, p = R.probs[frame], amp = R.amps[frame];
  const pos = i => [g.cx + g.rad * Math.cos(R.angle[i]), g.cy + g.rad * Math.sin(R.angle[i])];
  const rgb = R.groups.map((_, r) => hex2rgb(rankColor(r))), cls = i => rgb[Math.min(R.rank[i], 5)];
  ctx.lineCap = 'butt'; ctx.setLineDash([]);
  ctx.lineWidth = 1; ctx.strokeStyle = css('--line'); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rad, 0, 2 * Math.PI); ctx.stroke();
  ctx.lineWidth = 3; ctx.globalAlpha = 0.75;
  R.groups.forEach((gr, r) => { if (!gr.length) return;
    ctx.strokeStyle = rankColor(r); ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rad, R.angle[gr[0]] - R.step / 2, R.angle[gr[gr.length - 1]] + R.step / 2); ctx.stroke(); });
  const fl = R.flows[k], peak = fl.peak, thr = (parseFloat($('thr').value) || 0) / 100 * peak, ink = css('--flow');
  const curve = (a, dir) => {
    const [lo, hi] = fl.edges[a], [from, to] = dir > 0 ? [lo, hi] : [hi, lo], p0 = pos(from), p2 = pos(to);
    const mx = (p0[0] + p2[0]) / 2, my = (p0[1] + p2[1]) / 2;
    return [p0, [mx + (g.cx - mx) * 0.35, my + (g.cy - my) * 0.35], p2, to, from];
  };
  const focus = o.hover ?? hover, dim = a => focus < 0 || fl.edges[a][0] === focus || fl.edges[a][1] === focus ? 1 : 0.12;
  if (peak > 1e-14 && frame < LAST()) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    for (let a = 0; a < fl.edges.length; a++) if (fl.Jpeak[a] >= thr) {
      ctx.globalAlpha = 0.10 * dim(a) * (focus >= 0 && dim(a) === 1 ? 3 : 1);
      const [p0, c, p2] = curve(a, 1); ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(...c, ...p2); ctx.stroke();
    }
    if (net) {
      let mxn = 0; for (const v of fl.Jint) mxn = Math.max(mxn, Math.abs(v));
      for (let a = 0; a < fl.edges.length; a++) {
        const v = fl.Jint[a]; if (mxn < 1e-14 || Math.abs(v) < 0.05 * mxn) continue;
        const [p0, c, p2, to, from] = curve(a, v), lw = 1 + 5 * Math.abs(v) / mxn;
        const grad = ctx.createLinearGradient(...p0, ...p2);
        grad.addColorStop(0, mixRgb(cls(from), cls(from), 0)); grad.addColorStop(1, mixRgb(cls(to), cls(to), 0));
        ctx.globalAlpha = (0.45 + 0.5 * Math.abs(v) / mxn) * dim(a); ctx.lineWidth = lw; ctx.strokeStyle = grad; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(...c, ...p2); ctx.stroke();
        const tx = p2[0] - c[0], ty = p2[1] - c[1], L = Math.hypot(tx, ty) || 1, ux = tx / L, uy = ty / L;
        const rT = g.rmax * Math.sqrt(p[to]) + 2, hx = p2[0] - ux * rT, hy = p2[1] - uy * rT, s = 4 + lw * 1.5;
        ctx.fillStyle = mixRgb(cls(to), cls(to), 0); ctx.beginPath(); ctx.moveTo(hx, hy);
        ctx.lineTo(hx - ux * s - uy * s * 0.5, hy - uy * s + ux * s * 0.5); ctx.lineTo(hx - ux * s + uy * s * 0.5, hy - uy * s - ux * s * 0.5); ctx.fill();
      }
      ctx.lineCap = 'butt';
    }
    if (particles) {
      // each active channel: a soft pipe whose width follows the flow now, and comets running along it;
      // more flow = wider pipe, more and faster comets. Comets point the way probability is moving.
      const Jf = fl.Jinst[f], ph = fl.phase || (fl.phase = new Float64Array(fl.edges.length)), panel = css('--panel');
      for (let a = 0; a < Jf.length; a++) {
        const v = Jf[a], m = Math.abs(v) / peak; if (fl.Jpeak[a] < thr || m < 0.02) continue;
        const [p0, c, p2, to, from] = curve(a, v), cf = cls(from), ct = cls(to);
        const grad = ctx.createLinearGradient(...p0, ...p2);
        grad.addColorStop(0, mixRgb(cf, cf, 0)); grad.addColorStop(1, mixRgb(ct, ct, 0));
        ctx.globalAlpha = (0.16 + 0.30 * m) * dim(a); ctx.strokeStyle = grad; ctx.lineWidth = 3 + 10 * m; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(...c, ...p2); ctx.stroke();
        const n = 1 + Math.round(3 * m), head = 3.5 + 3.5 * m, tail = 0.14 + 0.12 * m, segs = 10;
        for (let j = 0; j < n; j++) {
          const s = ((ph[a] + j / n) % 1 + 1) % 1;
          // tail: segments that thicken and brighten toward the head
          for (let q = 0; q < segs; q++) {
            const s0 = s - tail * (1 - q / segs), s1 = s - tail * (1 - (q + 1) / segs); if (s1 <= 0) continue;
            const A = bez(p0, c, p2, Math.max(0, s0)), B = bez(p0, c, p2, s1), u = (q + 1) / segs;
            ctx.globalAlpha = 0.95 * u * u * dim(a); ctx.strokeStyle = mixRgb(cf, ct, s1); ctx.lineWidth = head * 1.8 * u;
            ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
          }
          const [x, y] = bez(p0, c, p2, s);
          ctx.globalAlpha = dim(a); ctx.fillStyle = mixRgb(cf, ct, s); ctx.strokeStyle = panel; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, head, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
    }
  }
  // nodes: area = probability, color = sign of the amplitude
  const panel = css('--panel'), axis = css('--axis'), ccol = R.groups.map((_, r) => rankColor(r));
  for (let i = 0; i < R.N; i++) {
    const [x, y] = pos(i), r = Math.max(1.5, g.rmax * Math.sqrt(p[i])), col = ccol[Math.min(R.rank[i], 5)];
    ctx.globalAlpha = 1;
    if (Math.abs(amp[i]) < 1e-9) { ctx.fillStyle = axis; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 2 * Math.PI); ctx.fill(); continue; }
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 2 * Math.PI); ctx.fillStyle = panel; ctx.fill();   // surface ring
    if (amp[i] > 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }
    else { const lw = Math.max(1.4, Math.min(r * 0.42, 7)); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, r - lw / 2), 0, 2 * Math.PI); ctx.stroke(); }
  }
  // rings: pinned (with their dash) and hovered
  ctx.globalAlpha = 1; ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5;
  pins.forEach((i, n) => { const [x, y] = pos(i), r = Math.max(1.2, g.rmax * Math.sqrt(p[i])) + 4; ctx.setLineDash(PIN_DASH[n]); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke(); });
  ctx.setLineDash([]);
  if (focus >= 0 && !pins.includes(focus)) { const [x, y] = pos(focus), r = Math.max(1.2, g.rmax * Math.sqrt(p[focus])) + 4; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1; }
  // class names inside the circle
  ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  R.groups.forEach((gr, r) => { if (!gr.length || r === 0) return; const a = R.angle[gr[Math.floor(gr.length / 2)]], rr = g.rad - g.rmax - 16;
    const x = g.cx + rr * Math.cos(a), y = g.cy + rr * Math.sin(a);
    ctx.globalAlpha = 1; ctx.font = '700 13px system-ui'; ctx.fillStyle = rankColor(r); ctx.fillText(rankShort(r), x, y); ctx.font = '12px system-ui'; });
  // labels outside: pinned configurations and the largest ones
  const top = [...p.keys()].sort((a, b) => p[b] - p[a]).filter(i => p[i] > 0.02).slice(0, 4);
  const show = [...new Set([...pins, ...top])];
  ctx.font = '12px system-ui'; ctx.fillStyle = css('--ink');
  for (const i of show) {
    const a = R.angle[i], r = g.rad + Math.max(1.2, g.rmax * Math.sqrt(p[i])) + 8, c = Math.cos(a), sn = Math.sin(a);
    let x = g.cx + r * c, y = g.cy + r * sn;
    ctx.textAlign = Math.abs(c) < 0.3 ? 'center' : c > 0 ? 'left' : 'right';
    ctx.textBaseline = Math.abs(sn) < 0.3 ? 'middle' : sn > 0 ? 'top' : 'bottom';
    const t = exLabel(R.states[i]), tw = t.length * 6.5;
    if (ctx.textAlign === 'left') x = Math.min(x, w - tw - 4); else if (ctx.textAlign === 'right') x = Math.max(x, tw + 4); else x = Math.min(Math.max(x, tw / 2 + 4), w - tw / 2 - 4);
    ctx.globalAlpha = pins.includes(i) ? 1 : 0.8; ctx.fillText(t, x, y);
  }
  ctx.globalAlpha = 1;
}

function rankWeights(p) { const w = R.groups.map(() => 0); for (let i = 0; i < R.N; i++) w[R.rank[i]] += p[i]; return w; }

// shared x axis for the strip and the charts
const AX = { L: 44, Rr: 40 };
const xAt = (w, x) => AX.L + (w - AX.L - AX.Rr) * x / R.K;
const frameAtX = (w, x) => (x - AX.L) / (w - AX.L - AX.Rr) * LAST();
function playhead(ctx, w, y0, y1) { const xp = xAt(w, frame / R.F); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xp, y0); ctx.lineTo(xp, y1); ctx.stroke();
  ctx.fillStyle = css('--ink'); ctx.beginPath(); ctx.moveTo(xp - 5, y0); ctx.lineTo(xp + 5, y0); ctx.lineTo(xp, y0 + 6); ctx.fill(); }

function drawStrip() {
  const [ctx, w, h] = setupCanvas($('strip')); if (w < 80 || !h) return; ctx.clearRect(0, 0, w, h);
  const top = 34, y0 = top + (h - top) / 2, half = (h - top) / 2 - 4, cw = (w - AX.L - AX.Rr) / R.K;
  const tmax = Math.max(1e-12, ...R.desc.map(d => Math.abs(d.theta))), k = opAt(frame);
  if (frame > 0 && frame < LAST()) { ctx.fillStyle = css('--ink'); ctx.globalAlpha = 0.06; ctx.fillRect(xAt(w, k), top - 2, cw, h - top + 2); ctx.globalAlpha = 1; }
  ctx.strokeStyle = css('--base'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(AX.L, y0); ctx.lineTo(w - AX.Rr, y0); ctx.stroke();
  ctx.fillStyle = css('--axis'); ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('θ', AX.L - 8, y0);
  // re-selected operators: a bracket whose feet land on the two copies (orange when theta flips sign, with both bars
  // outlined and the operations in between shaded; gray bracket only otherwise), as in the paper figures
  const last = new Map(), pairs = [], edge = new Set();
  R.desc.forEach((d, i) => { if (last.has(d.id)) pairs.push([last.get(d.id), i]); last.set(d.id, i); });
  const barTop = i => { const bh = half * Math.abs(R.desc[i].theta) / tmax; return R.desc[i].theta >= 0 ? y0 - bh - 3 : y0 - (cw >= 13 ? 16 : 3); };
  // levels: shorter brackets low, a bracket sits above every shorter one it overlaps
  const lvl = pairs.map(() => 0);
  pairs.map((q, n) => n).sort((m, n) => (pairs[m][1] - pairs[m][0]) - (pairs[n][1] - pairs[n][0])).forEach((n, rank, ord) => {
    for (const m of ord.slice(0, rank)) if (pairs[m][0] < pairs[n][1] && pairs[n][0] < pairs[m][1]) lvl[n] = Math.max(lvl[n], lvl[m] + 1); });
  pairs.forEach(([j, i]) => { if (Math.sign(R.desc[i].theta) !== Math.sign(R.desc[j].theta)) {
    edge.add(i); edge.add(j);
    if (i - j > 1) { ctx.fillStyle = css('--sand'); ctx.globalAlpha = 0.09; ctx.fillRect(xAt(w, j + 1), top - 2, xAt(w, i) - xAt(w, j + 1), h - top + 2); ctx.globalAlpha = 1; } } });
  pairs.forEach(([j, i], n) => {
    const flip = Math.sign(R.desc[i].theta) !== Math.sign(R.desc[j].theta), col = flip ? css('--sand') : css('--muted');
    const xa = xAt(w, j) + cw / 2, xb = xAt(w, i) + cw / 2, yb = top - 8 - 6 * (lvl[n] % 4), r = Math.min(5, (xb - xa) / 3);
    const ya = barTop(j), ye = barTop(i);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = flip ? 1.8 : 1.1; ctx.globalAlpha = flip ? 0.95 : 0.6; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xa, yb + r); ctx.arcTo(xa, yb, xa + r, yb, r); ctx.lineTo(xb - r, yb);
    ctx.arcTo(xb, yb, xb, yb + r, r); ctx.lineTo(xb, ye - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xb, ye); ctx.lineTo(xb - 3.5, ye - 5); ctx.lineTo(xb + 3.5, ye - 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(xa, ya, flip ? 2.3 : 1.8, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
  });
  R.desc.forEach((d, i) => {
    const x = xAt(w, i), bw = Math.max(2, cw * 0.62), bh = half * Math.abs(d.theta) / tmax;
    ctx.fillStyle = rankColor(Math.min(d.rank, 5)); ctx.globalAlpha = i === k && frame > 0 && frame < LAST() ? 1 : 0.75;
    ctx.fillRect(x + (cw - bw) / 2, d.theta >= 0 ? y0 - bh : y0, bw, Math.max(1, bh)); ctx.globalAlpha = 1;
    if (edge.has(i)) { ctx.strokeStyle = css('--sand'); ctx.lineWidth = 1.2; ctx.strokeRect(x + (cw - bw) / 2, d.theta >= 0 ? y0 - bh : y0, bw, Math.max(1, bh)); }
    if (cw >= 13) { ctx.fillStyle = css('--axis'); ctx.textAlign = 'center'; ctx.textBaseline = d.theta >= 0 ? 'top' : 'bottom'; ctx.fillText(letter(d.id), x + cw / 2, d.theta >= 0 ? y0 + 2 : y0 - 2); }
  });
  playhead(ctx, w, top - 6, h);
}

function axes(ctx, w, h, T, B, ymax, fmt) {
  const ys = v => T + (h - T - B) * (1 - v / ymax);
  ctx.strokeStyle = css('--line'); ctx.fillStyle = css('--axis'); ctx.font = '11px system-ui'; ctx.lineWidth = 1;
  [0, 0.5, 1].forEach(v => { ctx.beginPath(); ctx.moveTo(AX.L, ys(v * ymax)); ctx.lineTo(w - AX.Rr, ys(v * ymax)); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(v * ymax), AX.L - 6, ys(v * ymax)); });
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(R.K / 12)); for (let k = 0; k <= R.K; k += step) ctx.fillText(k, xAt(w, k), h - B + 5);
  return ys;
}

function drawRanks() {
  const [ctx, w, h] = setupCanvas($('ranks')); if (w < 80 || !h) return; ctx.clearRect(0, 0, w, h);
  const ys = axes(ctx, w, h, 8, 20, 1, v => `${Math.round(v * 100)}%`);
  R.groups.forEach((gr, r) => { if (!gr.length) return; ctx.strokeStyle = rankColor(r); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    R.series.forEach((s, fr) => { const x = xAt(w, fr / R.F), y = ys(s[r]); fr ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
  // direct labels at the right end (only classes that ever carry weight), nudged apart
  const endW = R.series[R.series.length - 1], labs = R.groups.map((gr, r) => [r, ys(endW[r])]).filter(([r]) => R.groups[r].length && Math.max(...R.series.map(s => s[r])) > 0.005).sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < labs.length; i++) labs[i][1] = Math.max(labs[i][1], labs[i - 1][1] + 12);
  ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  labs.forEach(([r, y]) => { const x = w - AX.Rr + 6; ctx.fillStyle = rankColor(r); ctx.beginPath(); ctx.arc(x + 3, y, 3, 0, 2 * Math.PI); ctx.fill(); ctx.fillStyle = css('--muted'); ctx.fillText(rankShort(r), x + 9, y); });
  playhead(ctx, w, 2, h - 20);
  const wts = R.series[frame];
  $('legend').innerHTML = R.groups.map((gr, r) => gr.length ? `<span style="--c:${rankColor(r)}">${rankLong(r)} ${(100 * wts[r]).toFixed(1)}% <small>(${gr.length})</small></span>` : '').join('');
}

function drawPins() {
  if (!pins.length) return;
  const [ctx, w, h] = setupCanvas($('pinchart')); if (w < 80 || !h) return; ctx.clearRect(0, 0, w, h);
  let ymax = 0; for (const i of pins) for (const pr of R.probs) ymax = Math.max(ymax, pr[i]);
  ymax = niceMax(ymax);
  const ys = axes(ctx, w, h, 8, 20, ymax, v => `${+(v * 100).toPrecision(2)}%`);
  ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.6;
  pins.forEach((i, n) => { ctx.setLineDash(PIN_DASH[n]); ctx.beginPath();
    R.probs.forEach((pr, fr) => { const x = xAt(w, fr / R.F), y = ys(pr[i]); fr ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
  ctx.setLineDash([]);
  playhead(ctx, w, 2, h - 20);
  $('pinlist').querySelectorAll('[data-p]').forEach(el => { const i = +el.dataset.p, a = R.amps[frame][i];
    el.textContent = `P ${(100 * R.probs[frame][i]).toFixed(2)}%  c ${a >= 0 ? '+' : '−'}${Math.abs(a).toFixed(3)}`; });
}
function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * e) return m * e; return 10 * e; }

function renderPins() {
  $('pins').style.display = pins.length ? 'block' : 'none';
  $('pinlist').innerHTML = pins.map((i, n) => `<div><svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="currentColor" stroke-width="1.6" stroke-dasharray="${PIN_DASH[n].join(' ')}"/></svg>` +
    `<span>${exLabel(R.states[i])}</span><span class="muted">${occString(R.states[i])}</span><span data-p="${i}"></span><button data-u="${i}" aria-label="unpin">×</button></div>`).join('');
  $('pinlist').querySelectorAll('[data-u]').forEach(b => { b.onclick = () => togglePin(+b.dataset.u); });
  drawPins();
}
function togglePin(i) {
  const at = pins.indexOf(i);
  if (at >= 0) pins.splice(at, 1); else { if (pins.length >= MAX_PINS) pins.shift(); pins.push(i); }
  renderPins();
}

function drawChecks() {
  const c = R.checks, rows = [['Hermiticity of H (max |H − H†|)', c.herm, 1e-8], ['Normalization (max |‖c‖² − 1|)', c.normErr, 1e-8],
    [`Continuity (max |ΔP − Σ flow|), Simpson over ${R.F} steps`, c.contErr, 1e-4]];
  const ok = rows.every(([, v, t]) => v < t);
  $('checksum').textContent = ok ? 'Checks ✓ all passed' : '⚠ Checks: a check failed';
  $('checksum').className = ok ? '' : 'warn';
  $('checks').innerHTML = rows.map(([n, v, t]) => `<tr><td>${n}</td><td>${v.toExponential(1)} ${v < t ? '✓' : '⚠'}</td></tr>`).join('');
}

// ---------- export ----------
function compose(cnv) {
  const W = cnv.width, H = cnv.height, c = cnv.getContext('2d'), S = H - 40;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = css('--panel'); c.fillRect(0, 0, W, H);
  c.save(); c.translate(20, 20); drawMap(c, S, S, { bg: css('--panel'), hover: -1 }); c.restore();
  const x0 = S + 50, rw = W - x0 - 30; let y = 50;
  c.fillStyle = css('--ink'); c.font = '600 22px system-ui'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText('Flow Diagram', x0, y); y += 32;
  c.font = '17px system-ui'; c.fillStyle = css('--ink');
  c.fillText($('oplabel').textContent.replace(/\s+/g, ' ').trim().slice(0, 90), x0, y); y += 28;
  for (const id of ['strip', 'ranks'].concat(pins.length ? ['pinchart'] : [])) {
    const src = $(id); if (!src.width || !src.height || !src.clientWidth) continue;
    const hh = rw * src.clientHeight / src.clientWidth;
    c.drawImage(src, x0, y, rw, hh); y += hh + 16;
  }
  c.font = '15px system-ui'; c.fillStyle = css('--muted');
  const wts = R.series[frame];
  R.groups.forEach((gr, r) => { if (!gr.length) return; c.fillStyle = rankColor(r); c.beginPath(); c.arc(x0 + 6, y - 5, 5, 0, 2 * Math.PI); c.fill();
    c.fillStyle = css('--ink'); c.fillText(`${rankLong(r)} ${(100 * wts[r]).toFixed(1)}%`, x0 + 18, y); y += 22; });
  c.fillStyle = css('--muted'); c.font = '13px system-ui';
  c.fillText('circle area = probability · filled + / ring − amplitude · color = excitation class · streaks and arrows = probability moving', x0, H - 24);
}
function exportPNG() { const cnv = document.createElement('canvas'); cnv.width = 1800; cnv.height = 1000; compose(cnv); cnv.toBlob(b => download(b, `flow-diagram-frame${frame}.png`)); }

// a small canvas-like recorder that writes SVG, enough for drawMap
class SvgCtx {
  constructor(w, h) { Object.assign(this, { w, h, out: [], defs: [], d: '', globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', font: '12px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', dash: [] }); }
  n(v) { return +v.toFixed(2); }
  setTransform() {} clearRect() {} save() {} restore() {}
  setLineDash(d) { this.dash = d; }
  beginPath() { this.d = ''; }
  moveTo(x, y) { this.d += `M${this.n(x)} ${this.n(y)}`; }
  lineTo(x, y) { this.d += `L${this.n(x)} ${this.n(y)}`; }
  quadraticCurveTo(a, b, x, y) { this.d += `Q${this.n(a)} ${this.n(b)} ${this.n(x)} ${this.n(y)}`; }
  bezierCurveTo(a, b, c, d, x, y) { this.d += `C${[a, b, c, d, x, y].map(v => this.n(v)).join(' ')}`; }
  arc(x, y, r, a0, a1) {
    if (a1 - a0 >= 2 * Math.PI - 1e-9) { this.d += `M${this.n(x + r)} ${this.n(y)}A${this.n(r)} ${this.n(r)} 0 1 1 ${this.n(x - r)} ${this.n(y)}A${this.n(r)} ${this.n(r)} 0 1 1 ${this.n(x + r)} ${this.n(y)}Z`; return; }
    const sx = x + r * Math.cos(a0), sy = y + r * Math.sin(a0), ex = x + r * Math.cos(a1), ey = y + r * Math.sin(a1);
    this.d += `${this.d ? 'L' : 'M'}${this.n(sx)} ${this.n(sy)}A${this.n(r)} ${this.n(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${this.n(ex)} ${this.n(ey)}`;
  }
  col(s) { return typeof s === 'string' ? s : `url(#${s.id})`; }
  createLinearGradient(x0, y0, x1, y1) { const g = { id: 'g' + this.defs.length, x0, y0, x1, y1, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; this.defs.push(g); return g; }
  stroke() { if (this.d) this.out.push(`<path d="${this.d}" fill="none" stroke="${this.col(this.strokeStyle)}" stroke-width="${this.n(this.lineWidth)}" stroke-linecap="${this.lineCap}"${this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : ''} opacity="${this.n(this.globalAlpha)}"/>`); }
  fill() { if (this.d) this.out.push(`<path d="${this.d}" fill="${this.col(this.fillStyle)}" opacity="${this.n(this.globalAlpha)}"/>`); }
  fillRect(x, y, w, h) { this.out.push(`<rect x="${this.n(x)}" y="${this.n(y)}" width="${this.n(w)}" height="${this.n(h)}" fill="${this.col(this.fillStyle)}" opacity="${this.n(this.globalAlpha)}"/>`); }
  fillText(t, x, y) {
    const anchor = { center: 'middle', right: 'end', end: 'end' }[this.textAlign] || 'start';
    const base = { middle: 'central', top: 'hanging', bottom: 'text-after-edge' }[this.textBaseline] || 'alphabetic';
    const size = (this.font.match(/(\d+)px/) || [, 12])[1], esc = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.out.push(`<text x="${this.n(x)}" y="${this.n(y)}" font-family="system-ui, sans-serif" font-size="${size}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${this.col(this.fillStyle)}" opacity="${this.n(this.globalAlpha)}">${esc}</text>`);
  }
  toString() {
    const defs = this.defs.map(g => `<linearGradient id="${g.id}" gradientUnits="userSpaceOnUse" x1="${this.n(g.x0)}" y1="${this.n(g.y0)}" x2="${this.n(g.x1)}" y2="${this.n(g.y1)}">${g.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}"><defs>${defs}</defs>${this.out.join('')}</svg>`;
  }
}
function exportSVG() {
  const s = new SvgCtx(720, 720);
  drawMap(s, 720, 720, { particles: false, net: true, bg: css('--panel'), hover: -1 });
  download(new Blob([s.toString()], { type: 'image/svg+xml' }), `flow-diagram-frame${frame}.svg`);
}

function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast('This browser cannot record video.'); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const cnv = document.createElement('canvas'); cnv.width = 1600; cnv.height = 900;
  const chunks = [], rec = new MediaRecorder(cnv.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 6e6 } : {});
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => { const t = rec.mimeType || 'video/webm'; download(new Blob(chunks, { type: t }), `flow-diagram.${t.includes('mp4') ? 'mp4' : 'webm'}`); recorder = null; $('rec').textContent = 'Record video'; toast('Video saved'); };
  recorder = { rec, cnv, stop: () => rec.state !== 'inactive' && rec.stop() };
  setFrame(0); compose(cnv); rec.start(); playing = true; $('rec').textContent = '■ Stop recording'; updatePlay();
}

// ---------- share link: the circuit is compressed into the URL; nothing is sent anywhere ----------
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pack(str) {
  const bytes = new TextEncoder().encode(str);
  if (!window.CompressionStream) return 'u' + b64u(bytes);
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  let s = ''; const u = new Uint8Array(out); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
  return 'z' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack(s) {
  const bytes = unb64u(s.slice(1));
  if (s[0] === 'u') return new TextDecoder().decode(bytes);
  return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}
async function shareLink() {
  const state = JSON.stringify({ t: $('src').value, e: $('nel').value, o: $('order').value, h: $('hf').value });
  const hash = `#s=${await pack(state)}&f=${frame}${$('net').checked ? '&net' : ''}${pins.length ? '&p=' + pins.map(i => R.states[i]).join('.') : ''}`;
  const url = location.href.split('#')[0] + hash;
  if (url.length > 60000) { toast(`This circuit is too large for a link (${Math.round(url.length / 1000)} kB). Share the circuit text instead.`, 4000); return; }
  history.replaceState(null, '', hash);
  try { await navigator.clipboard.writeText(url); toast(location.protocol === 'file:' ? 'Link copied — it opens this file on this computer; host the page to share it' : 'Link copied'); }
  catch { window.prompt('Copy this link:', url); }
}
async function loadFromHash() {
  const h = location.hash;
  if (h.startsWith('#s=')) {
    try {
      const q = new URLSearchParams(h.slice(1)), st = JSON.parse(await unpack(q.get('s')));
      $('src').value = st.t; $('nel').value = st.e || ''; $('order').value = st.o || 'auto'; $('hf').value = st.h || '';
      $('net').checked = q.has('net'); run({ keepFields: true, frame: +q.get('f') || 0 });
      if (R && q.get('p')) q.get('p').split('.').map(Number).forEach(b => { const i = R.states.indexOf(b); if (i >= 0) togglePin(i); });
    } catch (e) { toast('Could not read the circuit in this link'); }
  } else if (h.startsWith('#example')) {
    $(h.startsWith('#example2') ? 'sample2' : 'sample').click();
    if (/\/net\b/.test(h)) $('net').checked = true;
    const m = h.match(/op=(\d+)/); if (m && R) setFrame((+m[1] - 1) * R.F + R.F / 2);
  }
}

// ---------- animation loop and input ----------
function updatePlay() { $('play').textContent = playing ? '❚❚ Pause' : '▶ Play'; }
function tick(t) {
  requestAnimationFrame(tick);
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
  if (!R) return;
  clock += dt;
  if (playing) {
    fpos += dt * BASE_FPS * (+$('speed').value || 1);
    if (fpos >= LAST()) { fpos = LAST(); playing = false; updatePlay(); }
    if (Math.floor(fpos) !== frame) { const keep = fpos; setFrame(Math.floor(fpos)); fpos = keep; }
  }
  if (frame < LAST()) {
    const k = opAt(frame), fl = R.flows[k], Jf = fl.Jinst[frame - k * R.F], ph = fl.phase || (fl.phase = new Float64Array(fl.edges.length));
    for (let a = 0; a < Jf.length; a++) ph[a] += dt * (0.12 + 0.5 * Math.abs(Jf[a]) / (fl.peak || 1));
  }
  const [ctx, w, h] = setupCanvas($('map')); if (w > 40 && h > 40) drawMap(ctx, w, h);
  if (recorder) { compose(recorder.cnv); if (!playing) recorder.stop(); }
}
requestAnimationFrame(tick);

$('go').onclick = () => run();
$('sample').onclick = () => { $('src').value = SAMPLE; $('nel').value = 4; $('hf').value = ''; $('order').value = 'auto'; run(); };
$('sample2').onclick = () => { $('src').value = SAMPLE_H4; $('nel').value = ''; $('hf').value = ''; $('order').value = 'auto'; run(); };
['nel', 'hf', 'order'].forEach(id => $(id).addEventListener('change', () => { if ($('src').value.trim()) run({ keepFields: true, frame: R ? frame : 0 }); }));
$('restart').onclick = () => { if (!R) return; setFrame(0); playing = true; updatePlay(); };
$('play').onclick = () => { if (!R) return; playing = !playing; if (playing && frame >= LAST()) setFrame(0); updatePlay(); };
$('prev').onclick = () => stepOp(-1);
$('next').onclick = () => stepOp(1);
$('unpin').onclick = () => { pins.length = 0; renderPins(); };
$('png').onclick = exportPNG; $('svg').onclick = exportSVG; $('rec').onclick = toggleRecord; $('share').onclick = shareLink;
document.addEventListener('keydown', e => {
  if (!R || e.target.closest?.('textarea, input, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); $('restart').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); playing = false; updatePlay(); e.shiftKey ? setFrame(frame + 1) : stepOp(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); playing = false; updatePlay(); e.shiftKey ? setFrame(frame - 1) : stepOp(-1); }
  else if (e.key === 'Home') { e.preventDefault(); setFrame(0); }
  else if (e.key === 'End') { e.preventDefault(); setFrame(LAST()); }
});
// scrubbing on the strip and the charts
for (const id of ['strip', 'ranks', 'pinchart']) {
  const c = $(id);
  const go = e => { const r = c.getBoundingClientRect(); setFrame(frameAtX(r.width, e.clientX - r.left)); };
  c.addEventListener('pointerdown', e => { if (!R) return; scrubbing = true; playing = false; updatePlay(); c.setPointerCapture(e.pointerId); go(e); });
  c.addEventListener('pointermove', e => { if (scrubbing) go(e); });
  c.addEventListener('pointerup', () => { scrubbing = false; });
}
$('strip').addEventListener('mousemove', ev => {
  if (!R || scrubbing) { $('tip2').style.display = 'none'; return; }
  const rect = $('strip').getBoundingClientRect(), x = ev.clientX - rect.left, k = Math.floor((x - AX.L) / (rect.width - AX.L - AX.Rr) * R.K), tip = $('tip2');
  if (k < 0 || k >= R.K) { tip.style.display = 'none'; return; }
  const d = R.desc[k], same = R.desc.map((e, i) => e.id === d.id && i !== k ? i + 1 : 0).filter(Boolean);
  tip.textContent = `op ${k + 1} [${letter(d.id)}] ${rankShort(d.rank)} ${d.text}  θ = ${d.theta.toFixed(4)}${same.length ? '  · same operator as op ' + same.join(', ') : ''}`;
  tip.style.display = 'block'; tip.style.left = Math.max(0, Math.min(x + 12, rect.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = (ev.clientY - rect.top + 14) + 'px';
});
$('strip').addEventListener('mouseleave', () => { $('tip2').style.display = 'none'; });
$('ranks').addEventListener('mousemove', ev => {
  const tip = $('tip3'); if (!R || scrubbing) { tip.style.display = 'none'; return; }
  const rect = $('ranks').getBoundingClientRect(), x = ev.clientX - rect.left, fr = Math.round(frameAtX(rect.width, x));
  if (fr < 0 || fr > LAST()) { tip.style.display = 'none'; return; }
  const wts = R.series[fr], at = fr === LAST() ? 'final' : fr === 0 ? 'HF' : `op ${opAt(fr) + 1}, ${Math.round(100 * (fr - opAt(fr) * R.F) / R.F)}%`;
  tip.innerHTML = `${at}<br>` + R.groups.map((gr, r) => gr.length ? `<span style="color:${rankColor(r)}">●</span> ${rankShort(r)} ${(100 * wts[r]).toFixed(1)}%` : '').filter(Boolean).join('  ');
  tip.style.display = 'block'; tip.style.left = Math.max(0, Math.min(x + 12, rect.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = '4px';
});
$('ranks').addEventListener('mouseleave', () => { $('tip3').style.display = 'none'; });
// hover and pin on the map
function nodeAt(ev) {
  const rect = $('map').getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top, g = geom(rect.width, rect.height);
  let best = -1, bd = 1e9;
  for (let i = 0; i < R.N; i++) { const d = Math.hypot(x - g.cx - g.rad * Math.cos(R.angle[i]), y - g.cy - g.rad * Math.sin(R.angle[i])); if (d < bd) { bd = d; best = i; } }
  return [bd <= Math.max(10, g.rmax * Math.sqrt(R.probs[frame][best]) + 4) ? best : -1, x, y, rect];
}
$('map').addEventListener('mousemove', ev => {
  if (!R) return;
  const [i, x, y, rect] = nodeAt(ev), tip = $('tip'); hover = i; $('map').style.cursor = i >= 0 ? 'pointer' : 'default';
  if (i < 0) { tip.style.display = 'none'; return; }
  const b = R.states[i], a = R.amps[frame][i];
  tip.innerHTML = `${exLabel(b)}  <span style="color:var(--muted)">${occString(b)} · ${bitsOf(b, R.circ.nq)}</span><br>c = ${a >= 0 ? '+' : '−'}${Math.abs(a).toFixed(4)}   P = ${(100 * R.probs[frame][i]).toFixed(2)}%   ${pins.includes(i) ? 'click to unpin' : 'click to pin'}`;
  tip.style.display = 'block'; tip.style.left = Math.max(0, Math.min(x + 12, rect.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = Math.min(y + 12, rect.height - 40) + 'px';
});
$('map').addEventListener('mouseleave', () => { hover = -1; $('tip').style.display = 'none'; });
$('map').addEventListener('click', ev => { if (!R) return; const [i] = nodeAt(ev); if (i >= 0) togglePin(i); });
window.addEventListener('resize', () => { if (R) setFrame(frame); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (R) setFrame(frame); });
loadFromHash();
window.addEventListener('hashchange', loadFromHash);
