/**
 * Bisaya Transcriber - Central Server Configuration
 * 
 * ============================================================================
 * ⚙️ MODEL & CHUNK CONFIGURATION: CHANGE MODEL NAME & CHUNK SIZE HERE
 * ============================================================================
 * 
 * 1. GEMINI_MODEL:
 *    Default: 'gemini-3.5-transcribe' (Gemini's dedicated audio transcription model).
 *    Alternative: 'gemini-3.8-flash' (general multimodal model).
 *    You can override this here or via the GEMINI_MODEL environment variable.
 * 
 * 2. CHUNK_MINUTES:
 *    Default: 6 minutes.
 *    Audio is processed sequentially in slices of this length.
 *    6 minutes strikes the ideal balance between context window accuracy,
 *    Vercel serverless timeout (300s), and memory safety.
 *    You can override this here or via the CHUNK_MINUTES environment variable.
 * ============================================================================
 */

export const CONFIG = {
  // 🎙️ CHANGE TRANSCRIPTION MODEL HERE:
  DEFAULT_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-transcribe',

  // ⏱️ CHANGE CHUNK SIZE IN MINUTES HERE:
  DEFAULT_CHUNK_MINUTES: parseInt(process.env.CHUNK_MINUTES || '6', 10),

  // Fallback retry delay for rate limits (in milliseconds)
  RETRY_BASE_DELAY_MS: 2000,
  MAX_RETRIES: 5,
};

/**
 * Validate x-passcode header against server APP_PASSCODE environment variable.
 * Returns true if valid, false if unauthorized.
 */
export function verifyPasscode(req: any): { ok: boolean; message?: string } {
  const configuredPasscode = process.env.APP_PASSCODE;
  
  // If no passcode is configured on the server, allow access (or warn in logs)
  if (!configuredPasscode || configuredPasscode.trim() === '') {
    return { ok: true };
  }

  const incomingPasscode = 
    req.headers?.['x-passcode'] || 
    req.headers?.['X-Passcode'] || 
    (typeof req.query?.passcode === 'string' ? req.query.passcode : undefined);

  if (!incomingPasscode || incomingPasscode !== configuredPasscode) {
    return { 
      ok: false, 
      message: 'Unauthorized: Invalid or missing x-passcode header' 
    };
  }

  return { ok: true };
}

/**
 * Retrieve Gemini API key from environment
 */
export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('GEMINI_API_KEY environment variable is not set on the server.');
  }
  return key.trim();
}
