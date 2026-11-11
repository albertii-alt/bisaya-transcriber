import { CONFIG, verifyPasscode, getGeminiApiKey } from './_config.js';

function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const { fileUri, mimeType, startSec = 0, endSec = 0, previousTail = '' } = req.body || {};

    if (!fileUri || !mimeType) {
      return res.status(400).json({
        error: 'Missing required parameters: fileUri and mimeType are required.',
      });
    }

    const apiKey = getGeminiApiKey();
    const model = CONFIG.DEFAULT_MODEL;

    const startFormatted = formatTimestamp(Number(startSec));
    const endFormatted = formatTimestamp(Number(endSec));

    // Exact Prompt Required by Specification
    const prompt = `Transcribe the speech from ${startFormatted} to ${endFormatted} of this audio, word for word, in the language spoken (mainly Cebuano/Bisaya; keep any English or Tagalog words exactly as spoken). Do not translate, summarize, shorten, correct, or comment. Include every spoken sentence, even repeated ones. No speaker labels and no timestamps. Start a new paragraph at natural pauses. Use [inaudible] only for truly unintelligible parts. The previous section ended with: "${previousTail}". Do not repeat that text. Output only the transcript.`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType,
                fileUri,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
      ],
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let attempts = 0;
    const maxRetries = CONFIG.MAX_RETRIES;
    let lastError = '';

    while (attempts < maxRetries) {
      attempts++;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'aistudio-build',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const data = await response.json();
          const candidate = data.candidates?.[0];
          const finishReason = candidate?.finishReason || 'STOP';
          let text = '';

          if (candidate?.content?.parts) {
            text = candidate.content.parts
              .map((part: any) => part.text || '')
              .join('');
          }

          return res.status(200).json({
            text: text.trim(),
            finishReason,
          });
        }

        // Check for rate limit (429) or transient server error (503)
        if (response.status === 429 || response.status === 503) {
          const retryAfterHeader = response.headers.get('retry-after');
          let delayMs = CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempts - 1);
          
          if (retryAfterHeader) {
            const parsedSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSeconds)) {
              delayMs = Math.max(delayMs, parsedSeconds * 1000);
            }
          }

          // Add jitter
          delayMs += Math.floor(Math.random() * 1000);

          const errText = await response.text();
          lastError = `Rate limit / Server busy (${response.status}): ${errText}`;
          console.warn(`[API] Gemini returned ${response.status}. Attempt ${attempts}/${maxRetries}. Retrying in ${delayMs}ms...`);
          
          if (attempts < maxRetries) {
            await sleep(delayMs);
            continue;
          }
        }

        // Other non-retriable error
        const errText = await response.text();
        return res.status(response.status).json({
          error: `Gemini API error (${response.status}): ${errText}`,
        });
      } catch (err: any) {
        lastError = err.message || 'Network error';
        if (attempts < maxRetries) {
          const delayMs = CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempts - 1) + 1000;
          await sleep(delayMs);
          continue;
        }
      }
    }

    return res.status(504).json({
      error: `Transcription timed out or exceeded max retries: ${lastError}`,
    });
  } catch (error: any) {
    console.error('Error in /api/transcribe:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error during transcription',
    });
  }
}
