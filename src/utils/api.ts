import { ApiHealthResponse } from '../types';
import { inferMimeType } from './audio';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Check if the server /api is reachable and test passcode
 */
export async function checkApiHealth(passcode?: string): Promise<ApiHealthResponse> {
  const headers: Record<string, string> = {};
  if (passcode) {
    headers['x-passcode'] = passcode;
  }

  const response = await fetch('/api/health', {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new ApiError(`API responded with ${response.status}: ${response.statusText}`, response.status);
  }

  return response.json();
}

/**
 * Step 1: Request a resumable upload session from /api/upload-session
 */
export async function createUploadSession(
  file: File,
  passcode: string
): Promise<{ uploadUrl: string }> {
  const mimeType = inferMimeType(file.name, file.type);

  const response = await fetch('/api/upload-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-passcode': passcode,
    },
    body: JSON.stringify({
      mimeType,
      size: file.size,
      displayName: file.name,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Failed to create upload session (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error) message = errJson.error;
    } catch {
      if (errorText) message = errorText;
    }
    throw new ApiError(message, response.status);
  }

  const data = await response.json();
  if (!data.uploadUrl) {
    throw new ApiError('Server did not return an upload URL.');
  }

  return { uploadUrl: data.uploadUrl };
}

/**
 * Step 2: Upload audio file bytes DIRECTLY to Gemini upload URL via XMLHttpRequest.
 * Bypasses Vercel's 4.5 MB body limit.
 */
export function uploadFileToGemini(
  file: File,
  uploadUrl: string,
  onProgress: (percent: number) => void
): Promise<{ name: string; uri: string; state: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);

    // Required Google Resumable Upload headers for final single-chunk upload
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resp = JSON.parse(xhr.responseText);
          const fileObj = resp.file || resp;
          if (!fileObj.name || !fileObj.uri) {
            reject(new ApiError('Upload succeeded but Gemini did not return file details.', xhr.status));
            return;
          }
          resolve({
            name: fileObj.name,
            uri: fileObj.uri,
            state: fileObj.state || 'PROCESSING',
          });
        } catch {
          reject(new ApiError('Failed to parse Gemini upload response JSON.', xhr.status));
        }
      } else {
        reject(
          new ApiError(
            `Direct upload to Gemini failed with status ${xhr.status}: ${xhr.statusText || xhr.responseText}`,
            xhr.status
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new ApiError('Network error while uploading audio file directly to Gemini. Check your internet connection.'));
    };

    xhr.onabort = () => {
      reject(new ApiError('Upload was aborted.'));
    };

    xhr.send(file);
  });
}

/**
 * Step 3: Poll GET /api/file-status?name=files/xxx until ACTIVE
 */
export async function pollFileStatus(
  resourceName: string,
  passcode: string,
  onPollState?: (state: string) => void,
  maxWaitSeconds: number = 180
): Promise<{ uri: string; name: string }> {
  const startTime = Date.now();
  const pollIntervalMs = 2000;

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const response = await fetch(`/api/file-status?name=${encodeURIComponent(resourceName)}`, {
      method: 'GET',
      headers: {
        'x-passcode': passcode,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new ApiError(`Error checking file status (${response.status}): ${errText}`, response.status);
    }

    const data = await response.json();
    const state = data.state;

    if (onPollState) {
      onPollState(state);
    }

    if (state === 'ACTIVE') {
      return { uri: data.uri, name: data.name };
    }

    if (state === 'FAILED') {
      throw new ApiError(`Gemini failed to process audio file: ${data.error?.message || 'Processing failed'}`);
    }

    // Still PROCESSING, wait and loop
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new ApiError('Timed out waiting for audio file to become ACTIVE on Gemini.');
}

/**
 * Step 4: Transcribe chunk via POST /api/transcribe
 */
export async function transcribeChunk(params: {
  fileUri: string;
  mimeType: string;
  startSec: number;
  endSec: number;
  previousTail: string;
  passcode: string;
}): Promise<{ text: string; finishReason: string }> {
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-passcode': params.passcode,
    },
    body: JSON.stringify({
      fileUri: params.fileUri,
      mimeType: params.mimeType,
      startSec: params.startSec,
      endSec: params.endSec,
      previousTail: params.previousTail,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Transcription failed (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error) message = errJson.error;
    } catch {
      if (errorText) message = errorText;
    }
    throw new ApiError(message, response.status);
  }

  return response.json();
}
