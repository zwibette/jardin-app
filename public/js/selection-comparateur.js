/**
 * Sélection Variétale Intelligente — comparateur intelligent
 * Classe plusieurs variétés (même espèce) et explique l'écart
 * entre la mieux notée et chacune des autres.
 * Compatible navigateur (<script>) et Node (require).
 */

const SelectionRules = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-rules.js')
  : (typeof window !== 'undefined' ? window.SelectionRules : globalThis.SelectionRules);

const { CRITERES_LABELS } = SelectionRules;

// Critère du sous-score le plus favorable au leader par rapport à `other`.
function critereDifferenciant(leader, other) {
  let bestCle = null;
  let bestDiff = -Infinity;
  for (const cle in leader.sousScores) {
    const a = leader.sousScores[cle];
    const b = other.sousScores[cle];
    if (a === null || a === undefined || b === null || b === undefined) continue;
    const diff = a - b;
    if (diff > bestDiff) { bestDiff = diff; bestCle = cle; }
  }
  return bestCle ? { cle: bestCle, diff: bestDiff } : null;
}

function phraseComparaison(leader, other, labels) {
  labels = labels || CRITERES_LABELS;
  const scoreA = leader.scoreGlobal ?? 0;
  const scoreB = other.scoreGlobal ?? 0;
  const diffCritere = critereDifferenciant(leader, other);

  if (!diffCritere || diffCritere.diff <= 0) {
    return `${leader.vegetal} devance ${other.vegetal} (score global ${scoreA} contre ${scoreB}).`;
  }

  const label = labels[diffCritere.cle] || diffCritere.cle;
  return `${leader.vegetal} devance ${other.vegetal} principalement sur « ${label} » `
       + `(+${Math.round(diffCritere.diff)} pts), pour un score global de ${scoreA} contre ${scoreB}.`;
}

// `selection` : sous-ensemble de résultats scorés (sortie de scoreVarietes /
// genererRecommandations), au moins 2 éléments, idéalement de même espèce.
function comparerVarietes(selection, options) {
  options = options || {};
  if (!selection || selection.length < 2) return null;

  const classement = [...selection].sort((a, b) => (b.scoreGlobal ?? -1) - (a.scoreGlobal ?? -1));
  const leader = classement[0];
  const phrases = classement.slice(1).map(other => phraseComparaison(leader, other, options.labels));

  return { classement, leader, phrases };
}

// ── EXPORT ───────────────────────────────────────────────────────
const SelectionComparateur = {
  critereDifferenciant,
  phraseComparaison,
  comparerVarietes,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectionComparateur;
} else {
  (typeof window !== 'undefined' ? window : globalThis).SelectionComparateur = SelectionComparateur;
}
