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
  // Tester les deux noms de paramètre que l'API peut attendre
  const urls = [
    `${BASE}${path}?id=${unitId}`,
    `${BASE}${path}?productionUnitId=${unitId}`,
    `${BASE}${path}?ProductionUnitId=${unitId}`,
  ];
  for (const url of urls) {
    console.log('MyFood GET trying:', url);
    const r = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Accept-Language': 'fr-FR',
      }
    });
    const raw = await r.text();
    console.log('MyFood GET [' + url.split('?')[1] + '] status:', r.status, '| raw:', raw.slice(0, 80));
    if (!raw.trim().startsWith('<')) {
      // Réponse JSON — c'est le bon paramètre
      try { return JSON.parse(raw); } catch(e) {
        throw new Error('GET réponse non-JSON: ' + raw.slice(0, 200));
      }
    }
  }
  throw new Error('Aucun paramètre ne retourne du JSON pour ' + path);
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
