const assert = require('assert');
const {
  detecterAnomaliePoids,
  scannerAnomalies,
  messageAnomalie,
} = require('../public/js/selection-anomalies.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const HIST_STABLE = [300, 320, 310, 290, 315];

test('pas d\'anomalie: valeur dans la norme', () => {
  const r = detecterAnomaliePoids(305, HIST_STABLE);
  assert.strictEqual(r.anomalie, false);
});

test('anomalie: valeur 10x superieure (erreur de saisie typique)', () => {
  const r = detecterAnomaliePoids(3000, HIST_STABLE);
  assert.strictEqual(r.anomalie, true);
  assert.strictEqual(r.motif, 'z_score');
  assert.ok(r.z > 3);
  assert.ok(r.ratio > 5);
});

test('anomalie: valeur 10x inferieure', () => {
  const r = detecterAnomaliePoids(30, HIST_STABLE);
  assert.strictEqual(r.anomalie, true);
  assert.ok(r.z < -3);
});

test('historique insuffisant: pas d\'anomalie signalee', () => {
  const r = detecterAnomaliePoids(9999, [300, 310]);
  assert.strictEqual(r.anomalie, false);
  assert.strictEqual(r.motif, 'historique_insuffisant');
});

test('poids invalide (negatif ou null): pas d\'anomalie', () => {
  assert.strictEqual(detecterAnomaliePoids(null, HIST_STABLE).anomalie, false);
  assert.strictEqual(detecterAnomaliePoids(-1, HIST_STABLE).anomalie, false);
});

test('historique constant (ecart-type nul): bascule sur ratio', () => {
  const hist = [300, 300, 300, 300, 300];
  const r = detecterAnomaliePoids(2000, hist);
  assert.strictEqual(r.anomalie, true);
  assert.strictEqual(r.motif, 'ratio');
  assert.ok(r.ratio > 5);
});

test('historique constant: valeur proche = pas d\'anomalie', () => {
  const hist = [300, 300, 300, 300, 300];
  const r = detecterAnomaliePoids(310, hist);
  assert.strictEqual(r.anomalie, false);
});

test('seuils configurables: zScoreSeuil eleve fait passer une valeur sinon anomale', () => {
  // Historique: moy=307g, et=10.8. 350g => z≈4 (>3 : anomalie par défaut).
  // Avec zScoreSeuil=5, z=4 < 5 → pas d'anomalie.
  const r = detecterAnomaliePoids(350, HIST_STABLE, { zScoreSeuil: 5, ratioSeuil: 50, minHistorique: 3 });
  assert.strictEqual(r.anomalie, false);
});

test('messageAnomalie: produit un texte lisible', () => {
  const item = {
    anomalie: true, motif: 'z_score', ratio: 9.5, moyenne: 310, nbHistorique: 5,
  };
  const msg = messageAnomalie(item);
  assert.ok(msg.includes('9.5'));
  assert.ok(msg.includes('310 g'));
  assert.ok(msg.includes('Vérifier'));
});

test('messageAnomalie: null si pas d\'anomalie', () => {
  assert.strictEqual(messageAnomalie({ anomalie: false }), null);
  assert.strictEqual(messageAnomalie(null), null);
});

test('scannerAnomalies: detecte la mauvaise recolte parmi des bonnes', () => {
  const recoltes = [
    { vegetal: 'Tomate cerise', lieu: 'serre', poids: 300, date: '2026-06-01' },
    { vegetal: 'Tomate cerise', lieu: 'serre', poids: 320, date: '2026-06-08' },
    { vegetal: 'Tomate cerise', lieu: 'serre', poids: 310, date: '2026-06-15' },
    { vegetal: 'Tomate cerise', lieu: 'serre', poids: 290, date: '2026-06-22' },
    { vegetal: 'Tomate cerise', lieu: 'serre', poids: 315, date: '2026-06-29' },
    { vegetal: 'Tomate cerise', lieu: 'serre', poids: 4500, date: '2026-07-06' }, // erreur
  ];
  const anomalies = scannerAnomalies(recoltes);
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].recolte.poids, 4500);
  assert.strictEqual(anomalies[0].anomalie, true);
});

test('scannerAnomalies: ignore les varietes avec peu d\'historique', () => {
  const recoltes = [
    { vegetal: 'Courgette', lieu: 'bacs', poids: 300, date: '2026-06-01' },
    { vegetal: 'Courgette', lieu: 'bacs', poids: 9999, date: '2026-06-08' }, // suspect mais < 3 récoltes en historique
  ];
  const anomalies = scannerAnomalies(recoltes);
  assert.strictEqual(anomalies.length, 0);
});

test('scannerAnomalies: ne confond pas deux lieux pour la meme variete', () => {
  const recoltes = [
    { vegetal: 'Persil', lieu: 'serre',  poids: 50,  date: '2026-05-01' },
    { vegetal: 'Persil', lieu: 'serre',  poids: 55,  date: '2026-05-10' },
    { vegetal: 'Persil', lieu: 'serre',  poids: 52,  date: '2026-05-20' },
    { vegetal: 'Persil', lieu: 'serre',  poids: 48,  date: '2026-05-30' },
    { vegetal: 'Persil', lieu: 'serre',  poids: 3000, date: '2026-06-01' }, // anomalie serre
    { vegetal: 'Persil', lieu: 'jardin', poids: 200, date: '2026-05-15' }, // jardin: < 3 récoltes -> ignoré
  ];
  const anomalies = scannerAnomalies(recoltes);
  // Seule la récolte serre de 3000g est anormale; jardin n'a pas assez d'historique
  assert.strictEqual(anomalies.length, 1);
  assert.strictEqual(anomalies[0].recolte.lieu, 'serre');
  assert.strictEqual(anomalies[0].recolte.poids, 3000);
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
