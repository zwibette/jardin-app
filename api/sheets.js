const https = require('https');

const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Récoltes';

// ── JWT Google ────────────────────────────────────────────────
function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const { createSign } = require('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const signature = base64url(sign.sign(PRIVATE_KEY));
  const jwt = header + '.' + payload + '.' + signature;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token Google échoué: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Helpers Sheets API ────────────────────────────────────────
async function sheetsGet(path, token) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  return res.json();
}

async function sheetsPost(path, token, body) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function sheetsPut(path, token, body) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

// ── Initialiser la feuille si vide ────────────────────────────
async function initSheet(token) {
  // Vérifier si l'onglet existe
  const meta = await sheetsGet('', token);
  const sheets = meta.sheets || [];
  const exists = sheets.some(s => s.properties.title === SHEET_NAME);

  if (!exists) {
    await sheetsPost(':batchUpdate', token, {
      requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
    });
  }

  // Vérifier si headers existent
  const data = await sheetsGet(`/values/${encodeURIComponent(SHEET_NAME)}!A1:H1`, token);
  const rows = data.values || [];
  if (!rows.length || rows[0][0] !== 'ID') {
    await sheetsPut(
      `/values/${encodeURIComponent(SHEET_NAME)}!A1:H1?valueInputOption=RAW`,
      token,
      { values: [['ID', 'Végétal', 'Famille', 'Lieu', 'Poids (g)', 'Date', 'Note', 'Timestamp']] }
    );
  }
}

// ── Lire toutes les récoltes ──────────────────────────────────
async function readRecoltes(token) {
  const data = await sheetsGet(`/values/${encodeURIComponent(SHEET_NAME)}!A2:H`, token);
  const rows = data.values || [];
  return rows.map(r => ({
    id: r[0] || '',
    vegetal: r[1] || '',
    famille: r[2] || '',
    lieu: r[3] || '',
    poids: parseInt(r[4]) || 0,
    date: r[5] || '',
    note: r[6] ? parseInt(r[6]) : null,
    timestamp: r[7] || '',
  })).filter(r => r.id);
}

// ── Écrire toutes les récoltes (sync complète) ────────────────
async function writeAllRecoltes(token, recoltes) {
  // Effacer d'abord les données existantes
  await sheetsPost(`/values/${encodeURIComponent(SHEET_NAME)}!A2:H:clear`, token, {});

  if (!recoltes.length) return;

  const values = recoltes.map(r => [
    r.id || ('r' + Date.now() + Math.random()),
    r.vegetal || '',
    r.famille || '',
    r.lieu || '',
    r.poids || 0,
    r.date || '',
    r.note || '',
    r.timestamp || new Date().toISOString(),
  ]);

  await sheetsPut(
    `/values/${encodeURIComponent(SHEET_NAME)}!A2:H?valueInputOption=RAW`,
    token,
    { values }
  );
}

// ── Handler principal ─────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getGoogleToken();
    await initSheet(token);

    if (req.method === 'GET') {
      // Lire les récoltes depuis Sheets
      const recoltes = await readRecoltes(token);
      return res.json({ success: true, recoltes });
    }

    if (req.method === 'POST') {
      const { recoltes } = req.body;
      if (!Array.isArray(recoltes)) return res.status(400).json({ error: 'recoltes manquantes' });
      await writeAllRecoltes(token, recoltes);
      return res.json({ success: true, count: recoltes.length });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch(e) {
    console.error('Sheets error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
