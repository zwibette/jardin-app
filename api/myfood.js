const MYFOOD_ID = process.env.MYFOOD_ID || '703';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch(
      `https://hub.myfood.eu/opendata/productionunits/${MYFOOD_ID}/measures`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) throw new Error('MyFood HTTP ' + response.status);

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
