const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_RECOLTES   = 'Récoltes';
const SHEET_HISTORIQUE = 'Historique';       // Sigfox (bassin, etc.)
const SHEET_SERRE      = 'HistoriqueSerre';  // Tuya serre (cron)

// ── JWT Google ────────────────────────────────────────────────
function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const { createSign } = require('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const signature = base64url(sign.sign(PRIVATE_KEY));
  const jwt = header + '.' + payload + '.' + signature;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token Google: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Helpers Sheets ────────────────────────────────────────────
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

// ── Init onglets ──────────────────────────────────────────────
async function initRecoltes(token) {
  const meta = await sheetsGet('', token);
  const sheets = meta.sheets || [];
  if (!sheets.some(s => s.properties.title === SHEET_RECOLTES)) {
    await sheetsPost(':batchUpdate', token, { requests: [{ addSheet: { properties: { title: SHEET_RECOLTES } } }] });
  }
  const data = await sheetsGet(`/values/${encodeURIComponent(SHEET_RECOLTES)}!A1:H1`, token);
  if (!(data.values || []).length || data.values[0][0] !== 'ID') {
    await sheetsPut(
      `/values/${encodeURIComponent(SHEET_RECOLTES)}!A1:H1?valueInputOption=RAW`, token,
      { values: [['ID','Végétal','Famille','Lieu','Poids (g)','Date','Note','Timestamp']] }
    );
  }
}

async function initHistorique(token) {
  const meta = await sheetsGet('', token);
  const sheets = meta.sheets || [];
  if (!sheets.some(s => s.properties.title === SHEET_HISTORIQUE)) {
    await sheetsPost(':batchUpdate', token, { requests: [{ addSheet: { properties: { title: SHEET_HISTORIQUE } } }] });
    await sheetsPut(
      `/values/${encodeURIComponent(SHEET_HISTORIQUE)}!A1:D1?valueInputOption=RAW`, token,
      { values: [['timestamp','temperature','humidite','source']] }
    );
  }
}

// ── Récoltes ──────────────────────────────────────────────────
async function readRecoltes(token) {
  const data = await sheetsGet(`/values/${encodeURIComponent(SHEET_RECOLTES)}!A2:H`, token);
  return (data.values || []).map(r => ({
    id: r[0]||'', vegetal: r[1]||'', famille: r[2]||'', lieu: r[3]||'',
    poids: parseInt(r[4])||0, date: r[5]||'',
    note: r[6] ? parseInt(r[6]) : null, timestamp: r[7]||'',
  })).filter(r => r.id);
}

async function writeAllRecoltes(token, recoltes) {
  await sheetsPost(`/values/${encodeURIComponent(SHEET_RECOLTES)}!A2:H:clear`, token, {});
  if (!recoltes.length) return;
  await sheetsPut(
    `/values/${encodeURIComponent(SHEET_RECOLTES)}!A2:H?valueInputOption=RAW`, token,
    { values: recoltes.map(r => [
        r.id||('r'+Date.now()), r.vegetal||'', r.famille||'', r.lieu||'',
        r.poids||0, r.date||'', r.note||'', r.timestamp||new Date().toISOString(),
    ]) }
  );
}

// ── Historique Sigfox (bassin etc.) ──────────────────────────
async function appendHistorique(token, temp, hum) {
  await initHistorique(token);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_HISTORIQUE)}!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' },
      body: JSON.stringify({ values: [[new Date().toISOString(), parseFloat(temp), parseFloat(hum), 'sigfox']] }) }
  );
}

async function readHistorique(token, range) {
  await initHistorique(token);
  const data = await sheetsGet(`/values/${encodeURIComponent(SHEET_HISTORIQUE)}!A:D`, token);
  return _filterAndSample(data.values || [], range);
}

// ── Historique Serre Tuya (cron) ──────────────────────────────
async function readHistoriqueSerre(token, range) {
  const data = await sheetsGet(`/values/${encodeURIComponent(SHEET_SERRE)}!A:C`, token);
  return _filterAndSample(data.values || [], range);
}

function _filterAndSample(rows, range) {
  if (rows.length <= 1) return { data: [], total: 0 };
  const ms = { '24h':86400000, '3d':259200000, '7d':604800000, '30d':2592000000 };
  const cutoff = Date.now() - (ms[range] || ms['24h']);
  const filtered = rows.slice(1)
    .filter(r => r[0] && new Date(r[0]).getTime() >= cutoff)
    .map(r => ({ t: r[0], temp: parseFloat(r[1])||null, hum: parseFloat(r[2])||null }));
  const step = range==='30d'?12:range==='7d'?3:range==='3d'?2:1;
  return { data: filtered.filter((_,i)=>i%step===0), total: filtered.length };
}

// ── Handler ───────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getGoogleToken();
    const params = req.method === 'POST' ? req.body : req.query;
    const action = params?.action;

    // ── Historique Sigfox ─────────────────────────────────────
    if (action === 'append_history') {
      const { temp, hum } = params;
      if (temp===undefined||hum===undefined) return res.status(400).json({ error:'temp et hum requis' });
      await appendHistorique(token, temp, hum);
      return res.json({ success: true });
    }
    if (action === 'get_history') {
      const range = params.range || '24h';
      const result = await readHistorique(token, range);
      return res.json({ success:true, ...result, range });
    }

    // ── Historique Serre Tuya ─────────────────────────────────
    if (action === 'get_history_serre') {
      const range = params.range || '24h';
      const result = await readHistoriqueSerre(token, range);
      return res.json({ success:true, ...result, range });
    }

    // ── Récoltes ──────────────────────────────────────────────
    await initRecoltes(token);
    if (req.method === 'GET') {
      const recoltes = await readRecoltes(token);
      return res.json({ success:true, recoltes });
    }
    if (req.method === 'POST') {
      const { recoltes } = req.body;
      if (!Array.isArray(recoltes)) return res.status(400).json({ error:'recoltes manquantes' });
      await writeAllRecoltes(token, recoltes);
      return res.json({ success:true, count:recoltes.length });
    }

    return res.status(405).json({ error:'Méthode non autorisée' });

  } catch(e) {
    console.error('Sheets error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
