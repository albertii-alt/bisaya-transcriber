import { CONFIG, verifyPasscode } from './_config.js';

export default async function handler(req: any, res: any) {
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  const hasPasscode = Boolean(process.env.APP_PASSCODE && process.env.APP_PASSCODE.trim() !== '');

  const auth = verifyPasscode(req);

  return res.status(200).json({
    status: 'ok',
    app: 'Bisaya Transcriber API',
    model: CONFIG.DEFAULT_MODEL,
    chunkMinutes: CONFIG.DEFAULT_CHUNK_MINUTES,
    hasApiKey,
    requiresPasscode: hasPasscode,
    passcodeValid: auth.ok,
  });
}
