/**
 * Sélection Variétale Intelligente — détection d'anomalies de saisie
 * Compare le poids d'une récolte à l'historique de la même variété/lieu
 * et signale les écarts statistiquement improbables (erreurs de saisie
 * probables, ex. "4500" au lieu de "450").
 * Compatible navigateur (<script>) et Node (require).
 */

const SelectionScoring = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-scoring.js')
  : (typeof window !== 'undefined' ? window.SelectionScoring : globalThis.SelectionScoring);

const { mean } = SelectionScoring;

const ANOMALIE_SEUILS_DEFAULT = {
  zScoreSeuil: 3,     // écarts-types au-delà desquels une valeur est suspecte
  ratioSeuil: 5,      // si l'historique est constant (écart-type nul), ratio max acceptable
  minHistorique: 3,   // nombre minimum de récoltes historiques pour évaluer
};

function ecartType(values, moyenne) {
  if (!values.length) return 0;
  const m = (moyenne === undefined || moyenne === null) ? mean(values) : moyenne;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length);
}

// `historiquePoids` : poids (g) des autres récoltes de la même variété/lieu.
function detecterAnomaliePoids(poids, historiquePoids, options) {
  const seuils = Object.assign({}, ANOMALIE_SEUILS_DEFAULT, options || {});
  const hist = (historiquePoids || []).filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0);

  if (poids === null || poids === undefined || isNaN(poids) || poids <= 0) {
    return { anomalie: false, motif: 'poids_invalide', nbHistorique: hist.length, moyenne: null, ratio: null };
  }
  if (hist.length < seuils.minHistorique) {
    return { anomalie: false, motif: 'historique_insuffisant', nbHistorique: hist.length, moyenne: null, ratio: null };
  }

  const moyenne = mean(hist);
  const et = ecartType(hist, moyenne);
  const ratio = moyenne ? poids / moyenne : null;

  if (et > 0) {
    const z = (poids - moyenne) / et;
    if (Math.abs(z) > seuils.zScoreSeuil) {
      return { anomalie: true, motif: 'z_score', z, moyenne, ecartType: et, ratio, nbHistorique: hist.length };
    }
    return { anomalie: false, motif: null, z, moyenne, ecartType: et, ratio, nbHistorique: hist.length };
  }

  // Historique constant (écart-type nul) : on bascule sur un ratio simple
  if (ratio !== null && (ratio > seuils.ratioSeuil || ratio < 1 / seuils.ratioSeuil)) {
    return { anomalie: true, motif: 'ratio', ratio, moyenne, ecartType: 0, nbHistorique: hist.length };
  }
  return { anomalie: false, motif: null, ratio, moyenne, ecartType: 0, nbHistorique: hist.length };
}

// Message explicatif pour un élément retourné par scannerAnomalies.
function messageAnomalie(item) {
  if (!item || !item.anomalie) return null;
  let ecartTxt;
  if (item.ratio === null) {
    ecartTxt = 'très différente de la moyenne habituelle';
  } else if (item.ratio >= 1) {
    ecartTxt = `${item.ratio.toFixed(1)}× la moyenne habituelle`;
  } else {
    ecartTxt = `${(1 / item.ratio).toFixed(1)}× inférieure à la moyenne habituelle`;
  }
  const moyenneTxt = item.moyenne ? ` (≈ ${Math.round(item.moyenne)} g en moyenne sur ${item.nbHistorique} récolte(s))` : '';
  return `Poids ${ecartTxt}${moyenneTxt}. Vérifier la saisie ?`;
}

// Parcourt toutes les récoltes et signale celles dont le poids est anormal
// par rapport à l'historique de la même variété + lieu (hors elle-même).
function scannerAnomalies(recoltes, options) {
  recoltes = recoltes || [];
  const resultats = [];

  recoltes.forEach((r, idx) => {
    if (!r.vegetal || !r.lieu) return;
    const historique = recoltes
      .filter((other, i) => i !== idx && other.vegetal === r.vegetal && other.lieu === r.lieu)
      .map(o => o.poids);

    const res = detecterAnomaliePoids(r.poids, historique, options);
    if (res.anomalie) resultats.push(Object.assign({ recolte: r }, res));
  });

  return resultats;
}

// ── EXPORT ───────────────────────────────────────────────────────
const SelectionAnomalies = {
  ANOMALIE_SEUILS_DEFAULT,
  detecterAnomaliePoids,
  scannerAnomalies,
  messageAnomalie,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectionAnomalies;
} else {
  (typeof window !== 'undefined' ? window : globalThis).SelectionAnomalies = SelectionAnomalies;
}
