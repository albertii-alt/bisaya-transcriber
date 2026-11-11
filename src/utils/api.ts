import { ApiHealthResponse } from '../types';
import { inferMimeType, formatBytes } from './audio';

export interface DetailedErrorInfo {
  stage: string;
  status?: number;
  chunkNumber?: number;
  totalChunks?: number;
  serverMessage: string;
  timestamp: string;
  rawDetails?: string;
}

export class ApiError extends Error {
  status?: number;
  details?: DetailedErrorInfo;

  constructor(message: string, status?: number, details?: DetailedErrorInfo) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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
    const details: DetailedErrorInfo = {
      stage: 'Upload Session Initiation',
      status: response.status,
      serverMessage: message,
      timestamp: new Date().toISOString(),
      rawDetails: errorText,
    };
    throw new ApiError(message, response.status, details);
  }

  const data = await response.json();
  if (!data.uploadUrl) {
    throw new ApiError('Server did not return an upload URL.');
  }

  return { uploadUrl: data.uploadUrl };
}

/**
 * Query current received bytes from /api/upload-status
 */
export async function queryUploadStatus(
  uploadUrl: string,
  passcode: string
): Promise<{ received: number; uploadStatus?: string }> {
  const response = await fetch('/api/upload-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-passcode': passcode,
    },
    body: JSON.stringify({ uploadUrl }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error) message = errJson.error;
    } catch {}
    throw new ApiError(`Upload status query failed (${response.status}): ${message}`, response.status);
  }

  return response.json();
}

export interface ChunkUploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  currentChunk: number;
  totalChunks: number;
  statusText: string;
}

/**
 * Step 2: Server-relayed chunked upload to /api/upload-chunk.
 * Completely replaces direct browser-to-Google uploads to avoid CORS/network issues.
 */
export async function uploadFileInChunks(
  file: File,
  uploadUrl: string,
  passcode: string,
  onProgress: (progress: ChunkUploadProgress) => void,
  isCancelled?: () => boolean
): Promise<{ name: string; uri: string; state: string; mimeType?: string }> {
  const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MiB chunks
  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));

  let offset = 0;
  let finalFileResult: any = null;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  while (offset < totalBytes) {
    if (isCancelled && isCancelled()) {
      throw new ApiError('Upload cancelled by user.');
    }

    const currentChunkNumber = Math.min(totalChunks, Math.floor(offset / CHUNK_SIZE) + 1);
    const end = Math.min(totalBytes, offset + CHUNK_SIZE);
    const isFinal = end >= totalBytes;
    const chunkBlob = file.slice(offset, end);

    let attempt = 0;
    const maxRetries = 6;
    let success = false;

    while (attempt < maxRetries) {
      attempt++;

      try {
        const response = await fetch('/api/upload-chunk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-passcode': passcode,
            'x-upload-url': uploadUrl,
            'x-offset': String(offset),
            'x-final': isFinal ? '1' : '0',
          },
          body: chunkBlob,
        });

        if (response.ok) {
          if (isFinal) {
            const data = await response.json();
            finalFileResult = data.file || data;
          }
          offset = end;
          success = true;
          break;
        }

        // Parse server error
        const errorText = await response.text();
        let serverMessage = errorText;
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.error) serverMessage = errJson.error;
        } catch {}

        // Non-retriable auth error
        if (response.status === 401) {
          const details: DetailedErrorInfo = {
            stage: `Upload Chunk (${currentChunkNumber}/${totalChunks})`,
            status: response.status,
            chunkNumber: currentChunkNumber,
            totalChunks,
            serverMessage,
            timestamp: new Date().toISOString(),
            rawDetails: errorText,
          };
          throw new ApiError(serverMessage, response.status, details);
        }

        // Retriable network / 5xx / 429 error
        console.warn(
          `[Upload] Chunk ${currentChunkNumber}/${totalChunks} failed (${response.status}). Attempt ${attempt}/${maxRetries}. Querying status and retrying...`
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s, 16s...
          const delayMs = 2000 * Math.pow(2, attempt - 1);
          await sleep(delayMs);

          // Query /api/upload-status to get exact confirmed offset from Google
          try {
            const statusInfo = await queryUploadStatus(uploadUrl, passcode);
            if (typeof statusInfo.received === 'number' && statusInfo.received >= 0) {
              console.log(`[Upload] Resume confirmed at offset ${statusInfo.received} bytes`);
              offset = statusInfo.received;
            }
          } catch (statusErr) {
            console.warn('[Upload] Could not query status, retrying from current offset', statusErr);
          }
        } else {
          const details: DetailedErrorInfo = {
            stage: `Upload Chunk (${currentChunkNumber}/${totalChunks})`,
            status: response.status,
            chunkNumber: currentChunkNumber,
            totalChunks,
            serverMessage,
            timestamp: new Date().toISOString(),
            rawDetails: errorText,
          };
          throw new ApiError(serverMessage, response.status, details);
        }
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) {
          throw err;
        }

        if (attempt >= maxRetries) {
          const details: DetailedErrorInfo = err.details || {
            stage: `Upload Chunk (${currentChunkNumber}/${totalChunks})`,
            status: err.status || 0,
            chunkNumber: currentChunkNumber,
            totalChunks,
            serverMessage: err.message || 'Network error while uploading chunk',
            timestamp: new Date().toISOString(),
          };
          throw new ApiError(details.serverMessage, details.status, details);
        }

        const delayMs = 2000 * Math.pow(2, attempt - 1);
        await sleep(delayMs);

        try {
          const statusInfo = await queryUploadStatus(uploadUrl, passcode);
          if (typeof statusInfo.received === 'number' && statusInfo.received >= 0) {
            offset = statusInfo.received;
          }
        } catch {}
      }
    }

    if (!success && !finalFileResult) {
      throw new ApiError(`Failed to upload chunk ${currentChunkNumber}/${totalChunks} after ${maxRetries} retries.`);
    }

    // Update progress
    const percent = Math.min(100, Math.round((offset / totalBytes) * 100));
    onProgress({
      bytesUploaded: offset,
      totalBytes,
      percent,
      currentChunk: currentChunkNumber,
      totalChunks,
      statusText: `Uploading ${formatBytes(offset)} of ${formatBytes(totalBytes)} (Chunk ${currentChunkNumber}/${totalChunks})`,
    });
  }

  if (!finalFileResult || !finalFileResult.uri) {
    throw new ApiError('Final chunk uploaded but file metadata was missing from server response.');
  }

  return {
    name: finalFileResult.name,
    uri: finalFileResult.uri,
    mimeType: finalFileResult.mimeType,
    state: finalFileResult.state || 'ACTIVE',
  };
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
      const details: DetailedErrorInfo = {
        stage: 'File Status Polling',
        status: response.status,
        serverMessage: errText,
        timestamp: new Date().toISOString(),
        rawDetails: errText,
      };
      throw new ApiError(`Error checking file status (${response.status}): ${errText}`, response.status, details);
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
      const details: DetailedErrorInfo = {
        stage: 'Audio Processing on Gemini',
        serverMessage: data.error?.message || 'Gemini file processing failed',
        timestamp: new Date().toISOString(),
      };
      throw new ApiError(`Gemini failed to process audio file: ${data.error?.message || 'Processing failed'}`, 500, details);
    }

    // Still PROCESSING, wait and loop
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  const timeoutDetails: DetailedErrorInfo = {
    stage: 'Audio Processing Timeout',
    serverMessage: 'Timed out waiting for audio file to become ACTIVE on Gemini.',
    timestamp: new Date().toISOString(),
  };
  throw new ApiError('Timed out waiting for audio file to become ACTIVE on Gemini.', 504, timeoutDetails);
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
  chunkNumber?: number;
  totalChunks?: number;
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
    const details: DetailedErrorInfo = {
      stage: `Transcription Part ${params.chunkNumber ?? ''}${params.totalChunks ? `/${params.totalChunks}` : ''}`,
      status: response.status,
      chunkNumber: params.chunkNumber,
      totalChunks: params.totalChunks,
      serverMessage: message,
      timestamp: new Date().toISOString(),
      rawDetails: errorText,
    };
    throw new ApiError(message, response.status, details);
  }

  return response.json();
}
