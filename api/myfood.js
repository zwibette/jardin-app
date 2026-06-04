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
    const url = `${BASE}/api/v1/ProductUnit/GetProductUnitDetailForUser?ProductUnitId=${unitId}`;
    const r = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
      }
    });
    const raw = await r.text();
    console.log('MyFood GET status:', r.status, '| raw:', raw.slice(0, 200));

    if (raw.trim().startsWith('<')) {
      // Invalider le cache et réessayer une fois avec un nouveau token
      _tokenCache = { token: null, expiresAt: 0 };
      const token2 = await getToken();
      const r2 = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + token2,
          'Accept': 'application/json',
          'Accept-Language': 'en-US',
        }
      });
      const raw2 = await r2.text();
      console.log('MyFood GET retry status:', r2.status, '| raw:', raw2.slice(0, 200));
      if (raw2.trim().startsWith('<')) {
        return res.status(503).json({ success: false, error: 'MyFood HTML reçu après retry' });
      }
      const resp2 = JSON.parse(raw2);
      const d2 = resp2?.data || resp2?.Data;
      if (!d2) return res.status(500).json({ success: false, error: 'data absent (retry)' });
      const get2 = (a, b) => d2[a] ?? d2[b] ?? null;
      return res.json({
        success: true,
        ph:           get2('currentPhValue',              'CurrentPhValue'),
        phTime:       get2('currentPhCaptureTime',         'CurrentPhCaptureTime'),
        waterTemp:    get2('currentWaterTempValue',        'CurrentWaterTempValue'),
        waterTempTime:get2('currentWaterTempCaptureTime',  'CurrentWaterTempCaptureTime'),
        airTemp:      get2('currentAirTempValue',          'CurrentAirTempValue'),
        humidity:     get2('currentHumidityValue',         'CurrentHumidityValue'),
      });
    }

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
