const GEMINI_KEY = process.env.GEMINI_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const { system, question, mode, imageBase64, imageMime } = req.body;
  if (!question) return res.status(400).json({ error: 'Question manquante' });

  // ── MODE VISION : analyse photo via Gemini (gratuit, supporte base64) ───
  if (mode === 'vision') {
    if (!imageBase64) return res.status(400).json({ error: 'Image manquante' });
    if (!GEMINI_KEY)  return res.status(500).json({ error: 'Clé Gemini manquante (GEMINI_API_KEY)' });

    try {
      const prompt = (system ? system + '\n\n' : '') + question;
      const requestBody = {
        contents: [{
          parts: [
            { inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
      };

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }
      );

      if (!response.ok) {
        const err = await response.text();
        return res.status(500).json({ error: 'Erreur Gemini vision: ' + err.substring(0, 300) });
      }

      const data = await response.json();
      if (data.error) return res.status(500).json({ error: 'Erreur Gemini: ' + JSON.stringify(data.error) });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) return res.status(500).json({ error: 'Réponse vide de Gemini' });
      return res.json({ success: true, text });

    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── MODE TEXTE (défaut) : conseils via Gemini ─────────────────────────────
  if (!GEMINI_KEY) return res.status(500).json({ error: 'Clé Gemini manquante (GEMINI_API_KEY)' });

  try {
    const prompt = system + '\n\nQuestion : ' + question;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    };

    // Mode JSON forcé si demandé
    if (mode === 'json') {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Erreur Gemini: ' + err.substring(0, 300) });
    }

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: 'Erreur Gemini: ' + JSON.stringify(data.error) });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Reponse vide de Gemini' });
    return res.json({ success: true, text });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
