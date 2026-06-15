const assert = require('assert');
const { detecterTendance, linearRegressionSlope } = require('../public/js/selection-tendances.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function mkCycle(saisonId, poidsTotal) { return { saisonId, poidsTotal }; }

test('linearRegressionSlope: croissance lineaire', () => {
  assert.strictEqual(linearRegressionSlope([1000, 1250, 1500]), 250);
});
test('linearRegressionSlope: une seule valeur = null', () => {
  assert.strictEqual(linearRegressionSlope([1000]), null);
});

test('tendance: 1 seul cycle = indeterminee', () => {
  const r = detecterTendance([mkCycle('ete-2026', 1000)]);
  assert.strictEqual(r.type, 'indetermine');
});

test('tendance: progression nette sur 3 saisons', () => {
  const cycles = [
    mkCycle('ete-2024', 1000),
    mkCycle('ete-2025', 1200),
    mkCycle('ete-2026', 1500),
  ];
  const r = detecterTendance(cycles);
  assert.strictEqual(r.type, 'progression');
  assert.ok(r.penteRelative > 0.10);
});

test('tendance: regression nette sur 3 saisons', () => {
  const cycles = [
    mkCycle('ete-2024', 1500),
    mkCycle('ete-2025', 1200),
    mkCycle('ete-2026', 1000),
  ];
  const r = detecterTendance(cycles);
  assert.strictEqual(r.type, 'regression');
  assert.ok(r.penteRelative < -0.10);
});

test('tendance: instable prevaut sur la pente', () => {
  const cycles = [
    mkCycle('ete-2024', 1000),
    mkCycle('ete-2025', 2000),
    mkCycle('ete-2026', 500),
  ];
  const r = detecterTendance(cycles);
  assert.strictEqual(r.type, 'instable');
});

test('tendance: stable si variation faible', () => {
  const cycles = [
    mkCycle('ete-2024', 1000),
    mkCycle('ete-2025', 1050),
    mkCycle('ete-2026', 1020),
  ];
  const r = detecterTendance(cycles);
  assert.strictEqual(r.type, 'stable');
});

test('tendance: tri chronologique meme si cycles desordonnes en entree', () => {
  const cycles = [
    mkCycle('ete-2026', 1500),
    mkCycle('ete-2024', 1000),
    mkCycle('ete-2025', 1200),
  ];
  const r = detecterTendance(cycles);
  assert.strictEqual(r.type, 'progression');
});

// ── Exécution ────────────────────────────────────────────────
let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('  PASS  ' + t.name);
  } catch (e) {
    failed++;
    console.log('  FAIL  ' + t.name);
    console.log('        ' + e.message);
  }
}
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' tests passes');
if (failed > 0) process.exit(1);
