import { verifyPasscode } from './_config.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Safely read raw stream into a Buffer with a strict 4 MB cap.
 */
async function readRawBody(req: any, maxBytes: number = 4 * 1024 * 1024): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) {
      throw new Error(`Chunk size (${req.body.length} bytes) exceeds limit of 4 MB`);
    }
    return req.body;
  }

  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buf.length;
    if (totalLength > maxBytes) {
      throw new Error(`Chunk size exceeds limit of 4 MB`);
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // 1. Verify Passcode
  const auth = verifyPasscode(req);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.message });
  }

  // 2. Validate Headers
  const uploadUrl = (req.headers['x-upload-url'] || req.headers['X-Upload-Url']) as string;
  const xOffset = (req.headers['x-offset'] || req.headers['X-Offset']) as string;
  const xFinal = (req.headers['x-final'] || req.headers['X-Final']) as string;

  if (!uploadUrl) {
    return res.status(400).json({ error: 'Missing x-upload-url header.' });
  }

  // SECURITY: reject unless starts with https://generativelanguage.googleapis.com/
  if (!uploadUrl.startsWith('https://generativelanguage.googleapis.com/')) {
    return res.status(400).json({
      error: 'Security violation: x-upload-url must point to https://generativelanguage.googleapis.com/',
    });
  }

  if (xOffset === undefined || isNaN(Number(xOffset))) {
    return res.status(400).json({ error: 'Missing or invalid x-offset header.' });
  }

  const isFinal = xFinal === '1';

  try {
    // 3. Read raw binary body as Buffer
    const chunkBuffer = await readRawBody(req, 4 * 1024 * 1024);

    if (chunkBuffer.length === 0 && !isFinal) {
      return res.status(400).json({ error: 'Empty chunk body provided.' });
    }

    const command = isFinal ? 'upload, finalize' : 'upload';

    // 4. Forward to Google Resumable Upload URL
    const googleResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(chunkBuffer.length),
        'X-Goog-Upload-Offset': String(xOffset),
        'X-Goog-Upload-Command': command,
      },
      body: new Uint8Array(chunkBuffer),
    });

    if (!googleResponse.ok) {
      const errText = await googleResponse.text();
      return res.status(googleResponse.status).json({
        error: `Google upload error (${googleResponse.status}): ${errText}`,
        status: googleResponse.status,
      });
    }

    // 5. Handle response
    if (isFinal) {
      const data = await googleResponse.json();
      const fileObj = data.file || data;
      return res.status(200).json({
        file: {
          name: fileObj.name,
          uri: fileObj.uri,
          mimeType: fileObj.mimeType,
          state: fileObj.state || 'ACTIVE',
        },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('Error in /api/upload-chunk:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while uploading chunk',
    });
  }
}
