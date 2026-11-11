import { verifyPasscode, getGeminiApiKey } from './_config.js';

export default async function handler(req: any, res: any) {
  // Allow GET or POST for flexibility
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET or POST.' });
  }

  // Verify Passcode
  const auth = verifyPasscode(req);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.message });
  }

  try {
    const rawName = (req.query?.name as string) || (req.body?.name as string);

    if (!rawName) {
      return res.status(400).json({
        error: 'Missing file resource name. Provide ?name=files/xxx',
      });
    }

    // Ensure the name is clean (e.g. "files/xxx")
    const fileName = rawName.startsWith('files/') ? rawName : `files/${rawName}`;

    const apiKey = getGeminiApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Failed to fetch file status from Gemini (${response.status}): ${errText}`,
      });
    }

    const data = await response.json();

    return res.status(200).json({
      name: data.name,
      state: data.state, // e.g. "PROCESSING", "ACTIVE", "FAILED"
      uri: data.uri,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      error: data.error,
    });
  } catch (error: any) {
    console.error('Error in /api/file-status:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while checking file status',
    });
  }
}
