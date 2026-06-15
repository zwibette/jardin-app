/**
 * Sélection Variétale Intelligente — détection de tendances
 * Basée sur l'évolution du rendement total par saison (donnée déjà
 * disponible et fiable, cf. cyclesRef issus de buildCycles).
 * Compatible navigateur (<script>) et Node (require).
 */

const SelectionRules = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-rules.js')
  : (typeof window !== 'undefined' ? window.SelectionRules : globalThis.SelectionRules);

const SelectionScoring = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-scoring.js')
  : (typeof window !== 'undefined' ? window.SelectionScoring : globalThis.SelectionScoring);

const { saisonSortKey, coefficientVariation } = SelectionRules;
const { mean } = SelectionScoring;

const TENDANCE_SEUILS_DEFAULT = {
  penteRelative: 0.10, // pente / moyenne : variation jugée significative (10% par saison)
  cvInstable: 0.30,    // coefficient de variation au-delà duquel la production est jugée instable
};

const TENDANCE_LABELS = {
  progression: 'En progression',
  regression: 'En régression',
  instable: 'Instable',
  stable: 'Stable',
  indetermine: 'Indéterminée',
};

// Régression linéaire simple (moindres carrés) sur x = 0..n-1
function linearRegressionSlope(values) {
  const n = values.length;
  if (n < 2) return null;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den === 0 ? 0 : num / den;
}

// `cyclesRef` : cycles d'une même variété (sortie de aggregateVariete).
function detecterTendance(cyclesRef, options) {
  const seuils = Object.assign({}, TENDANCE_SEUILS_DEFAULT, options || {});

  if (!cyclesRef || cyclesRef.length < 2) {
    return { type: 'indetermine', label: TENDANCE_LABELS.indetermine, pente: null, penteRelative: null, cv: null };
  }

  const sorted = [...cyclesRef].sort((a, b) => saisonSortKey(a.saisonId) - saisonSortKey(b.saisonId));
  const valeurs = sorted.map(c => c.poidsTotal);
  const moyenne = mean(valeurs);
  const cv = coefficientVariation(valeurs);
  const pente = linearRegressionSlope(valeurs);
  const penteRelative = (moyenne && pente !== null) ? pente / moyenne : 0;

  let type;
  if (cv !== null && cv > seuils.cvInstable) {
    type = 'instable';
  } else if (penteRelative > seuils.penteRelative) {
    type = 'progression';
  } else if (penteRelative < -seuils.penteRelative) {
    type = 'regression';
  } else {
    type = 'stable';
  }

  return { type, label: TENDANCE_LABELS[type], pente, penteRelative, cv };
}

// ── EXPORT ───────────────────────────────────────────────────────
const SelectionTendances = {
  TENDANCE_SEUILS_DEFAULT,
  TENDANCE_LABELS,
  linearRegressionSlope,
  detecterTendance,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectionTendances;
} else {
  (typeof window !== 'undefined' ? window : globalThis).SelectionTendances = SelectionTendances;
}
