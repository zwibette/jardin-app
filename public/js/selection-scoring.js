/**
 * Sélection Variétale Intelligente — moteur de scoring
 * Dépend de selection-rules.js (FAMILLES_RECOLTE_UNIQUE, SCORING_WEIGHTS_DEFAULT).
 * Compatible navigateur (<script>) et Node (require).
 */

const SelectionRules = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-rules.js')
  : (typeof window !== 'undefined' ? window.SelectionRules : globalThis.SelectionRules);

const { FAMILLES_RECOLTE_UNIQUE, SCORING_WEIGHTS_DEFAULT } = SelectionRules;

// ── HELPERS STATISTIQUES ─────────────────────────────────────────
function mean(values) {
  const valid = (values || []).filter(v => v !== null && v !== undefined && !isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

// Percentile "rang" : part de la cohorte (incluant la valeur elle-même)
// strictement inférieure, + moitié des égalités. Cohorte d'un seul élément -> 50.
function percentileScore(value, cohortValues) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const valid = (cohortValues || []).filter(v => v !== null && v !== undefined && !isNaN(v));
  if (valid.length <= 1) return 50;
  let count = 0;
  valid.forEach(v => {
    if (v < value) count += 1;
    else if (v === value) count += 0.5;
  });
  return Math.round((count / valid.length) * 100);
}

function invertScore(score) {
  return (score === null || score === undefined) ? null : 100 - score;
}

// note (1-5) -> 0-100
function noteScore(note) {
  return (note === null || note === undefined) ? null : Math.round((note / 5) * 100);
}

// taux (0-1, "mauvais" si élevé) -> 0-100 ("bon" si élevé)
function tauxScore(taux) {
  return (taux === null || taux === undefined) ? null : Math.round(100 - taux * 100);
}

// ── AGRÉGATION D'UNE VARIÉTÉ (sur un ensemble de cycles) ─────────
// `cycles` : sous-ensemble de CycleCulture appartenant à la même variété
// (et au même lieu si regroupement par lieu demandé en amont).
function aggregateVariete(cycles) {
  if (!cycles || !cycles.length) return null;

  const poidsTotaux = cycles.map(c => c.poidsTotal);
  const obsCycles = cycles.filter(c => c.observation);
  const recolteUnique = FAMILLES_RECOLTE_UNIQUE.has(cycles[0].famille);

  return {
    vegetal: cycles[0].vegetal,
    espece: cycles[0].espece,
    famille: cycles[0].famille,
    lieux: Array.from(new Set(cycles.map(c => c.lieu))),
    annees: Array.from(new Set(cycles.map(c => c.annee))),
    nbCycles: cycles.length,
    nbAnnees: new Set(cycles.map(c => c.annee)).size,
    recolteUnique,

    poidsTotalMoyen: mean(poidsTotaux),
    poidsTotalMin: Math.min(...poidsTotaux),
    poidsTotalMax: Math.max(...poidsTotaux),
    poidsParPlantMoyen: mean(cycles.map(c => c.poidsParPlant)),
    poidsParM2Moyen: mean(cycles.map(c => c.poidsParM2)),
    dureeProductionMoyen: recolteUnique ? null : mean(cycles.map(c => c.dureeProduction)),
    precociteMoyen: mean(cycles.map(c => c.precociteJours)),
    regulariteCVMoyen: recolteUnique ? null : mean(cycles.map(c => c.regulariteCV)),
    productiviteJourMoyen: mean(cycles.map(c => c.poidsParJour)),
    rentabiliteJourMoyen: mean(cycles.map(c => c.rentabiliteJour)),
    noteGoutMoyen: mean(cycles.map(c => c.noteGout)),
    noteFaciliteMoyen: mean(cycles.map(c => c.noteFaciliteCulture)),

    nbCyclesAvecObservation: obsCycles.length,
    tauxMaladies: obsCycles.length ? obsCycles.filter(c => c.maladies.length > 0).length / obsCycles.length : null,
    tauxRavageurs: obsCycles.length ? obsCycles.filter(c => c.ravageurs.length > 0).length / obsCycles.length : null,
    tauxEchec: obsCycles.length ? obsCycles.filter(c => c.echec).length / obsCycles.length : null,

    cyclesRef: cycles,
  };
}

// ── SOUS-SCORES (0-100, null = critère non disponible) ────────────
// `cohort` : liste des aggrégats des autres variétés de la même espèce
// (incluant `agg` lui-même).
function computeSousScores(agg, cohort) {
  const cohortValues = (key) => cohort.map(a => a[key]);

  return {
    rendementTotal: percentileScore(agg.poidsTotalMoyen, cohortValues('poidsTotalMoyen')),
    rendementParPlant: percentileScore(agg.poidsParPlantMoyen, cohortValues('poidsParPlantMoyen')),
    rendementParM2: percentileScore(agg.poidsParM2Moyen, cohortValues('poidsParM2Moyen')),
    dureeProduction: agg.recolteUnique ? null : percentileScore(agg.dureeProductionMoyen, cohortValues('dureeProductionMoyen')),
    precocite: invertScore(percentileScore(agg.precociteMoyen, cohortValues('precociteMoyen'))),
    regularite: agg.recolteUnique ? null : invertScore(percentileScore(agg.regulariteCVMoyen, cohortValues('regulariteCVMoyen'))),
    resistanceMaladies: tauxScore(agg.tauxMaladies),
    sensibiliteRavageurs: tauxScore(agg.tauxRavageurs),
    tauxEchec: tauxScore(agg.tauxEchec),
    productiviteJour: percentileScore(agg.productiviteJourMoyen, cohortValues('productiviteJourMoyen')),
    rentabilite: percentileScore(agg.rentabiliteJourMoyen, cohortValues('rentabiliteJourMoyen')),
    noteGout: noteScore(agg.noteGoutMoyen),
    noteFaciliteCulture: noteScore(agg.noteFaciliteMoyen),
  };
}

// ── SCORE GLOBAL PONDÉRÉ (renormalisé sur les critères disponibles) ─
function computeScoreGlobal(sousScores, weights) {
  weights = weights || SCORING_WEIGHTS_DEFAULT;
  let sommePonderee = 0;
  let sommePoids = 0;
  let nbDisponibles = 0;
  const nbTotal = Object.keys(weights).length;

  for (const cle in weights) {
    const s = sousScores[cle];
    if (s !== null && s !== undefined) {
      sommePonderee += s * weights[cle];
      sommePoids += weights[cle];
      nbDisponibles++;
    }
  }

  return {
    score: sommePoids > 0 ? Math.round(sommePonderee / sommePoids) : null,
    nbCriteresDisponibles: nbDisponibles,
    nbCriteresTotal: nbTotal,
  };
}

// ── NIVEAU DE CONFIANCE ────────────────────────────────────────────
function computeNiveauConfiance(agg, scoreGlobalResult) {
  const ratioCriteres = scoreGlobalResult.nbCriteresTotal
    ? scoreGlobalResult.nbCriteresDisponibles / scoreGlobalResult.nbCriteresTotal
    : 0;
  const donneesQualitativesCompletes = agg.nbCyclesAvecObservation > 0
    && agg.noteGoutMoyen !== null
    && agg.noteFaciliteMoyen !== null;

  if (agg.nbCycles >= 3 && ratioCriteres >= 0.7) return 'elevee';
  if (agg.nbCycles >= 2) return 'moyenne';
  if (agg.nbCycles === 1 && donneesQualitativesCompletes) return 'moyenne';
  return 'faible';
}

// ── ENTRÉE PRINCIPALE ────────────────────────────────────────────
// `cycles` : tableau de CycleCulture (sortie de buildCycles).
// `options.weights` : pondérations (défaut SCORING_WEIGHTS_DEFAULT).
// `options.parLieu` : si true, un score est calculé par (variété, lieu)
//                      au lieu d'un score par variété tous lieux confondus.
function scoreVarietes(cycles, options) {
  options = options || {};
  const weights = options.weights || SCORING_WEIGHTS_DEFAULT;
  const parLieu = !!options.parLieu;

  const groups = new Map();
  (cycles || []).forEach(c => {
    const key = parLieu ? (c.vegetal + '|' + c.lieu) : c.vegetal;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  });

  const aggregats = Array.from(groups.values())
    .map(aggregateVariete)
    .filter(Boolean);

  return aggregats.map(agg => {
    const cohort = aggregats.filter(a => a.espece === agg.espece);
    const sousScores = computeSousScores(agg, cohort);
    const globalResult = computeScoreGlobal(sousScores, weights);
    const confiance = computeNiveauConfiance(agg, globalResult);

    return Object.assign({}, agg, {
      sousScores,
      scoreGlobal: globalResult.score,
      nbCriteresDisponibles: globalResult.nbCriteresDisponibles,
      nbCriteresTotal: globalResult.nbCriteresTotal,
      confiance,
    });
  });
}

// ── EXPORT ───────────────────────────────────────────────────────
const SelectionScoring = {
  mean,
  percentileScore,
  invertScore,
  noteScore,
  tauxScore,
  aggregateVariete,
  computeSousScores,
  computeScoreGlobal,
  computeNiveauConfiance,
  scoreVarietes,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectionScoring;
} else {
  (typeof window !== 'undefined' ? window : globalThis).SelectionScoring = SelectionScoring;
}
