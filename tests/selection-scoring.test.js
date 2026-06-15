const assert = require('assert');
const { buildCycles } = require('../public/js/selection-rules.js');
const {
  mean,
  percentileScore,
  invertScore,
  noteScore,
  tauxScore,
  computeScoreGlobal,
  computeNiveauConfiance,
  scoreVarietes,
} = require('../public/js/selection-scoring.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── HELPERS DE BASE ──────────────────────────────────────────
test('mean: ignore les valeurs null/undefined', () => {
  assert.strictEqual(mean([10, null, 20, undefined]), 15);
  assert.strictEqual(mean([]), null);
  assert.strictEqual(mean([null]), null);
});

test('percentileScore: cohorte normale', () => {
  const cohort = [1000, 3000, 2000];
  assert.strictEqual(percentileScore(1000, cohort), 17); // dernier de 3
  assert.strictEqual(percentileScore(2000, cohort), 50); // median
  assert.strictEqual(percentileScore(3000, cohort), 83); // premier de 3
});

test('percentileScore: cohorte d\'un seul element = 50 par convention', () => {
  assert.strictEqual(percentileScore(500, [500]), 50);
});

test('percentileScore: valeur null = null', () => {
  assert.strictEqual(percentileScore(null, [1, 2, 3]), null);
});

test('invertScore / noteScore / tauxScore', () => {
  assert.strictEqual(invertScore(30), 70);
  assert.strictEqual(invertScore(null), null);
  assert.strictEqual(noteScore(4), 80);
  assert.strictEqual(noteScore(null), null);
  assert.strictEqual(tauxScore(0.2), 80);
  assert.strictEqual(tauxScore(1), 0);
  assert.strictEqual(tauxScore(null), null);
});

// ── SCORE GLOBAL : renormalisation ─────────────────────────────
test('computeScoreGlobal: renormalise sur les criteres disponibles', () => {
  const weights = { a: 10, b: 10, c: 10 };
  const r = computeScoreGlobal({ a: 100, b: null, c: 50 }, weights);
  assert.strictEqual(r.score, 75); // (100*10 + 50*10) / 20
  assert.strictEqual(r.nbCriteresDisponibles, 2);
  assert.strictEqual(r.nbCriteresTotal, 3);
});

test('computeScoreGlobal: tout indisponible = score null', () => {
  const weights = { a: 10, b: 10 };
  const r = computeScoreGlobal({ a: null, b: null }, weights);
  assert.strictEqual(r.score, null);
  assert.strictEqual(r.nbCriteresDisponibles, 0);
});

// ── NIVEAU DE CONFIANCE ──────────────────────────────────────
test('confiance: eleve si >=3 cycles et >=70% criteres', () => {
  const c = computeNiveauConfiance({ nbCycles: 3, nbCyclesAvecObservation: 1, noteGoutMoyen: 4, noteFaciliteMoyen: 4 },
    { nbCriteresDisponibles: 10, nbCriteresTotal: 13 });
  assert.strictEqual(c, 'elevee');
});

test('confiance: moyenne si 2 cycles meme avec peu de criteres', () => {
  const c = computeNiveauConfiance({ nbCycles: 2, nbCyclesAvecObservation: 0, noteGoutMoyen: null, noteFaciliteMoyen: null },
    { nbCriteresDisponibles: 3, nbCriteresTotal: 13 });
  assert.strictEqual(c, 'moyenne');
});

test('confiance: 1 cycle + donnees qualitatives completes = moyenne', () => {
  const c = computeNiveauConfiance({ nbCycles: 1, nbCyclesAvecObservation: 1, noteGoutMoyen: 5, noteFaciliteMoyen: 4 },
    { nbCriteresDisponibles: 8, nbCriteresTotal: 13 });
  assert.strictEqual(c, 'moyenne');
});

test('confiance: 1 cycle sans donnees qualitatives = faible', () => {
  const c = computeNiveauConfiance({ nbCycles: 1, nbCyclesAvecObservation: 0, noteGoutMoyen: null, noteFaciliteMoyen: null },
    { nbCriteresDisponibles: 8, nbCriteresTotal: 13 });
  assert.strictEqual(c, 'faible');
});

// ── scoreVarietes : cas synthetique (3 varietes, meme espece) ───
test('scoreVarietes: rendement eleve = score eleve, comparaison intra-espece', () => {
  const mkCycle = (overrides) => Object.assign({
    vegetal: 'X', espece: 'Tomate', famille: 'TOMATES', lieu: 'serre', annee: 2026,
    poidsTotal: 1000, poidsParPlant: null, poidsParM2: null,
    dureeProduction: 60, precociteJours: 80, regulariteCV: 0.2,
    poidsParJour: 10, rentabiliteJour: null,
    noteGout: null, noteFaciliteCulture: null,
    maladies: [], ravageurs: [], echec: false, observation: null,
  }, overrides);

  const cycles = [
    // Variete A : faible rendement, maladie observee, bonnes notes -> 1 cycle, qualitatif complet
    mkCycle({
      vegetal: 'Tomate Rose de Berne', poidsTotal: 1000,
      noteGout: 5, noteFaciliteCulture: 4,
      maladies: ['mildiou'], observation: { maladies: ['mildiou'] },
    }),
    // Variete B : fort rendement, aucune observation -> 1 cycle, pas de qualitatif
    mkCycle({ vegetal: 'Tomate Noire de Crimee', poidsTotal: 3000 }),
    // Variete C : rendement median, 2 cycles (2 annees), pas de maladie observee
    mkCycle({
      vegetal: 'Tomate Ananas', poidsTotal: 2000, annee: 2025,
      maladies: [], observation: { maladies: [], ravageurs: [], echec: false },
    }),
    mkCycle({
      vegetal: 'Tomate Ananas', poidsTotal: 2000, annee: 2026,
      maladies: [], observation: { maladies: [], ravageurs: [], echec: false },
    }),
  ];

  const results = scoreVarietes(cycles);
  const A = results.find(r => r.vegetal === 'Tomate Rose de Berne');
  const B = results.find(r => r.vegetal === 'Tomate Noire de Crimee');
  const C = results.find(r => r.vegetal === 'Tomate Ananas');

  // Rendement : B > C > A (percentile intra-espece)
  assert.strictEqual(A.sousScores.rendementTotal, 17);
  assert.strictEqual(C.sousScores.rendementTotal, 50);
  assert.strictEqual(B.sousScores.rendementTotal, 83);

  // Maladies : A penalisee, C non, B non disponible (pas d'observation)
  assert.strictEqual(A.sousScores.resistanceMaladies, 0);
  assert.strictEqual(C.sousScores.resistanceMaladies, 100);
  assert.strictEqual(B.sousScores.resistanceMaladies, null);

  // Gout : A=5/5 -> 100, B et C non renseignes -> null
  assert.strictEqual(A.sousScores.noteGout, 100);
  assert.strictEqual(B.sousScores.noteGout, null);

  // Confiance
  assert.strictEqual(A.confiance, 'moyenne');  // 1 cycle + qualitatif complet
  assert.strictEqual(B.confiance, 'faible');   // 1 cycle, rien d'autre
  assert.strictEqual(C.confiance, 'moyenne');  // 2 cycles

  // Score global toujours calculable malgre les criteres manquants
  [A, B, C].forEach(r => assert.ok(typeof r.scoreGlobal === 'number'));
});

// ── Intégration avec buildCycles (variete perpetuelle, 2 saisons) ─
test('integration: buildCycles -> scoreVarietes ne plante pas', () => {
  const calendrier = [{
    culture: 'Blette perez', famille: 'BLETTES & ÉPINARDS', lieu: 'serre',
    nbPlants: 2, estPerpetuelle: true,
  }];
  const recoltes = [
    { vegetal: 'Blette perez', lieu: 'serre', poids: 500, date: '2025-12-01', famille: 'BLETTES & ÉPINARDS' },
    { vegetal: 'Blette perez', lieu: 'serre', poids: 600, date: '2026-05-01', famille: 'BLETTES & ÉPINARDS' },
  ];

  const cycles = buildCycles(recoltes, calendrier, []);
  const results = scoreVarietes(cycles);

  assert.strictEqual(results.length, 1);
  const r = results[0];
  assert.strictEqual(r.nbCycles, 2);
  assert.strictEqual(r.confiance, 'moyenne');
  assert.ok(typeof r.scoreGlobal === 'number');
  // Espece "Blette" seule dans sa cohorte -> percentile = 50
  assert.strictEqual(r.sousScores.rendementTotal, 50);
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
