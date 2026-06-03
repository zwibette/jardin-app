// ── Variables d'environnement requises ───────────────────────
// MYFOOD_EMAIL      : login hub MyFood
// MYFOOD_PASSWORD   : mot de passe hub MyFood
// MYFOOD_UNIT_ID    : identifiant de la serre (ex: 703)

const BASE = 'https://hub.myfood.eu';

// Cache token en mémoire (durée de vie du serverless = courte, mais évite les doubles appels)
let _tokenCache = { token: null, refreshToken: null, expiresAt: 0 };

async function getToken() {
  const now = Date.now();
  // Token encore valide (marge 60s)
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }
  // Refresh si on a un refreshToken
  if (_tokenCache.token && _tokenCache.refreshToken) {
    try {
      const r = await fetch(`${BASE}/api/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _tokenCache.token, refreshToken: _tokenCache.refreshToken })
      });
      const d = await r.json();
      if (d.succeeded && d.data?.token) {
        _storeToken(d.data);
        return _tokenCache.token;
      }
    } catch(e) { /* fall through to re-login */ }
  }
  // Login complet — double slash comme dans la doc officielle
  const r = await fetch(`${BASE}//api/identity/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
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
  try { d = JSON.parse(raw); } catch(e) { throw new Error('MyFood réponse non-JSON: ' + raw.slice(0,200)); }
  if (!d.succeeded || !d.data?.token) {
    throw new Error('MyFood auth échouée: ' + JSON.stringify(d));
  }
  _storeToken(d.data);
  return _tokenCache.token;
}

function _storeToken(data) {
  _tokenCache.token = data.token;
  _tokenCache.refreshToken = data.refreshToken || _tokenCache.refreshToken;
  // refreshTokenExpiryTime est souvent "0001-01-01" (pas d'expiration fixe côté API)
  // On fixe une expiration conservative de 50 minutes
  _tokenCache.expiresAt = Date.now() + 50 * 60 * 1000;
}

async function myfoodGet(path, unitId, token) {
  const url = `${BASE}${path}?productionUnitId=${unitId}`;
  const r = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
      'Accept-Language': 'fr-FR',
    }
  });
  if (!r.ok) throw new Error('MyFood HTTP ' + r.status + ' sur ' + path);
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email    = process.env.MYFOOD_EMAIL;
  const password = process.env.MYFOOD_PASSWORD;
  const unitId   = process.env.MYFOOD_UNIT_ID || '703';

  if (!email || !password) {
    return res.status(500).json({ success: false, error: 'MYFOOD_EMAIL / MYFOOD_PASSWORD manquants' });
  }

  try {
    const token = await getToken();
    const data  = await myfoodGet('/api/v1/ProductUnit/GetProductUnitDetailForUser', unitId, token);

    if (!data.succeeded) {
      return res.status(500).json({ success: false, error: 'MyFood API: ' + JSON.stringify(data.messages) });
    }

    const d = data.data;
    return res.json({
      success: true,
      ph:           d.currentPhValue          ?? null,
      phTime:       d.currentPhCaptureTime     ?? null,
      waterTemp:    d.currentWaterTempValue    ?? null,
      waterTempTime:d.currentWaterTempCaptureTime ?? null,
      airTemp:      d.currentAirTempValue      ?? null,
      humidity:     d.currentHumidityValue     ?? null,
    });

  } catch(e) {
    // Reset cache en cas d'erreur auth pour forcer un re-login au prochain appel
    _tokenCache = { token: null, refreshToken: null, expiresAt: 0 };
    return res.status(500).json({ success: false, error: e.message });
  }
};
