const GEMINI_KEY = process.env.GEMINI_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });

  const { system, question, mode } = req.body;
  if (!question) return res.status(400).json({ error: 'Question manquante' });

  try {
    const prompt = system + '\n\nQuestion : ' + question;

    // Pour les recos JSON, on force le responseType JSON
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
    };

    // Si mode JSON, forcer la réponse JSON
    if (mode === 'json') {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
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
