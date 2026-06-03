// ── Variables d'environnement requises ───────────────────────
// MYFOOD_EMAIL      : login hub MyFood
// MYFOOD_PASSWORD   : mot de passe hub MyFood
// MYFOOD_UNIT_ID    : identifiant de la serre (ex: 664)

const BASE = 'https://hub.myfood.eu';

let _tokenCache = { token: null, expiresAt: 0 };

const HEADERS_AUTH = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Accept-Language': 'fr-FR',
};

async function getToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }

  const r = await fetch(`${BASE}/api/identity/token`, {
    method: 'POST',
    headers: HEADERS_AUTH,
    body: JSON.stringify({
      UserName: process.env.MYFOOD_EMAIL,
      Password: process.env.MYFOOD_PASSWORD,
    })
  });

  const raw = await r.text();
  let d;
  try { d = JSON.parse(raw); } catch(e) {
    throw new Error('Auth réponse non-JSON [' + r.status + ']: ' + raw.slice(0, 200));
  }

  const token = d?.data?.token || d?.Data?.token || d?.data?.Token || d?.Data?.Token;
  if (!token) {
    throw new Error('Token absent: ' + JSON.stringify(d).slice(0, 300));
  }

  _tokenCache.token = token;
  _tokenCache.expiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

async function myfoodGet(path, unitId, token) {
  // Tester toutes les combinaisons possibles : header casse + cookie + query param token
  const variants = [
    { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Accept-Language': 'fr-FR' } },
    { headers: { 'authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Accept-Language': 'fr-FR' } },
    { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Accept-Language': 'fr-FR', 'Cookie': 'token=' + token } },
    { headers: { 'Authorization': token, 'Accept': 'application/json', 'Accept-Language': 'fr-FR' } },
  ];

  for (let i = 0; i < variants.length; i++) {
    const url = `${BASE}${path}?productionUnitId=${unitId}`;
    const r = await fetch(url, { headers: variants[i].headers });
    const raw = await r.text();
    const isJson = !raw.trim().startsWith('<');
    console.log(`MyFood GET variant ${i} → status:${r.status} json:${isJson} raw:${raw.slice(0,60)}`);
    if (isJson) {
      try { return JSON.parse(raw); } catch(e) {
        throw new Error('GET réponse non-JSON: ' + raw.slice(0, 200));
      }
    }
  }
  throw new Error('Toutes les variantes retournent du HTML');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.MYFOOD_EMAIL || !process.env.MYFOOD_PASSWORD) {
    return res.status(500).json({ success: false, error: 'MYFOOD_EMAIL / MYFOOD_PASSWORD manquants' });
  }

  const unitId = process.env.MYFOOD_UNIT_ID || '664';

  try {
    const token = await getToken();
    const resp  = await myfoodGet('/api/v1/ProductUnit/GetProductUnitDetailForUser', unitId, token);

    console.log('MyFood resp:', JSON.stringify(resp).slice(0, 400));
    const succeeded = resp?.succeeded || resp?.Succeeded;
    const d = resp?.data || resp?.Data;

    if (!succeeded || !d) {
      return res.status(500).json({ success: false, error: 'MyFood: ' + JSON.stringify(resp?.messages || resp?.Messages) });
    }

    const get = (a, b) => d[a] ?? d[b] ?? null;

    return res.json({
      success:      true,
      ph:           get('currentPhValue',              'CurrentPhValue'),
      phTime:       get('currentPhCaptureTime',         'CurrentPhCaptureTime'),
      waterTemp:    get('currentWaterTempValue',        'CurrentWaterTempValue'),
      waterTempTime:get('currentWaterTempCaptureTime',  'CurrentWaterTempCaptureTime'),
      airTemp:      get('currentAirTempValue',          'CurrentAirTempValue'),
      humidity:     get('currentHumidityValue',         'CurrentHumidityValue'),
    });

  } catch(e) {
    console.error('MyFood catch:', e.message, e.stack?.slice(0, 300));
    _tokenCache = { token: null, expiresAt: 0 };
    return res.status(500).json({ success: false, error: e.message || 'Erreur inconnue' });
  }
};
