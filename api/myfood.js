// ── Variables d'environnement requises ───────────────────────
// MYFOOD_EMAIL      : login hub MyFood
// MYFOOD_PASSWORD   : mot de passe hub MyFood
// MYFOOD_UNIT_ID    : identifiant de la serre (ex: 703)

const BASE = 'https://hub.myfood.eu';

let _tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }

  const r = await fetch(`${BASE}/api/identity/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'fr-FR',
    },
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

  // Accepter minuscules ou majuscules
  const token = d?.data?.token || d?.Data?.token || d?.data?.Token || d?.Data?.Token;
  if (!token) {
    throw new Error('Token absent dans la réponse auth: ' + JSON.stringify(d).slice(0, 300));
  }

  _tokenCache.token = token;
  _tokenCache.expiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

async function myfoodGet(path, unitId, token) {
  const url = `${BASE}${path}?productionUnitId=${unitId}`;
  // Tester plusieurs variantes de headers Authorization
  const headerVariants = [
    { 'authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    { 'Authorization': token, 'Accept': 'application/json' },
    { 'authorization': token, 'Accept': 'application/json' },
  ];
  for (const headers of headerVariants) {
    console.log('MyFood GET headers:', JSON.stringify(Object.keys(headers)), 'auth prefix:', headers.Authorization || headers.authorization ? (headers.Authorization || headers.authorization).slice(0,15) : 'none');
    const r = await fetch(url, { headers });
    const raw = await r.text();
    console.log('  → status:', r.status, '| JSON?', !raw.trim().startsWith('<'), '| raw:', raw.slice(0, 60));
    if (!raw.trim().startsWith('<')) {
      try { return JSON.parse(raw); } catch(e) {
        throw new Error('GET réponse non-JSON: ' + raw.slice(0, 200));
      }
    }
  }
  throw new Error('Aucune variante de header ne retourne du JSON');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.MYFOOD_EMAIL || !process.env.MYFOOD_PASSWORD) {
    return res.status(500).json({ success: false, error: 'MYFOOD_EMAIL / MYFOOD_PASSWORD manquants' });
  }

  const unitId = process.env.MYFOOD_UNIT_ID || '703';

  try {
    const token = await getToken();
    console.log('MyFood token ok, length:', token ? token.length : 'NULL');
    const resp  = await myfoodGet('/api/v1/ProductUnit/GetProductUnitDetailForUser', unitId, token);
    console.log('MyFood detail:', JSON.stringify(resp).slice(0, 400));

    // Accepter data ou Data
    const d = resp?.data || resp?.Data;
    if (!d) {
      return res.status(500).json({ success: false, error: 'Champ data absent: ' + JSON.stringify(resp).slice(0, 200) });
    }

    // Accepter camelCase ou PascalCase pour chaque champ
    const get = (a, b) => d[a] ?? d[b] ?? null;

    return res.json({
      success:      true,
      ph:           get('currentPhValue',             'CurrentPhValue'),
      phTime:       get('currentPhCaptureTime',        'CurrentPhCaptureTime'),
      waterTemp:    get('currentWaterTempValue',       'CurrentWaterTempValue'),
      waterTempTime:get('currentWaterTempCaptureTime', 'CurrentWaterTempCaptureTime'),
      airTemp:      get('currentAirTempValue',         'CurrentAirTempValue'),
      humidity:     get('currentHumidityValue',        'CurrentHumidityValue'),
    });

  } catch(e) {
    _tokenCache = { token: null, expiresAt: 0 };
    return res.status(500).json({ success: false, error: e.message });
  }
};
