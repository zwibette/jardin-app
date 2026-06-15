}/**
 * Sélection Variétale Intelligente — moteur de recommandation
 * Dépend de selection-rules.js (RECOMMANDATION_SEUILS_DEFAULT) et
 * selection-scoring.js (mean). Compatible navigateur (<script>) et Node (require).
 */

const SelectionRules = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-rules.js')
  : (typeof window !== 'undefined' ? window.SelectionRules : globalThis.SelectionRules);

const SelectionScoring = (typeof module !== 'undefined' && module.exports)
  ? require('./selection-scoring.js')
  : (typeof window !== 'undefined' ? window.SelectionScoring : globalThis.SelectionScoring);

const { RECOMMANDATION_SEUILS_DEFAULT } = SelectionRules;
const { mean } = SelectionScoring;

const RECOMMANDATION_LABELS = {
  conserver: 'Conserver',
  a_retester: 'À retester',
  remplacer: 'Remplacer',
  abandonner: 'Abandonner',
};

const LIEU_LABELS = { serre: 'en serre', bacs: 'en bacs', jardin: 'au jardin' };

// ── ARBRE DE DÉCISION (§5.1) ──────────────────────────────────────
function trouverAlternative(agg, cohort, seuils) {
  if (agg.scoreGlobal === null) return null;
  const candidats = cohort.filter(c =>
    c.vegetal !== agg.vegetal &&
    c.scoreGlobal !== null &&
    (c.scoreGlobal - agg.scoreGlobal) > seuils.ecartAlternativeSignificatif
  );
  if (!candidats.length) return null;
  return candidats.sort((a, b) => b.scoreGlobal - a.scoreGlobal)[0];
}

function recommander(agg, cohort, seuils) {
  seuils = seuils || RECOMMANDATION_SEUILS_DEFAULT;

  // 1. Jamais de verdict tranché sur confiance faible
  if (agg.confiance === 'faible') {
    return { recommandation: 'a_retester', motif: 'confiance_faible' };
  }

  // 2. Échecs répétés et confirmés (>=2 cycles)
  if (agg.tauxEchec !== null && agg.tauxEchec >= seuils.tauxEchecCritique && agg.nbCycles >= 2) {
    return { recommandation: 'abandonner', motif: 'echecs_repetes' };
  }

  if (agg.scoreGlobal === null) {
    return { recommandation: 'a_retester', motif: 'donnees_insuffisantes' };
  }

  // 3. Score global confirmé très faible
  if (agg.scoreGlobal < seuils.abandon) {
    return { recommandation: 'abandonner', motif: 'score_faible' };
  }

  // 4-5. Score moyen : remplacer si alternative nettement meilleure, sinon retester
  if (agg.scoreGlobal < seuils.remplacement) {
    const alternative = trouverAlternative(agg, cohort, seuils);
    if (alternative) {
      return { recommandation: 'remplacer', motif: 'alternative_meilleure', alternative };
    }
    return { recommandation: 'a_retester', motif: 'performance_moyenne_sans_alternative' };
  }

  // 6. Score élevé
  if (agg.scoreGlobal >= seuils.conservation) {
    return { recommandation: 'conserver', motif: 'score_eleve' };
  }

  // 7. Zone grise [remplacement, conservation)
  return { recommandation: 'a_retester', motif: 'zone_grise' };
}

// ── GÉNÉRATION DE PHRASES (§5.2) ──────────────────────────────────
function maladieFrequente(agg) {
  const counts = {};
  (agg.cyclesRef || []).forEach(c => {
    (c.maladies || []).forEach(m => { counts[m] = (counts[m] || 0) + 1; });
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : 'un problème sanitaire';
}

function echecMotifFrequent(agg) {
  const counts = {};
  (agg.cyclesRef || []).forEach(c => {
    if (c.echec && c.echecMotif) counts[c.echecMotif] = (counts[c.echecMotif] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : null;
}

function phraseEchec(agg) {
  if (agg.tauxEchec === null || agg.tauxEchec <= 0) return null;
  const nbEchecs = Math.round(agg.tauxEchec * agg.nbCyclesAvecObservation);
  const motif = echecMotifFrequent(agg);
  const base = `Échec de culture constaté sur ${nbEchecs}/${agg.nbCyclesAvecObservation} cycle(s) observé(s)`;
  return base + (motif ? ` (motif : ${motif}).` : '.');
}

function phraseMaladie(agg) {
  if (agg.tauxMaladies === null || agg.tauxMaladies <= 0) return null;
  const maladie = maladieFrequente(agg);
  const pct = Math.round(agg.tauxMaladies * 100);
  const intro = (agg.noteGoutMoyen !== null && agg.noteGoutMoyen >= 4)
    ? 'Malgré un excellent goût, cette variété'
    : 'Cette variété';
  return `${intro} est sujette à ${maladie} (${pct}% des cycles observés).`;
}

function phraseRendement(agg, cohort) {
  if (agg.poidsTotalMoyen === null) return null;
  const autres = cohort.filter(c => c.vegetal !== agg.vegetal).map(c => c.poidsTotalMoyen).filter(v => v !== null);
  if (!autres.length) return null;
  const moyenne = mean(autres);
  if (!moyenne) return null;
  const ecartPct = Math.round(((agg.poidsTotalMoyen - moyenne) / moyenne) * 100);
  if (Math.abs(ecartPct) < 10) return null;
  const comparatif = ecartPct > 0 ? 'supérieur' : 'inférieur';
  const dansLieu = (agg.lieux.length === 1 && LIEU_LABELS[agg.lieux[0]]) ? ` ${LIEU_LABELS[agg.lieux[0]]}` : '';
  return `Rendement ${comparatif} de ${Math.abs(ecartPct)}% par rapport à la moyenne des autres ${agg.espece.toLowerCase()} testées${dansLieu}.`;
}

function phraseTendance(agg, cohort) {
  if (agg.nbCycles < 2 || cohort.length < 2) return null;
  const meilleur = cohort.reduce((best, c) =>
    (c.poidsTotalMoyen !== null && (best === null || c.poidsTotalMoyen > best.poidsTotalMoyen)) ? c : best, null);
  if (meilleur && meilleur.vegetal === agg.vegetal) {
    const unite = agg.nbCycles > 1 ? 'saisons' : 'saison';
    return `Variété la plus productive de sa catégorie sur ${agg.nbCycles} ${unite} consécutives.`;
  }
  return null;
}

function phrasePrecocite(agg, cohort) {
  if (agg.precociteMoyen === null) return null;
  const autres = cohort.filter(c => c.vegetal !== agg.vegetal).map(c => c.precociteMoyen).filter(v => v !== null);
  if (!autres.length) return null;
  const moyenne = mean(autres);
  if (moyenne === null) return null;
  const ecart = Math.round(agg.precociteMoyen - moyenne);
  if (Math.abs(ecart) < 5) return null;
  const sens = ecart < 0 ? 'tôt' : 'tard';
  return `Récolte ${Math.abs(ecart)} jours plus ${sens} que la moyenne des ${agg.espece.toLowerCase()}.`;
}

// Ordre de priorité : échec/maladie > rendement > tendance > précocité. Max 3 phrases.
function genererPhrases(agg, cohort) {
  const generateurs = [phraseEchec, phraseMaladie, phraseRendement, phraseTendance, phrasePrecocite];
  const phrases = [];
  for (const gen of generateurs) {
    const p = gen(agg, cohort);
    if (p) phrases.push(p);
    if (phrases.length >= 3) break;
  }
  return phrases;
}

// ── ENTRÉE PRINCIPALE ──────────────────────────────────────────────
// `results` : sortie de scoreVarietes (Phase 2).
function genererRecommandations(results, options) {
  options = options || {};
  const seuils = Object.assign({}, RECOMMANDATION_SEUILS_DEFAULT, options.seuils || {});

  return results.map(agg => {
    const cohort = results.filter(r => r.espece === agg.espece);
    const reco = recommander(agg, cohort, seuils);
    const phrases = genererPhrases(agg, cohort);

    return Object.assign({}, agg, {
      recommandation: reco.recommandation,
      recommandationLabel: RECOMMANDATION_LABELS[reco.recommandation],
      recommandationMotif: reco.motif,
      recommandationAlternative: reco.alternative ? reco.alternative.vegetal : null,
      phrases,
    });
  });
}

// ── EXPORT ───────────────────────────────────────────────────────
const SelectionRecommandations = {
  RECOMMANDATION_LABELS,
  recommander,
  trouverAlternative,
  genererPhrases,
  genererRecommandations,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectionRecommandations;
} else {
  (typeof window !== 'undefined' ? window : globalThis).SelectionRecommandations = SelectionRecommandations;
}
