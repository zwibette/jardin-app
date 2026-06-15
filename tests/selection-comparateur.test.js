const assert = require('assert');
const { comparerVarietes, critereDifferenciant, phraseComparaison } = require('../public/js/selection-comparateur.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function mkResult(vegetal, scoreGlobal, sousScores) {
  return { vegetal, scoreGlobal, sousScores };
}

test('comparerVarietes: null si moins de 2 varietes', () => {
  assert.strictEqual(comparerVarietes([mkResult('A', 50, {})]), null);
});

test('comparerVarietes: classement par score global decroissant', () => {
  const A = mkResult('A', 40, { rendementTotal: 40 });
  const B = mkResult('B', 80, { rendementTotal: 80 });
  const r = comparerVarietes([A, B]);
  assert.strictEqual(r.leader.vegetal, 'B');
  assert.deepStrictEqual(r.classement.map(c => c.vegetal), ['B', 'A']);
});

test('critereDifferenciant: identifie le plus grand ecart', () => {
  const leader = mkResult('B', 80, { rendementTotal: 80, resistanceMaladies: 60 });
  const other  = mkResult('A', 40, { rendementTotal: 30, resistanceMaladies: 55 });
  const d = critereDifferenciant(leader, other);
  assert.strictEqual(d.cle, 'rendementTotal');
  assert.strictEqual(d.diff, 50);
});

test('critereDifferenciant: ignore les criteres non disponibles', () => {
  const leader = mkResult('B', 80, { rendementTotal: null, resistanceMaladies: 60 });
  const other  = mkResult('A', 40, { rendementTotal: 30, resistanceMaladies: 55 });
  const d = critereDifferenciant(leader, other);
  assert.strictEqual(d.cle, 'resistanceMaladies');
});

test('phraseComparaison: mentionne le critere et les scores', () => {
  const leader = mkResult('Rose de Berne', 75, { resistanceMaladies: 90, rendementTotal: 60 });
  const other  = mkResult('Noire de Crimee', 55, { resistanceMaladies: 55, rendementTotal: 60 });
  const p = phraseComparaison(leader, other);
  assert.ok(p.includes('Rose de Berne devance Noire de Crimee'));
  assert.ok(p.includes('Résistance aux maladies'));
  assert.ok(p.includes('+35 pts'));
  assert.ok(p.includes('75 contre 55'));
});

test('phraseComparaison: fallback si aucun critere commun favorable', () => {
  const leader = mkResult('B', 80, { rendementTotal: 50 });
  const other  = mkResult('A', 40, { rendementTotal: 60 });
  const p = phraseComparaison(leader, other);
  assert.strictEqual(p, 'B devance A (score global 80 contre 40).');
});

test('comparerVarietes: integration sur 3 varietes', () => {
  const A = mkResult('A', 30, { rendementTotal: 20, resistanceMaladies: 30 });
  const B = mkResult('B', 70, { rendementTotal: 80, resistanceMaladies: 60 });
  const C = mkResult('C', 50, { rendementTotal: 50, resistanceMaladies: 50 });
  const r = comparerVarietes([A, B, C]);
  assert.strictEqual(r.leader.vegetal, 'B');
  assert.strictEqual(r.phrases.length, 2);
  r.phrases.forEach(p => assert.ok(p.startsWith('B devance')));
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
