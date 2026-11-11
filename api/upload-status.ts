import { verifyPasscode } from './_config.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // 1. Verify Passcode
  const auth = verifyPasscode(req);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.message });
  }

  try {
    const uploadUrl = req.body?.uploadUrl || (req.headers['x-upload-url'] as string);

    if (!uploadUrl) {
      return res.status(400).json({ error: 'Missing uploadUrl in request body or header.' });
    }

    // SECURITY: reject unless starts with https://generativelanguage.googleapis.com/
    if (!uploadUrl.startsWith('https://generativelanguage.googleapis.com/')) {
      return res.status(400).json({
        error: 'Security violation: uploadUrl must point to https://generativelanguage.googleapis.com/',
      });
    }

    // Query Google Resumable Upload Status
    const googleResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': '0',
        'X-Goog-Upload-Command': 'query',
      },
    });

    if (!googleResponse.ok) {
      const errText = await googleResponse.text();
      return res.status(googleResponse.status).json({
        error: `Google status query error (${googleResponse.status}): ${errText}`,
        status: googleResponse.status,
      });
    }

    const sizeReceivedHeader =
      googleResponse.headers.get('x-goog-upload-size-received') ||
      googleResponse.headers.get('X-Goog-Upload-Size-Received') ||
      '0';

    const received = parseInt(sizeReceivedHeader, 10);

    return res.status(200).json({
      received: isNaN(received) ? 0 : received,
      uploadStatus: googleResponse.headers.get('x-goog-upload-status') || 'active',
    });
  } catch (error: any) {
    console.error('Error in /api/upload-status:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while querying upload status',
    });
  }
}
