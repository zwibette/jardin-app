/**
 * Sélection Variétale Intelligente — règles centralisées + moteur de cycles
 * Aucune dépendance externe. Compatible navigateur (<script>) et Node (require).
 */

// ── NORMALISATION ──────────────────────────────────────────────
function normalizeKey(s) {
  return (s || '').toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâ]/g, 'a').replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── ESPÈCES ─────────────────────────────────────────────────────
// Clés normalisées (sans accents). Cas où le 1er mot du nom ne suffit pas.
const ESPECE_OVERRIDES = {
  'feuille chene rouge perez': 'Salade',
  'batavia verte perez': 'Salade',
  'batavia rouge perez': 'Salade',
  'rougette de montpellier perez': 'Salade',
  'sucrine perez': 'Salade',
  'laitue romaine d avignon': 'Salade',
  'nero di toscana': 'Chou',
  'pourpier dore': 'Pourpier',
  'mange tout norli': 'Pois',
  'potimarron bright summer': 'Courge',
  'butternut': 'Courge',
  'chayote': 'Courge',
};

function getEspece(vegetal) {
  if (!vegetal) return '';
  const nv = normalizeKey(vegetal);
  if (ESPECE_OVERRIDES[nv]) return ESPECE_OVERRIDES[nv];
  const firstWord = vegetal.trim().split(/\s+/)[0] || '';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

// ── SURFACE ET PRIX PAR ESPÈCE (estimations, éditables) ─────────
// m²/pied — utilisé en fallback si surfaceM2 non saisie manuellement
const SURFACE_PAR_PLANT_M2 = {
  'Tomate': 0.35, 'Aubergine': 0.4, 'Poivron': 0.3, 'Piment': 0.25,
  'Courgette': 1.0, 'Concombre': 0.5, 'Cornichon': 0.4, 'Melon': 1.0,
  'Pasteque': 1.5, 'Courge': 1.5,
  'Salade': 0.06, 'Mache': 0.03, 'Roquette': 0.03, 'Mizuna': 0.04, 'Pourpier': 0.04,
  'Blette': 0.15, 'Epinards': 0.05, 'Oseille': 0.1,
  'Chou': 0.25, 'Brocoli': 0.25, 'Betterave': 0.06, 'Fenouil': 0.1,
  'Celeri': 0.12, 'Radis': 0.02, 'Carotte': 0.02,
  'Pois': 0.05, 'Artichaut': 0.6,
  'Basilic': 0.06, 'Persil': 0.04, 'Liveche': 0.3, 'Ciboulette': 0.04,
};

// €/kg — estimation "valeur évitée à l'achat", pour rentabilité (optionnel)
const PRIX_KG_PAR_ESPECE = {
  'Tomate': 4, 'Aubergine': 3.5, 'Poivron': 5, 'Piment': 8,
  'Courgette': 2.5, 'Concombre': 2, 'Cornichon': 3, 'Melon': 3, 'Pasteque': 1.5, 'Courge': 2,
  'Salade': 2.5, 'Mache': 12, 'Roquette': 10, 'Mizuna': 8, 'Pourpier': 8,
  'Blette': 3, 'Epinards': 6, 'Oseille': 6,
  'Chou': 2, 'Brocoli': 4, 'Betterave': 2.5, 'Fenouil': 3,
  'Celeri': 3, 'Radis': 3, 'Carotte': 2,
  'Pois': 6, 'Artichaut': 4,
  'Basilic': 15, 'Persil': 12, 'Liveche': 10, 'Ciboulette': 12,
};

// Familles où "durée de production" / "régularité" ne sont pas pertinentes
// (récolte unique, ex. racines arrachées en une fois)
const FAMILLES_RECOLTE_UNIQUE = new Set(['LÉGUMES RACINES']);

// ── CULTURES PERPÉTUELLES (mêmes entrées que recoltes.html, normalisées) ─
const PERPETUELLES_CONNUES = new Set([
  'ciboulette perez', 'liveche', 'oseille', 'basilic perpetuel', 'persil',
  'persil geant italie', 'thym', 'romarin', 'sauge', 'origan',
  'estragon', 'menthe', 'cerfeuil', 'laurier', 'melisse',
  'artichaut imperial', 'topinambour', 'rhubarbe', 'epinards malabar',
  'poiree rubis char', 'blette perez', 'blette lucullus',
  'celeri perez',
  'framboisier', 'groseillier', 'baie de goji', 'kiwai',
  'figuier', 'abricotier', 'pommier',
]);

function isPerpetuelle(vegetal, calEntry) {
  if (calEntry && calEntry.estPerpetuelle === true) return true;
  const nv = normalizeKey(vegetal);
  for (const p of PERPETUELLES_CONNUES) {
    if (nv === p || nv.includes(p) || p.includes(nv)) return true;
  }
  return false;
}

// ── SAISONS (logique identique à recoltes.html) ─────────────────
function getSaisonFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const j = d.getDate();
  const y = d.getFullYear();

  if (m >= 9) return { type: 'hiver', label: `Hiver ${y}–${y + 1}`, id: `hiver-${y}-${y + 1}` };
  if (m === 1 || (m === 2 && j <= 1)) return { type: 'hiver', label: `Hiver ${y - 1}–${y}`, id: `hiver-${y - 1}-${y}` };
  return { type: 'ete', label: `Été ${y}`, id: `ete-${y}` };
}

// ── PONDÉRATIONS ET SEUILS (configurables, valeurs par défaut) ──
const SCORING_WEIGHTS_DEFAULT = {
  rendementTotal: 15,
  rendementParPlant: 10,
  rendementParM2: 8,
  dureeProduction: 5,
  precocite: 7,
  regularite: 8,
  resistanceMaladies: 12,
  sensibiliteRavageurs: 10,
  tauxEchec: 10,
  productiviteJour: 10,
  rentabilite: 5,
  noteGout: 10,
  noteFaciliteCulture: 10,
};

const RECOMMANDATION_SEUILS_DEFAULT = {
  abandon: 30,
  remplacement: 50,
  conservation: 65,
  ecartAlternativeSignificatif: 20,
  tauxEchecCritique: 0.5,
};

// Clé de tri chronologique pour un saisonId ("ete-2026" / "hiver-2025-2026")
function saisonSortKey(saisonId) {
  if (!saisonId) return 0;
  if (saisonId.startsWith('ete-')) return parseInt(saisonId.split('-')[1], 10) * 100 + 2;
  const parts = saisonId.split('-');
  return parseInt(parts[1], 10) * 100 + 9;
}

// Libellés français des 13 critères de scoring (UI : panneau pondérations, comparateur)
const CRITERES_LABELS = {
  rendementTotal: 'Rendement total',
  rendementParPlant: 'Rendement / plant',
  rendementParM2: 'Rendement / m²',
  dureeProduction: 'Durée de production',
  precocite: 'Précocité',
  regularite: 'Régularité des récoltes',
  resistanceMaladies: 'Résistance aux maladies',
  sensibiliteRavageurs: 'Résistance aux ravageurs',
  tauxEchec: 'Taux de réussite',
  productiviteJour: 'Productivité / jour',
  rentabilite: 'Rentabilité',
  noteGout: 'Goût',
  noteFaciliteCulture: 'Facilité de culture',
};

// ── HELPERS NUMÉRIQUES ────────────────────────────────────────
function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000);
}

function coefficientVariation(values) {
  if (!values.length) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// ── MATCHING CALENDRIER (même logique que getCultureEntry existant) ─
function findCalEntry(calendrier, vegetal, lieu) {
  const nv = normalizeKey(vegetal);
  const candidats = (calendrier || []).filter(c => {
    const nc = normalizeKey(c.culture);
    return nc === nv || nc.includes(nv) || nv.includes(nc);
  });
  if (!candidats.length) return null;
  return candidats.find(c => c.lieu === lieu) || candidats[0];
}

function findObservation(observations, vegetal, lieu, saisonId) {
  const nv = normalizeKey(vegetal);
  return (observations || []).find(o =>
    normalizeKey(o.vegetal) === nv && o.lieu === lieu && o.saisonId === saisonId
  ) || null;
}

// ── CONSTRUCTION DES CYCLES DE CULTURE ──────────────────────────
// Un cycle = (variété, lieu, saison). Reconstruit à la volée, jamais stocké.
function computeCycleMetrics(cycle) {
  const dates = cycle.recoltes.map(r => r.date).sort();
  cycle.poidsTotal = cycle.recoltes.reduce((s, r) => s + (r.poids || 0), 0);
  cycle.nbRecoltes = cycle.recoltes.length;
  cycle.premiereRecolte = dates[0] || null;
  cycle.derniereRecolte = dates[dates.length - 1] || null;

  cycle.poidsParPlant = cycle.nbPlants
    ? Math.round(cycle.poidsTotal / cycle.nbPlants)
    : null;

  const obs = cycle.observation || {};
  const surfaceM2 = obs.surfaceM2
    || (cycle.nbPlants && SURFACE_PAR_PLANT_M2[cycle.espece]
        ? cycle.nbPlants * SURFACE_PAR_PLANT_M2[cycle.espece]
        : null);
  cycle.surfaceM2 = surfaceM2 || null;
  cycle.poidsParM2 = surfaceM2 ? Math.round(cycle.poidsTotal / surfaceM2) : null;

  if (cycle.estPerpetuelle) {
    cycle.joursOccupation = (cycle.premiereRecolte && cycle.derniereRecolte)
      ? daysBetween(cycle.premiereRecolte, cycle.derniereRecolte) + 1
      : null;
    cycle.precociteJours = null;
  } else {
    const debut = cycle.plantation || cycle.semis;
    cycle.joursOccupation = (debut && cycle.derniereRecolte)
      ? daysBetween(debut, cycle.derniereRecolte) + 1
      : null;
    cycle.precociteJours = (debut && cycle.premiereRecolte)
      ? daysBetween(debut, cycle.premiereRecolte)
      : null;
    if (cycle.precociteJours !== null && cycle.precociteJours < 0) cycle.precociteJours = null;
  }
  if (cycle.joursOccupation !== null && cycle.joursOccupation <= 0) cycle.joursOccupation = null;

  cycle.dureeProduction = (cycle.premiereRecolte && cycle.derniereRecolte)
    ? daysBetween(cycle.premiereRecolte, cycle.derniereRecolte)
    : 0;

  const poids = cycle.recoltes.map(r => r.poids || 0);
  cycle.regulariteCV = poids.length >= 2 ? coefficientVariation(poids) : null;

  cycle.poidsParJour = cycle.joursOccupation ? cycle.poidsTotal / cycle.joursOccupation : null;

  const prixKg = PRIX_KG_PAR_ESPECE[cycle.espece];
  cycle.valeurEstimee = prixKg ? (cycle.poidsTotal / 1000) * prixKg : null;
  cycle.rentabiliteJour = (cycle.valeurEstimee && cycle.joursOccupation)
    ? cycle.valeurEstimee / cycle.joursOccupation
    : null;

  // Passthrough des données qualitatives (observation de saison)
  cycle.nbFruits = obs.nbFruits ?? null;
  cycle.maladies = obs.maladies || [];
  cycle.ravageurs = obs.ravageurs || [];
  cycle.echec = obs.echec || false;
  cycle.echecMotif = obs.echecMotif || '';
  cycle.noteGout = obs.noteGout ?? null;
  cycle.noteFaciliteCulture = obs.noteFaciliteCulture ?? null;
  cycle.commentaire = obs.commentaire || '';

  return cycle;
}

function buildCycles(recoltes, calendrier, observations) {
  recoltes = recoltes || [];
  calendrier = calendrier || [];
  observations = observations || [];

  const cyclesMap = new Map();

  recoltes.forEach(r => {
    if (!r.vegetal || !r.lieu || !r.date) return;

    const calEntry = findCalEntry(calendrier, r.vegetal, r.lieu);
    const perp = isPerpetuelle(r.vegetal, calEntry);

    // Non-perpétuelle : toutes les récoltes du cycle partagent la saison
    // de plantation. Perpétuelle : chaque récolte est classée par sa propre date.
    const baseDate = perp ? r.date : (calEntry?.plantation || calEntry?.semis || r.date);
    const saison = getSaisonFromDate(baseDate);
    if (!saison) return;

    const key = normalizeKey(r.vegetal) + '|' + r.lieu + '|' + saison.id;
    if (!cyclesMap.has(key)) {
      const famille = r.famille || calEntry?.famille || '';
      cyclesMap.set(key, {
        vegetal: r.vegetal,
        lieu: r.lieu,
        saisonId: saison.id,
        saisonLabel: saison.label,
        saisonType: saison.type,
        annee: parseInt(saison.id.match(/\d+/)[0], 10),
        famille,
        espece: getEspece(r.vegetal),
        nbPlants: calEntry?.nbPlants || null,
        semis: calEntry?.semis || null,
        plantation: calEntry?.plantation || null,
        estPerpetuelle: perp,
        recoltes: [],
      });
    }
    cyclesMap.get(key).recoltes.push(r);
  });

  const cycles = Array.from(cyclesMap.values());
  cycles.forEach(cycle => {
    cycle.observation = findObservation(observations, cycle.vegetal, cycle.lieu, cycle.saisonId);
    computeCycleMetrics(cycle);
  });

  return cycles;
}

// ── EXPORT ───────────────────────────────────────────────────────
const SelectionRules = {
  normalizeKey,
  getEspece,
  getSaisonFromDate,
  isPerpetuelle,
  findCalEntry,
  findObservation,
  buildCycles,
  computeCycleMetrics,
  daysBetween,
  coefficientVariation,
  ESPECE_OVERRIDES,
  SURFACE_PAR_PLANT_M2,
  PRIX_KG_PAR_ESPECE,
  FAMILLES_RECOLTE_UNIQUE,
  PERPETUELLES_CONNUES,
  SCORING_WEIGHTS_DEFAULT,
  RECOMMANDATION_SEUILS_DEFAULT,
  saisonSortKey,
  CRITERES_LABELS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelectionRules;
} else {
  (typeof window !== 'undefined' ? window : globalThis).SelectionRules = SelectionRules;
}
