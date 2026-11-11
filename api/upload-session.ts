import { verifyPasscode, getGeminiApiKey } from './_config.js';

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // Verify Passcode
  const auth = verifyPasscode(req);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.message });
  }

  try {
    const { mimeType, size, displayName } = req.body || {};

    if (!mimeType || !size) {
      return res.status(400).json({
        error: 'Missing required parameters: mimeType and size are required.',
      });
    }

    const apiKey = getGeminiApiKey();

    // Initiate Google Gemini Files API Resumable Upload
    const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(initUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: {
          display_name: displayName || 'Bisaya_Audio_File',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Failed to initiate Gemini upload session (${response.status}): ${errText}`,
      });
    }

    const uploadUrl = response.headers.get('x-goog-upload-url') || response.headers.get('X-Goog-Upload-URL');

    if (!uploadUrl) {
      return res.status(502).json({
        error: 'Gemini Files API did not return an upload URL in x-goog-upload-url header.',
      });
    }

    // Return the upload URL to the browser.
    // The browser uploads the bytes directly to Google, avoiding Vercel 4.5MB payload limits.
    // The user's GEMINI_API_KEY is NOT exposed to the client.
    return res.status(200).json({ uploadUrl });
  } catch (error: any) {
    console.error('Error in /api/upload-session:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while starting upload session',
    });
  }
}
