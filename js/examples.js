/* Example circuits offered by the "Example" buttons. */
const SAMPLE = `# ADAPT circuit of cyclobutadiene (6-31G, pi CAS(4,4)), OpenFermion QubitOperator, JW
# electrons: 4
0.143395116970049 | -0.125j [X0 Z1 X2 X4 Z5 Y6] +
-0.125j [X0 Z1 X2 Y4 Z5 X6] +
0.125j [X0 Z1 Y2 X4 Z5 X6] +
-0.125j [X0 Z1 Y2 Y4 Z5 Y6] +
-0.125j [X0 Z1 Z2 X3 X4 Z5 Z6 Y7] +
-0.125j [X0 Z1 Z2 X3 Y4 Z5 Z6 X7] +
0.125j [X0 Z1 Z2 Y3 X4 Z5 Z6 X7] +
-0.125j [X0 Z1 Z2 Y3 Y4 Z5 Z6 Y7] +
0.125j [Y0 Z1 X2 X4 Z5 X6] +
-0.125j [Y0 Z1 X2 Y4 Z5 Y6] +
0.125j [Y0 Z1 Y2 X4 Z5 Y6] +
0.125j [Y0 Z1 Y2 Y4 Z5 X6] +
0.125j [Y0 Z1 Z2 X3 X4 Z5 Z6 X7] +
-0.125j [Y0 Z1 Z2 X3 Y4 Z5 Z6 Y7] +
0.125j [Y0 Z1 Z2 Y3 X4 Z5 Z6 Y7] +
0.125j [Y0 Z1 Z2 Y3 Y4 Z5 Z6 X7] +
-0.125j [X1 X2 X5 Y6] +
-0.125j [X1 X2 Y5 X6] +
0.125j [X1 Y2 X5 X6] +
-0.125j [X1 Y2 Y5 Y6] +
-0.125j [X1 Z2 X3 X5 Z6 Y7] +
-0.125j [X1 Z2 X3 Y5 Z6 X7] +
0.125j [X1 Z2 Y3 X5 Z6 X7] +
-0.125j [X1 Z2 Y3 Y5 Z6 Y7] +
0.125j [Y1 X2 X5 X6] +
-0.125j [Y1 X2 Y5 Y6] +
0.125j [Y1 Y2 X5 Y6] +
0.125j [Y1 Y2 Y5 X6] +
0.125j [Y1 Z2 X3 X5 Z6 X7] +
-0.125j [Y1 Z2 X3 Y5 Z6 Y7] +
0.125j [Y1 Z2 Y3 X5 Z6 Y7] +
0.125j [Y1 Z2 Y3 Y5 Z6 X7]
-0.04764663768657396 | -0.25j [X0 X1 X6 Y7] +
-0.25j [X0 X1 Y6 X7] +
0.25j [X0 Y1 X6 X7] +
-0.25j [X0 Y1 Y6 Y7] +
0.25j [Y0 X1 X6 X7] +
-0.25j [Y0 X1 Y6 Y7] +
0.25j [Y0 Y1 X6 Y7] +
0.25j [Y0 Y1 Y6 X7]
-0.16191198503006193 | -0.25j [X2 X3 X4 Y5] +
-0.25j [X2 X3 Y4 X5] +
0.25j [X2 Y3 X4 X5] +
-0.25j [X2 Y3 Y4 Y5] +
0.25j [Y2 X3 X4 X5] +
-0.25j [Y2 X3 Y4 Y5] +
0.25j [Y2 Y3 X4 Y5] +
0.25j [Y2 Y3 Y4 X5]
0.12081683153665174 | 0.125j [X0 Z1 X2 X4 Z5 Y6] +
0.125j [X0 Z1 X2 Y4 Z5 X6] +
-0.125j [X0 Z1 Y2 X4 Z5 X6] +
0.125j [X0 Z1 Y2 Y4 Z5 Y6] +
0.125j [X0 Z1 Z2 X3 X5 Y6] +
0.125j [X0 Z1 Z2 X3 Y5 X6] +
-0.125j [X0 Z1 Z2 Y3 X5 X6] +
0.125j [X0 Z1 Z2 Y3 Y5 Y6] +
-0.125j [Y0 Z1 X2 X4 Z5 X6] +
0.125j [Y0 Z1 X2 Y4 Z5 Y6] +
-0.125j [Y0 Z1 Y2 X4 Z5 Y6] +
-0.125j [Y0 Z1 Y2 Y4 Z5 X6] +
-0.125j [Y0 Z1 Z2 X3 X5 X6] +
0.125j [Y0 Z1 Z2 X3 Y5 Y6] +
-0.125j [Y0 Z1 Z2 Y3 X5 Y6] +
-0.125j [Y0 Z1 Z2 Y3 Y5 X6] +
0.125j [X1 X2 X4 Z5 Z6 Y7] +
0.125j [X1 X2 Y4 Z5 Z6 X7] +
-0.125j [X1 Y2 X4 Z5 Z6 X7] +
0.125j [X1 Y2 Y4 Z5 Z6 Y7] +
0.125j [X1 Z2 X3 X5 Z6 Y7] +
0.125j [X1 Z2 X3 Y5 Z6 X7] +
-0.125j [X1 Z2 Y3 X5 Z6 X7] +
0.125j [X1 Z2 Y3 Y5 Z6 Y7] +
-0.125j [Y1 X2 X4 Z5 Z6 X7] +
0.125j [Y1 X2 Y4 Z5 Z6 Y7] +
-0.125j [Y1 Y2 X4 Z5 Z6 Y7] +
-0.125j [Y1 Y2 Y4 Z5 Z6 X7] +
-0.125j [Y1 Z2 X3 X5 Z6 X7] +
0.125j [Y1 Z2 X3 Y5 Z6 Y7] +
-0.125j [Y1 Z2 Y3 X5 Z6 Y7] +
-0.125j [Y1 Z2 Y3 Y5 Z6 X7]
-0.058543074025362796 | -0.25j [X0 X1 X4 Y5] +
-0.25j [X0 X1 Y4 X5] +
0.25j [X0 Y1 X4 X5] +
-0.25j [X0 Y1 Y4 Y5] +
0.25j [Y0 X1 X4 X5] +
-0.25j [Y0 X1 Y4 Y5] +
0.25j [Y0 Y1 X4 Y5] +
0.25j [Y0 Y1 Y4 X5]
-0.05310826851036111 | -0.25j [X2 X3 X6 Y7] +
-0.25j [X2 X3 Y6 X7] +
0.25j [X2 Y3 X6 X7] +
-0.25j [X2 Y3 Y6 Y7] +
0.25j [Y2 X3 X6 X7] +
-0.25j [Y2 X3 Y6 Y7] +
0.25j [Y2 Y3 X6 Y7] +
0.25j [Y2 Y3 Y6 X7]
-0.07082005307274113 | -0.5j [X2 Z3 Y4] +
0.5j [Y2 Z3 X4] +
-0.5j [X3 Z4 Y5] +
0.5j [Y3 Z4 X5]`;
const SAMPLE_H4 = `# H4 square (1.23 A, STO-3G), PennyLane AdaptiveOptimizer, printed with print(op)
BasisState(array([1, 1, 1, 1, 0, 0, 0, 0]), wires=[0, 1, 2, 3, 4, 5, 6, 7])
DoubleExcitation(tensor(0.30138976, requires_grad=True), wires=[2, 3, 6, 7])
DoubleExcitation(tensor(0.29365975, requires_grad=True), wires=[0, 1, 4, 5])
DoubleExcitation(tensor(0.2731495, requires_grad=True), wires=[0, 3, 4, 7])
DoubleExcitation(tensor(0.28657882, requires_grad=True), wires=[1, 2, 5, 6])
DoubleExcitation(tensor(-0.18579333, requires_grad=True), wires=[0, 3, 5, 6])
DoubleExcitation(tensor(-0.2015053, requires_grad=True), wires=[1, 2, 4, 7])
DoubleExcitation(tensor(0.36029326, requires_grad=True), wires=[2, 3, 4, 5])
DoubleExcitation(tensor(0.12728996, requires_grad=True), wires=[0, 1, 6, 7])
DoubleExcitation(tensor(0.27454371, requires_grad=True), wires=[2, 3, 4, 5])
DoubleExcitation(tensor(0.17294815, requires_grad=True), wires=[2, 3, 4, 5])
DoubleExcitation(tensor(-0.08627457, requires_grad=True), wires=[2, 3, 6, 7])
DoubleExcitation(tensor(-0.08142225, requires_grad=True), wires=[0, 1, 4, 5])`;
