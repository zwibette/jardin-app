const assert = require('assert');
const { scoreVarietes } = require('../public/js/selection-scoring.js');
const {
  recommander,
  trouverAlternative,
  genererPhrases,
  genererRecommandations,
} = require('../public/js/selection-recommandations.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SEUILS = {
  abandon: 30,
  remplacement: 50,
  conservation: 65,
  ecartAlternativeSignificatif: 20,
  tauxEchecCritique: 0.5,
};

function mkAgg(overrides) {
  return Object.assign({
    vegetal: 'X', espece: 'Tomate', lieux: ['serre'], nbCycles: 2,
    confiance: 'moyenne', tauxEchec: null, scoreGlobal: 60,
    poidsTotalMoyen: 1000, precociteMoyen: null, noteGoutMoyen: null,
    tauxMaladies: null, nbCyclesAvecObservation: 0, cyclesRef: [],
  }, overrides);
}

// ── ARBRE DE DÉCISION ────────────────────────────────────────────
test('reco: confiance faible -> a_retester, prioritaire sur tout le reste', () => {
  const agg = mkAgg({ confiance: 'faible', tauxEchec: 0.8, scoreGlobal: 10 });
  const r = recommander(agg, [agg], SEUILS);
  assert.strictEqual(r.recommandation, 'a_retester');
  assert.strictEqual(r.motif, 'confiance_faible');
});

test('reco: echecs repetes (>=2 cycles, taux >= seuil) -> abandonner', () => {
  const agg = mkAgg({ tauxEchec: 0.6, nbCycles: 2, scoreGlobal: 70 });
  const r = recommander(agg, [agg], SEUILS);
  assert.strictEqual(r.recommandation, 'abandonner');
  assert.strictEqual(r.motif, 'echecs_repetes');
});

test('reco: score < seuil abandon -> abandonner', () => {
  const agg = mkAgg({ scoreGlobal: 20 });
  const r = recommander(agg, [agg], SEUILS);
  assert.strictEqual(r.recommandation, 'abandonner');
  assert.strictEqual(r.motif, 'score_faible');
});

test('reco: score moyen + alternative nettement meilleure -> remplacer', () => {
  const agg = mkAgg({ vegetal: 'X', scoreGlobal: 40 });
  const alt = mkAgg({ vegetal: 'Y', scoreGlobal: 70 });
  const r = recommander(agg, [agg, alt], SEUILS);
  assert.strictEqual(r.recommandation, 'remplacer');
  assert.strictEqual(r.motif, 'alternative_meilleure');
  assert.strictEqual(r.alternative.vegetal, 'Y');
});

test('reco: score moyen + ecart insuffisant -> a_retester', () => {
  const agg = mkAgg({ vegetal: 'X', scoreGlobal: 40 });
  const alt = mkAgg({ vegetal: 'Y', scoreGlobal: 55 }); // ecart 15 < 20
  const r = recommander(agg, [agg, alt], SEUILS);
  assert.strictEqual(r.recommandation, 'a_retester');
  assert.strictEqual(r.motif, 'performance_moyenne_sans_alternative');
});

test('reco: score eleve -> conserver', () => {
  const agg = mkAgg({ scoreGlobal: 70 });
  const r = recommander(agg, [agg], SEUILS);
  assert.strictEqual(r.recommandation, 'conserver');
  assert.strictEqual(r.motif, 'score_eleve');
});

test('reco: zone grise [remplacement, conservation) -> a_retester', () => {
  const agg = mkAgg({ scoreGlobal: 55 });
  const r = recommander(agg, [agg], SEUILS);
  assert.strictEqual(r.recommandation, 'a_retester');
  assert.strictEqual(r.motif, 'zone_grise');
});

test('trouverAlternative: ignore les candidats de la meme variete', () => {
  const agg = mkAgg({ vegetal: 'X', scoreGlobal: 40 });
  const soiMeme = mkAgg({ vegetal: 'X', scoreGlobal: 90 });
  assert.strictEqual(trouverAlternative(agg, [agg, soiMeme], SEUILS), null);
});

// ── PHRASES EXPLICATIVES ─────────────────────────────────────────
test('phrase: echec avec motif', () => {
  const agg = mkAgg({
    tauxEchec: 0.5, nbCyclesAvecObservation: 2,
    cyclesRef: [
      { echec: true, echecMotif: 'canicule', maladies: [] },
      { echec: false, echecMotif: '', maladies: [] },
    ],
  });
  const phrases = genererPhrases(agg, [agg]);
  assert.strictEqual(phrases[0], 'Échec de culture constaté sur 1/2 cycle(s) observé(s) (motif : canicule).');
});

test('phrase: maladie recurrente + bon gout', () => {
  const agg = mkAgg({
    tauxMaladies: 1, noteGoutMoyen: 5,
    cyclesRef: [{ maladies: ['oidium'], echec: false }],
  });
  const phrases = genererPhrases(agg, [agg]);
  assert.strictEqual(phrases[0], 'Malgré un excellent goût, cette variété est sujette à oidium (100% des cycles observés).');
});

test('phrase: rendement inferieur a la cohorte', () => {
  const agg = mkAgg({ vegetal: 'X', poidsTotalMoyen: 500, lieux: ['serre'] });
  const autre = mkAgg({ vegetal: 'Y', poidsTotalMoyen: 1000 });
  const phrases = genererPhrases(agg, [agg, autre]);
  assert.strictEqual(phrases[0], 'Rendement inférieur de 50% par rapport à la moyenne des autres tomate testées en serre.');
});

test('phrase: tendance positive (variete la plus productive sur plusieurs saisons)', () => {
  // Ecart de rendement < 10% pour ne pas declencher la phrase rendement avant
  const agg = mkAgg({ vegetal: 'X', nbCycles: 3, poidsTotalMoyen: 1000, precociteMoyen: null });
  const autre = mkAgg({ vegetal: 'Y', nbCycles: 1, poidsTotalMoyen: 950, precociteMoyen: null });
  const phrases = genererPhrases(agg, [agg, autre]);
  assert.strictEqual(phrases[0], 'Variété la plus productive de sa catégorie sur 3 saisons consécutives.');
});

test('phrase: precocite (recolte plus tot que la moyenne)', () => {
  const agg = mkAgg({ vegetal: 'X', precociteMoyen: 60, poidsTotalMoyen: null });
  const autre = mkAgg({ vegetal: 'Y', precociteMoyen: 80, poidsTotalMoyen: null });
  const phrases = genererPhrases(agg, [agg, autre]);
  assert.strictEqual(phrases[0], 'Récolte 20 jours plus tôt que la moyenne des tomate.');
});

test('phrase: max 3 phrases generees', () => {
  const agg = mkAgg({
    vegetal: 'X', nbCycles: 3, poidsTotalMoyen: 500, precociteMoyen: 60,
    tauxEchec: 0.5, tauxMaladies: 1, noteGoutMoyen: 5,
    nbCyclesAvecObservation: 2,
    cyclesRef: [
      { echec: true, echecMotif: 'gel', maladies: ['mildiou'] },
      { echec: false, echecMotif: '', maladies: ['mildiou'] },
    ],
  });
  const autre = mkAgg({ vegetal: 'Y', poidsTotalMoyen: 1000, precociteMoyen: 80, nbCycles: 1 });
  const phrases = genererPhrases(agg, [agg, autre]);
  assert.ok(phrases.length <= 3);
  assert.ok(phrases.length >= 1);
});

// ── INTÉGRATION : scoreVarietes -> genererRecommandations ─────────
test('integration: chaque variete recoit une recommandation et des phrases', () => {
  const mkCycle = (overrides) => Object.assign({
    vegetal: 'X', espece: 'Tomate', famille: 'TOMATES', lieu: 'serre', annee: 2026,
    poidsTotal: 1000, poidsParPlant: null, poidsParM2: null,
    dureeProduction: 60, precociteJours: 80, regulariteCV: 0.2,
    poidsParJour: 10, rentabiliteJour: null,
    noteGout: null, noteFaciliteCulture: null,
    maladies: [], ravageurs: [], echec: false, observation: null,
  }, overrides);

  const cycles = [
    mkCycle({
      vegetal: 'Tomate Rose de Berne', poidsTotal: 1000,
      noteGout: 5, noteFaciliteCulture: 4,
      maladies: ['mildiou'], observation: { maladies: ['mildiou'] },
    }),
    mkCycle({ vegetal: 'Tomate Noire de Crimee', poidsTotal: 3000 }),
    mkCycle({
      vegetal: 'Tomate Ananas', poidsTotal: 2000, annee: 2025,
      maladies: [], observation: { maladies: [], ravageurs: [], echec: false },
    }),
    mkCycle({
      vegetal: 'Tomate Ananas', poidsTotal: 2000, annee: 2026,
      maladies: [], observation: { maladies: [], ravageurs: [], echec: false },
    }),
  ];

  const scored = scoreVarietes(cycles);
  const recos = genererRecommandations(scored);

  recos.forEach(r => {
    assert.ok(['conserver', 'a_retester', 'remplacer', 'abandonner'].includes(r.recommandation));
    assert.ok(Array.isArray(r.phrases));
  });

  // Variete B (confiance faible, 1 cycle sans observation) -> toujours a_retester
  const B = recos.find(r => r.vegetal === 'Tomate Noire de Crimee');
  assert.strictEqual(B.recommandation, 'a_retester');
  assert.strictEqual(B.recommandationMotif, 'confiance_faible');
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
