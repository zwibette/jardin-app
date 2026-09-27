const assert = require('assert');
const {
  getSaisonFromDate,
  getEspece,
  isPerpetuelle,
  buildCycles,
  saisonSortKey,
} = require('../public/js/selection-rules.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── getSaisonFromDate ────────────────────────────────────────
test('saison: 2 février = été (début de saison été)', () => {
  assert.strictEqual(getSaisonFromDate('2026-02-02').id, 'ete-2026');
});
test('saison: 1er février = hiver (fin de saison hiver)', () => {
  assert.strictEqual(getSaisonFromDate('2026-02-01').id, 'hiver-2025-2026');
});
test('saison: septembre = début hiver', () => {
  assert.strictEqual(getSaisonFromDate('2025-09-01').id, 'hiver-2025-2026');
});
test('saison: 31 août = fin été', () => {
  assert.strictEqual(getSaisonFromDate('2026-08-31').id, 'ete-2026');
});
test('saison: janvier = hiver de l\'année précédente', () => {
  assert.strictEqual(getSaisonFromDate('2026-01-15').id, 'hiver-2025-2026');
});
test('saison: date vide = null', () => {
  assert.strictEqual(getSaisonFromDate(null), null);
});

// ── saisonSortKey ─────────────────────────────────────────────
test('saisonSortKey: ordre chronologique ete < hiver suivant < ete suivant', () => {
  const ete2025 = saisonSortKey('ete-2025');
  const hiver2025 = saisonSortKey('hiver-2025-2026');
  const ete2026 = saisonSortKey('ete-2026');
  assert.ok(ete2025 < hiver2025);
  assert.ok(hiver2025 < ete2026);
});

// ── getEspece ─────────────────────────────────────────────────
test('espece: cas standard (premier mot)', () => {
  assert.strictEqual(getEspece('Tomate cœur de bœuf'), 'Tomate');
  assert.strictEqual(getEspece('Chou pak choï perez'), 'Chou');
});
test('espece: table de correction (Salade)', () => {
  assert.strictEqual(getEspece('Feuille chêne rouge perez'), 'Salade');
  assert.strictEqual(getEspece("Laitue romaine d'Avignon"), 'Salade');
});
test('espece: table de correction (cas ambigus)', () => {
  assert.strictEqual(getEspece('Nero di toscana'), 'Chou');
  assert.strictEqual(getEspece('Mange-tout norli'), 'Pois');
  assert.strictEqual(getEspece('Butternut'), 'Courge');
});

// ── isPerpetuelle ─────────────────────────────────────────────
test('perpetuelle: liste connue', () => {
  assert.strictEqual(isPerpetuelle('Ciboulette perez', null), true);
  assert.strictEqual(isPerpetuelle('Blette perez', null), true);
});
test('perpetuelle: variété annuelle', () => {
  assert.strictEqual(isPerpetuelle('Tomate cerise sweet baby', null), false);
});
test('perpetuelle: flag calendrier prioritaire', () => {
  assert.strictEqual(isPerpetuelle('Variete inconnue', { estPerpetuelle: true }), true);
});

// ── buildCycles : mono-lieu, non-perpétuelle, avec calendrier ──
test('cycles: mono-lieu non-perpetuelle complete', () => {
  const calendrier = [{
    culture: 'Tomate cerise sweet baby', famille: 'TOMATES', lieu: 'serre',
    semis: '2026-02-01', plantation: '2026-03-20', nbPlants: 4,
    recolteDebut: '2026-06-01', recolteFin: '2026-10-31', estPerpetuelle: false,
  }];
  const recoltes = [
    { vegetal: 'Tomate cerise sweet baby', lieu: 'serre', poids: 300, date: '2026-06-10', famille: 'TOMATES' },
    { vegetal: 'Tomate cerise sweet baby', lieu: 'serre', poids: 450, date: '2026-07-05', famille: 'TOMATES' },
    { vegetal: 'Tomate cerise sweet baby', lieu: 'serre', poids: 500, date: '2026-08-01', famille: 'TOMATES' },
  ];

  const cycles = buildCycles(recoltes, calendrier, []);
  assert.strictEqual(cycles.length, 1);
  const c = cycles[0];

  assert.strictEqual(c.saisonId, 'ete-2026'); // saison de la date de plantation
  assert.strictEqual(c.espece, 'Tomate');
  assert.strictEqual(c.nbPlants, 4);
  assert.strictEqual(c.estPerpetuelle, false);
  assert.strictEqual(c.poidsTotal, 1250);
  assert.strictEqual(c.nbRecoltes, 3);
  assert.strictEqual(c.poidsParPlant, 313); // 1250/4 = 312.5 -> 313
  assert.strictEqual(c.premiereRecolte, '2026-06-10');
  assert.strictEqual(c.derniereRecolte, '2026-08-01');
  assert.strictEqual(c.precociteJours, 82);   // plantation -> 1ere recolte
  assert.strictEqual(c.joursOccupation, 135); // plantation -> derniere recolte +1
  assert.strictEqual(c.dureeProduction, 52);  // 1ere -> derniere recolte
  assert.ok(c.regulariteCV > 0 && c.regulariteCV < 1);
});

// ── buildCycles : multi-lieu ────────────────────────────────────
test('cycles: meme variete, deux lieux = deux cycles distincts', () => {
  const calendrier = [{
    culture: 'Courgette zuboda', famille: 'COURGETTES', lieu: 'bacs',
    semis: '2026-03-15', plantation: '2026-04-20', nbPlants: 2,
  }];
  const recoltes = [
    { vegetal: 'Courgette zuboda', lieu: 'bacs', poids: 300, date: '2026-05-20', famille: 'COURGETTES' },
    { vegetal: 'Courgette zuboda', lieu: 'jardin', poids: 200, date: '2026-06-01', famille: 'COURGETTES' },
  ];

  const cycles = buildCycles(recoltes, calendrier, []);
  assert.strictEqual(cycles.length, 2);
  const lieux = cycles.map(c => c.lieu).sort();
  assert.deepStrictEqual(lieux, ['bacs', 'jardin']);
  cycles.forEach(c => assert.strictEqual(c.poidsTotal > 0, true));
});

// ── buildCycles : perpétuelle sur plusieurs saisons ─────────────
test('cycles: variete perpetuelle = un cycle par saison de recolte', () => {
  const calendrier = [{
    culture: 'Blette perez', famille: 'BLETTES & ÉPINARDS', lieu: 'serre',
    nbPlants: 2, estPerpetuelle: true,
  }];
  const recoltes = [
    { vegetal: 'Blette perez', lieu: 'serre', poids: 500, date: '2025-12-01', famille: 'BLETTES & ÉPINARDS' },
    { vegetal: 'Blette perez', lieu: 'serre', poids: 600, date: '2026-05-01', famille: 'BLETTES & ÉPINARDS' },
  ];

  const cycles = buildCycles(recoltes, calendrier, []);
  assert.strictEqual(cycles.length, 2);
  const saisons = cycles.map(c => c.saisonId).sort();
  assert.deepStrictEqual(saisons, ['ete-2026', 'hiver-2025-2026']);
  cycles.forEach(c => {
    assert.strictEqual(c.estPerpetuelle, true);
    assert.strictEqual(c.precociteJours, null);
    assert.strictEqual(c.joursOccupation, 1); // une seule recolte -> +1 jour
  });
});

// ── buildCycles : sans entree calendrier (degradation gracieuse) ─
test('cycles: sans calendrier = donnees manquantes en null, pas de crash', () => {
  const recoltes = [
    { vegetal: 'Mizuna', lieu: 'jardin', poids: 64, date: '2026-03-01', famille: 'SALADES' },
  ];

  const cycles = buildCycles(recoltes, [], []);
  assert.strictEqual(cycles.length, 1);
  const c = cycles[0];
  assert.strictEqual(c.saisonId, 'ete-2026'); // fallback sur la date de recolte
  assert.strictEqual(c.nbPlants, null);
  assert.strictEqual(c.poidsParPlant, null);
  assert.strictEqual(c.poidsParM2, null);
  assert.strictEqual(c.precociteJours, null);
  assert.strictEqual(c.joursOccupation, null);
  assert.strictEqual(c.regulariteCV, null); // une seule recolte
  assert.strictEqual(c.poidsTotal, 64);
});

// ── buildCycles : observation qualitative rattachee ─────────────
test('cycles: observation qualitative correctement rattachee au cycle', () => {
  const calendrier = [{
    culture: 'Aubergine Barbentane', famille: 'AUBERGINES', lieu: 'serre',
    semis: '2026-02-15', plantation: '2026-04-15', nbPlants: 3,
  }];
  const recoltes = [
    { vegetal: 'Aubergine Barbentane', lieu: 'serre', poids: 1200, date: '2026-07-10', famille: 'AUBERGINES' },
  ];
  const observations = [{
    vegetal: 'Aubergine Barbentane', lieu: 'serre', saisonId: 'ete-2026',
    maladies: ['oidium'], ravageurs: [], echec: false,
    noteGout: 4, noteFaciliteCulture: 3, nbFruits: 18,
  }];

  const cycles = buildCycles(recoltes, calendrier, observations);
  assert.strictEqual(cycles.length, 1);
  const c = cycles[0];
  assert.deepStrictEqual(c.maladies, ['oidium']);
  assert.strictEqual(c.noteGout, 4);
  assert.strictEqual(c.noteFaciliteCulture, 3);
  assert.strictEqual(c.nbFruits, 18);
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
