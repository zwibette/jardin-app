// ── Variables d'environnement requises ───────────────────────
// MYFOOD_EMAIL      : login hub MyFood
// MYFOOD_PASSWORD   : mot de passe hub MyFood
// MYFOOD_UNIT_ID    : identifiant de la serre (ex: 664)

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

  const raw = await r.text();
  let d;
  try { d = JSON.parse(raw); } catch(e) {
    throw new Error('Auth non-JSON [' + r.status + ']: ' + raw.slice(0, 200));
  }

  const token = d?.data?.token || d?.Data?.token;
  if (!token) throw new Error('Token absent: ' + JSON.stringify(d).slice(0, 200));

  _tokenCache.token = token;
  _tokenCache.expiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

async function myfoodGet(path, params, token) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}?${qs}`;

  const r = await fetch(url, {
    headers: {
      'authorization': 'Bearer ' + token,
      'Accept': 'application/json',
      'Accept-Language': 'en-US',
    }
  });

  const raw = await r.text();
  console.log(`MyFood GET ${path} → ${r.status} | ${raw.slice(0, 120)}`);

  if (raw.trim().startsWith('<')) {
    throw new Error('HTML reçu [' + r.status + '] — auth refusée ou mauvais endpoint');
  }

  let d;
  try { d = JSON.parse(raw); } catch(e) {
    throw new Error('Non-JSON [' + r.status + ']: ' + raw.slice(0, 200));
  }

  // Erreur "Culture" → réessayer avec un nom de paramètre différent
  const msgs = d?.Messages || d?.messages || [];
  if (msgs.some(m => m.includes('Culture'))) {
    throw new Error('Culture error — paramètre incorrect: ' + qs);
  }

  return d;
}

async function myfoodGetWithTokenInUrl(path, params, token) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}?${qs}`;
  console.log('MyFood GET (token in url):', url.replace(token, 'TOKEN'));
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Accept-Language': 'en-US' }
  });
  const raw = await r.text();
  console.log(`MyFood GET token-url → ${r.status} | ${raw.slice(0, 120)}`);
  if (raw.trim().startsWith('<')) throw new Error('HTML reçu');
  return JSON.parse(raw);
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

    // Tester les différents noms de paramètre possibles
    const paramVariants = [
      { productionUnitId: unitId },
      { ProductionUnitId: unitId },
      { id: unitId },
      { Id: unitId },
    ];

    let resp = null;
    for (const params of paramVariants) {
      try {
        resp = await myfoodGet('/api/v1/ProductUnit/GetProductUnitDetailForUser', params, token);
        break;
      } catch(e) {
        console.log('Param variant failed:', JSON.stringify(params), e.message);
        resp = null;
      }
    }

    // Si toujours null, tenter avec le token en query string
    if (!resp) {
      try {
        resp = await myfoodGetWithTokenInUrl(
          '/api/v1/ProductUnit/GetProductUnitDetailForUser',
          { productionUnitId: unitId, token },
          token
        );
      } catch(e) {
        console.log('Token-in-URL failed:', e.message);
      }
    }

    if (!resp) {
      return res.status(500).json({ success: false, error: 'Aucun paramètre ne fonctionne' });
    }

    const d = resp?.data || resp?.Data;
    if (!d) {
      return res.status(500).json({ success: false, error: 'data absent: ' + JSON.stringify(resp).slice(0, 200) });
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
    _tokenCache = { token: null, expiresAt: 0 };
    console.error('MyFood error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
