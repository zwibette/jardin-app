const crypto = require('crypto');

const TUYA_BASE = 'https://openapi.tuyaeu.com';

function hmacSha256(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex').toUpperCase();
}

function sha256(message) {
  return crypto.createHash('sha256').update(message || '').digest('hex');
}

function buildSign(clientId, secret, t, nonce, accessToken, method, path, body) {
  // Tuya v2.0 signing formula
  const contentHash = sha256(body || '');
  const signStr = method.toUpperCase() + '\n' + contentHash + '\n' + '\n' + path;
  const strToSign = clientId + (accessToken || '') + t + nonce + signStr;
  return hmacSha256(strToSign, secret);
}

async function getToken(clientId, clientSecret) {
  const t = Date.now().toString();
  const nonce = '';
  const path = '/v1.0/token?grant_type=1';
  const sign = buildSign(clientId, clientSecret, t, nonce, '', 'GET', path, '');

  const res = await fetch(`${TUYA_BASE}${path}`, {
    headers: {
      'client_id': clientId,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error('Token invalide: ' + data.msg + ' (code: ' + data.code + ')');
  return data.result.access_token;
}

async function tuyaGet(path, clientId, clientSecret, token) {
  const t = Date.now().toString();
  const nonce = '';
  const sign = buildSign(clientId, clientSecret, t, nonce, token, 'GET', path, '');

  const res = await fetch(`${TUYA_BASE}${path}`, {
    headers: {
      'client_id': clientId,
      'access_token': token,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
    }
  });
  return res.json();
}

async function tuyaPost(path, clientId, clientSecret, token, body) {
  const t = Date.now().toString();
  const nonce = '';
  const bodyStr = JSON.stringify(body);
  const sign = buildSign(clientId, clientSecret, t, nonce, token, 'POST', path, bodyStr);

  const res = await fetch(`${TUYA_BASE}${path}`, {
    method: 'POST',
    headers: {
      'client_id': clientId,
      'access_token': token,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'Content-Type': 'application/json',
    },
    body: bodyStr
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.TUYA_CLIENT_ID;
  const clientSecret = process.env.TUYA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Variables env manquantes' });
  }

  try {
    const params = req.method === 'POST' ? req.body : req.query;
    const { action, deviceId, code, value } = params;

    const token = await getToken(clientId, clientSecret);

    if (action === 'devices') {
      const data = await tuyaGet('/v1.0/iot-01/associated-users/devices?size=100', clientId, clientSecret, token);
      if (!data.success) return res.status(500).json({ error: 'Devices: ' + data.msg, code: data.code });
      const devices = data.result?.devices || [];
      await Promise.all(devices.map(async d => {
        try {
          const s = await tuyaGet('/v1.0/devices/' + d.id + '/status', clientId, clientSecret, token);
          if (s.success) d.status_list = s.result;
        } catch(e) {}
      }));
      return res.json({ success: true, devices });
    }

    if (action === 'control' && deviceId && code !== undefined) {
      const val = value === 'true' || value === true;
      const data = await tuyaPost(
        '/v1.0/devices/' + deviceId + '/commands',
        clientId, clientSecret, token,
        { commands: [{ code, value: val }] }
      );
      return res.json(data);
    }

    return res.status(400).json({ error: 'Action inconnue: ' + action });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
