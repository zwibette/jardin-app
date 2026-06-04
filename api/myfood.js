// ── Variables d'environnement requises ───────────────────────
// MYFOOD_EMAIL      : login hub MyFood
// MYFOOD_PASSWORD   : mot de passe hub MyFood
// MYFOOD_UNIT_ID    : identifiant de la serre (ex: 664)
//
// NOTE : L'API MyFood nécessite des cookies de session navigateur
// en plus du Bearer token. En attente de clarification du support MyFood.

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
      'Accept-Language': 'en-US',
    },
    body: JSON.stringify({
      UserName: process.env.MYFOOD_EMAIL,
      Password: process.env.MYFOOD_PASSWORD,
    })
  });
  const d = await r.json();
  const token = d?.data?.token || d?.Data?.token;
  if (!token) throw new Error('Token absent');
  _tokenCache.token = token;
  _tokenCache.expiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.MYFOOD_EMAIL || !process.env.MYFOOD_PASSWORD) {
    return res.status(500).json({ success: false, error: 'Variables env manquantes' });
  }

  const unitId = process.env.MYFOOD_UNIT_ID || '664';

  try {
    const token = await getToken();
    const baseVariants = [
      'https://hub.myfood.eu',
      'https://api.myfood.eu',
      'https://hub.myfood.eu/api',
    ];
    const pathVariants = [
      '/api/v1/ProductUnit/GetProductUnitDetailForUser',
      '/v1/ProductUnit/GetProductUnitDetailForUser',
      '/ProductUnit/GetProductUnitDetailForUser',
    ];
    const paramVariants = ['ProductUnitId', 'productionUnitId', 'id'];

    let raw = null, finalUrl = null;
    outer: for (const base of baseVariants) {
      for (const path of pathVariants) {
        for (const param of paramVariants) {
          const testUrl = `${base}${path}?${param}=${unitId}`;
          try {
            const tr = await fetch(testUrl, {
              headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Accept-Language': 'en-US' }
            });
            const testRaw = await tr.text();
            console.log(`Try ${testUrl} → ${tr.status} | json:${!testRaw.trim().startsWith('<')} | ${testRaw.slice(0,60)}`);
            if (!testRaw.trim().startsWith('<') && tr.status === 200) {
              raw = testRaw; finalUrl = testUrl; break outer;
            }
          } catch(e) { console.log(`Try ${testUrl} → error: ${e.message}`); }
        }
      }
    }

    if (!raw) {
      return res.status(503).json({ success: false, error: 'Aucun endpoint ne retourne du JSON' });
    }
    console.log('MyFood SUCCESS url:', finalUrl, '| raw:', raw.slice(0, 200));

    const resp = JSON.parse(raw);
    const d = resp?.data || resp?.Data;
    if (!d) return res.status(500).json({ success: false, error: 'data absent' });

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
    _tokenCache = { token: null, expiresAt: 0 };
    return res.status(500).json({ success: false, error: e.message });
  }
};
