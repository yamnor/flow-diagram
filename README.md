# Flow Diagram

Flow Diagram replays an ADAPT-VQE circuit one operation at a time and shows how each operation moves probability between electron configurations.

Paste the operators and angles of a circuit; the page simulates the state vector exactly and draws:

- **the configurations** (determinants) reached by the circuit, placed on a circle and grouped by their excitation level from the Hartree–Fock (HF) determinant (S, D, T, Q);
- **the state** after each operation: node area = probability, filled / open = positive / negative amplitude;
- **the flow** of each operation: arrows for the net probability it carries from one configuration to another, and moving streaks for the flow at each moment during the operation.

Everything runs in the browser. Nothing is uploaded; a shared link carries the circuit in the URL fragment (`#…`), which browsers do not send to the server.

## Use

Open `index.html` in a browser (no build step, no dependencies), or serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>, paste a circuit, and press **Draw**. The two **Example** buttons load a cyclobutadiene circuit and an H₄ circuit in which one operator is selected several times.

Controls: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> previous/next operation, <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> one frame, <kbd>R</kbd> from the start. Click a configuration to follow its probability. **PNG**, **SVG** and **Record video** save the current view.

## Input

Jordan–Wigner encoded operators only. Each operation is either `U = exp(−iθH)` with a Hermitian Pauli sum (real coefficients) or `U = exp(θA)` with an anti-Hermitian one (imaginary coefficients, such as `jordan_wigner(T − T†)`). One block per operation, `angle | operator`:

```python
# OpenFermion
for theta, gen in zip(thetas, generators):   # gen = T - T^dagger
    print(theta, '|', jordan_wigner(gen))

# Qiskit (SparsePauliOp; the rightmost letter of a label is qubit 0)
for theta, op in zip(thetas, operators):
    print(theta, '|', op)

# PennyLane, Pauli sums
for theta, op in zip(thetas, qubit_ops):
    print(theta, '|', op.simplify())

# PennyLane, gates as printed (no "angle |" needed)
for op in tape.operations:                   # BasisState(...), DoubleExcitation(θ, wires=[...]), ...
    print(op)
```

Give the number of electrons (or a line `# electrons: 4`), or the HF bitstring with qubit 0 first. The spin order (α β α β … or α … α β … β) follows the convention of each library; `auto` switches to the other order if the default one would make operations flip spin.

## What the flow is

During operation *k* the state is **c**(λ) = exp(λθ<sub>k</sub>A<sub>k</sub>) **c**<sup>(k−1)</sup>, λ ∈ [0, 1]. The rate of change of the probability of configuration *i* splits into contributions from each configuration *j*,

J<sub>j→i</sub>(λ) = 2θ<sub>k</sub> Re[c<sub>i</sub>(λ)* (A<sub>k</sub>)<sub>ij</sub> c<sub>j</sub>(λ)],

and the net flow of the operation is Q<sub>ij</sub> = ∫₀¹ J<sub>j→i</sub>(λ) dλ (positive: from *j* to *i*). The streaks show J at the current frame; the arrows show Q. The page integrates with Simpson's rule over 24 steps per operation and reports, under **Checks**, the Hermiticity of the generators, the norm of the state, and the continuity error max |ΔP<sub>i</sub> − Σ<sub>j</sub>Q<sub>ij</sub>|.

## Files

| Path | Contents |
|---|---|
| `index.html` | page markup |
| `css/style.css` | styles (light and dark) |
| `js/core.js` | parsing of the input formats and the state-vector and flow computation; no DOM, also loads in Node |
| `js/examples.js` | the example circuits |
| `js/app.js` | user interface, drawing, export and share links |
| `tests/` | checks of `js/core.js` against Qiskit, PennyLane and matrix-exponential references |

## Tests

```bash
node --test tests/
```

The fixtures are circuits printed by OpenFermion, Qiskit Nature and PennyLane, with the probabilities after every operation computed by each library's own simulator (or by the matrix exponential of the generator). Node 18 or later.

## License

MIT License. See [LICENSE](LICENSE).
