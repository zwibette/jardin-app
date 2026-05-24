import crypto from 'crypto';

const TUYA_BASE = 'https://openapi.tuyaeu.com';
const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

function hmacSha256(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex').toUpperCase();
}

function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

async function getToken() {
  const t = Date.now().toString();
  const sign = hmacSha256(CLIENT_ID + t, CLIENT_SECRET);
  const res = await fetch(`${TUYA_BASE}/v1.0/token?grant_type=1`, {
    headers: { client_id: CLIENT_ID, t, sign, sign_method: 'HMAC-SHA256', nonce: '' }
  });
  const data = await res.json();
  if (!data.success) throw new Error('Token failed: ' + data.msg);
  return data.result.access_token;
}

async function tuyaGet(path, token) {
  const t = Date.now().toString();
  const strToSign = CLIENT_ID + token + t + 'GET\n\n\n' + path;
  const sign = hmacSha256(strToSign, CLIENT_SECRET);
  const res = await fetch(`${TUYA_BASE}${path}`, {
    headers: { client_id: CLIENT_ID, access_token: token, t, sign, sign_method: 'HMAC-SHA256', nonce: '' }
  });
  return res.json();
}

async function tuyaPost(path, token, body) {
  const t = Date.now().toString();
  const bodyStr = JSON.stringify(body);
  const bodyHash = sha256(bodyStr);
  const strToSign = CLIENT_ID + token + t + 'POST\n' + bodyHash + '\n\n' + path;
  const sign = hmacSha256(strToSign, CLIENT_SECRET);
  const res = await fetch(`${TUYA_BASE}${path}`, {
    method: 'POST',
    headers: { client_id: CLIENT_ID, access_token: token, t, sign, sign_method: 'HMAC-SHA256', 'Content-Type': 'application/json', nonce: '' },
    body: bodyStr
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action, deviceId, code, value } = req.method === 'POST'
      ? req.body
      : req.query;

    const token = await getToken();

    if (action === 'devices') {
      const data = await tuyaGet('/v1.0/iot-01/associated-users/devices?size=100', token);
      if (!data.success) return res.status(500).json({ error: data.msg });
      const devices = data.result?.devices || [];

      await Promise.all(devices.map(async d => {
        try {
          const s = await tuyaGet('/v1.0/devices/' + d.id + '/status', token);
          if (s.success) d.status_list = s.result;
        } catch(e) {}
      }));

      return res.json({ success: true, devices });
    }

    if (action === 'control' && deviceId && code !== undefined) {
      const data = await tuyaPost(
        '/v1.0/devices/' + deviceId + '/commands',
        token,
        { commands: [{ code, value: value === 'true' || value === true }] }
      );
      return res.json(data);
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
