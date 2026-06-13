// ── api/cron-serre.js ────────────────────────────────────────
// Cron Vercel (toutes les 30 min) :
//   1. Récupère temp + hum depuis Tuya
//   2. Écrit un point horodaté dans Sheets onglet "HistoriqueSerre"
//
// Variables d'environnement requises :
//   TUYA_CLIENT_ID, TUYA_CLIENT_SECRET
//   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID

const crypto = require('crypto');

// ── Tuya ─────────────────────────────────────────────────────
const TUYA_BASE = 'https://openapi.tuyaeu.com';

function hmacSha256(msg, secret) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').toUpperCase();
}
function sha256(msg) {
  return crypto.createHash('sha256').update(msg || '').digest('hex');
}
function buildSign(clientId, secret, t, nonce, token, method, path, body) {
  const contentHash = sha256(body || '');
  const signStr = method.toUpperCase() + '\n' + contentHash + '\n\n' + path;
  const strToSign = clientId + (token || '') + t + nonce + signStr;
  return hmacSha256(strToSign, secret);
}

async function tuyaToken(clientId, secret) {
  const t = Date.now().toString(), nonce = '';
  const path = '/v1.0/token?grant_type=1';
  const sign = buildSign(clientId, secret, t, nonce, '', 'GET', path, '');
  const res = await fetch(`${TUYA_BASE}${path}`, {
    headers: { client_id: clientId, t, sign, sign_method: 'HMAC-SHA256', nonce }
  });
  const d = await res.json();
  if (!d.success) throw new Error('Token Tuya: ' + d.msg);
  return d.result.access_token;
}

async function tuyaGet(path, clientId, secret, token) {
  const t = Date.now().toString(), nonce = '';
  const sign = buildSign(clientId, secret, t, nonce, token, 'GET', path, '');
  const res = await fetch(`${TUYA_BASE}${path}`, {
    headers: { client_id: clientId, access_token: token, t, sign, sign_method: 'HMAC-SHA256', nonce }
  });
  return res.json();
}

async function getTuyaTempHum(clientId, secret) {
  const token = await tuyaToken(clientId, secret);
  const data = await tuyaGet('/v1.0/iot-01/associated-users/devices?size=100', clientId, secret, token);
  if (!data.success) throw new Error('Devices Tuya: ' + data.msg);

  // Trouver le capteur T/H serre (va_temperature + va_humidity)
  const devices = data.result?.devices || [];
  for (const d of devices) {
    try {
      const s = await tuyaGet('/v1.0/devices/' + d.id + '/status', clientId, secret, token);
      if (!s.success) continue;
      const statuses = s.result || [];
      const temp = statuses.find(x => x.code === 'va_temperature')?.value;
      const hum  = statuses.find(x => x.code === 'va_humidity')?.value;
      if (temp !== undefined && hum !== undefined) {
        return { temp: parseFloat(temp), hum: parseFloat(hum) };
      }
    } catch(e) { /* passer au suivant */ }
  }
  throw new Error('Capteur T/H serre introuvable');
}

// ── Google Sheets ─────────────────────────────────────────────
const SHEET_SERRE = 'HistoriqueSerre';

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getGoogleToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const sig = base64url(sign.sign(privateKey));
  const jwt = header + '.' + payload + '.' + sig;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('Token Google: ' + JSON.stringify(d));
  return d.access_token;
}

async function sheetsGet(sheetId, path, token) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  return res.json();
}

async function sheetsPost(sheetId, path, token, body) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function ensureSheet(sheetId, token) {
  const meta = await sheetsGet(sheetId, '', token);
  const exists = (meta.sheets || []).some(s => s.properties.title === SHEET_SERRE);
  if (!exists) {
    await sheetsPost(sheetId, ':batchUpdate', token, {
      requests: [{ addSheet: { properties: { title: SHEET_SERRE } } }]
    });
    // En-têtes
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(SHEET_SERRE)}!A1:C1?valueInputOption=RAW`,
      { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [['timestamp', 'temperature', 'humidite']] }) }
    );
  }
}

async function appendRow(sheetId, token, temp, hum) {
  const timestamp = new Date().toISOString();
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(SHEET_SERRE)}!A:C:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[timestamp, temp, hum]] }) }
  );
}

// ── Handler ───────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId   = process.env.TUYA_CLIENT_ID;
  const secret     = process.env.TUYA_CLIENT_SECRET;
  const email      = process.env.GOOGLE_CLIENT_EMAIL;
  const sheetId    = process.env.GOOGLE_SHEET_ID;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientId || !secret || !email || !sheetId || !privateKey) {
    return res.status(500).json({ error: 'Variables env manquantes' });
  }

  try {
    const { temp, hum } = await getTuyaTempHum(clientId, secret);
    const gToken = await getGoogleToken(email, privateKey);
    await ensureSheet(sheetId, gToken);
    await appendRow(sheetId, gToken, temp, hum);
    console.log(`[cron-serre] ${new Date().toISOString()} — temp=${temp}°C hum=${hum}%`);
    return res.json({ success: true, temp, hum, ts: new Date().toISOString() });
  } catch(e) {
    console.error('[cron-serre] Erreur:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
