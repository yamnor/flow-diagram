// Checks js/core.js against probabilities computed independently (run: node --test tests/).
// Fixtures:
//   cbd_*            cyclobutadiene, pi(4e,4o), 7 operations: the same circuit printed in four formats; reference =
//                   probabilities after each operation from the original matrices (scipy expm), keyed by bitstring q0..q7.
//   qiskit_h4_*     a real Qiskit Nature AdaptVQE run (H4 square, STO-3G), printed with print(theta, '|', op);
//                   reference = Qiskit Statevector probabilities (bit q of the index = qubit q).
//   pennylane_*     real PennyLane runs (gates and Pauli sums); reference = qml.probs re-indexed so that bit q = wire q.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseCircuit, hfState, compute, resolveOrder } = require('../js/core.js');

const fx = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const json = name => JSON.parse(fx(name));

// the app's run() without the DOM: parse, resolve the spin order, build HF, compute
function simulate(text, { electrons, hf } = {}) {
  const circ = parseCircuit(text);
  const { order } = resolveOrder(circ, 'auto');
  let b;
  if (hf) { b = 0; [...hf].forEach((ch, q) => { if (ch === '1') b |= 1 << q; }); circ.nq = Math.max(circ.nq, hf.length); }
  else b = hfState(circ.fmt, circ.nq, electrons ?? circ.electrons, order);
  return { circ, res: compute(circ, b), order };
}

// probabilities after operation k (k = 0: HF), as a Map bitstate -> p
function after(res, k) {
  const p = res.probs[k * res.F], m = new Map();
  res.states.forEach((b, i) => m.set(b, p[i]));
  return m;
}

function maxDiff(res, refAt, nOps) {
  let d = 0;
  for (let k = 0; k <= nOps; k++) {
    const got = after(res, k), ref = refAt(k);
    for (const [b, p] of ref) d = Math.max(d, Math.abs((got.get(b) || 0) - p));
    for (const [b, p] of got) if (!ref.has(b)) d = Math.max(d, p);
  }
  return d;
}

const indexed = probs => k => new Map(probs[k].map((p, b) => [b, p]).filter(([, p]) => p > 0));
const cbd = json('cbd_reference.json');
const cbdRef = k => new Map(cbd.bitstrings.map((s, i) => [[...s].reduce((b, ch, q) => b | (+ch << q), 0), cbd.probs[k][i]]));

for (const [name, opts] of [
  ['cbd_openfermion.txt', {}],
  ['cbd_openfermion_hermitian.txt', {}],
  ['cbd_pennylane_style.txt', {}],
  ['cbd_qiskit_style.txt', { hf: '11110000' }],
]) {
  test(`cyclobutadiene, ${name}`, () => {
    const { res } = simulate(fx(name), opts);
    assert.strictEqual(res.K, 7);
    assert.ok(maxDiff(res, cbdRef, 7) < 1e-8);
  });
}

test('Qiskit Nature AdaptVQE (H4), blocked spin order chosen automatically', () => {
  const ref = json('qiskit_h4_reference.json');
  const { res, order } = simulate(fx('qiskit_h4_print.txt'), { electrons: ref.electrons });
  assert.strictEqual(order, 'blocked');
  assert.ok(maxDiff(res, indexed(ref.probs), res.K) < 1e-8);
});

test('PennyLane gates (H4)', () => {
  const ref = json('pennylane_h4_reference.json');
  const { res } = simulate(fx('pennylane_h4_print.txt'), { electrons: ref.electrons });
  assert.strictEqual(res.K, ref.probs.length - 1);
  assert.ok(maxDiff(res, indexed(ref.probs), res.K) < 1e-8);
});

test('PennyLane Pauli sums (H4)', () => {
  const ref = json('pennylane_paulisum_reference.json');
  const { res } = simulate(fx('pennylane_paulisum_print.txt'), { electrons: ref.electrons });
  assert.ok(maxDiff(res, indexed(ref.probs), res.K) < 1e-8);
});

test('PennyLane symbolic printout (Adjoint) is refused with a hint', () => {
  assert.throws(() => parseCircuit(fx('pennylane_unsimplified_print.txt')), /simplify\(\)/);
});

test('flows conserve probability and the norm stays 1', () => {
  const { res } = simulate(fx('cbd_openfermion.txt'));
  assert.ok(res.checks.normErr < 1e-10);
  assert.ok(res.checks.contErr < 1e-6);
  assert.ok(res.checks.herm < 1e-12);
});

test('net flow of one operation equals the change of each probability', () => {
  const { res } = simulate(fx('cbd_openfermion.txt'));
  for (let k = 0; k < res.K; k++) {
    const net = new Float64Array(res.N);
    res.flows[k].edges.forEach(([lo, hi], a) => { net[hi] += res.flows[k].Jint[a]; net[lo] -= res.flows[k].Jint[a]; });
    const p0 = res.probs[k * res.F], p1 = res.probs[(k + 1) * res.F];
    for (let i = 0; i < res.N; i++) assert.ok(Math.abs(p1[i] - p0[i] - net[i]) < 1e-6);
  }
});
