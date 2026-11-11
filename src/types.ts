export type ScreenMode = 'unlock' | 'home' | 'processing' | 'result';

export type ChunkStatus = 'waiting' | 'working' | 'done' | 'needs_review' | 'failed';

export interface AudioChunk {
  id: number;
  startSec: number;
  endSec: number;
  label: string;
  status: ChunkStatus;
  text: string;
  wpm?: number;
  finishReason?: string;
  retryCount?: number;
  isSubDivided?: boolean;
}

export interface TranscriptionSession {
  id: string; // unique key
  fileName: string;
  fileSize: number;
  duration: number; // in seconds
  mimeType: string;
  fileUri?: string;
  fileResourceName?: string;
  totalChunks: number;
  chunks: AudioChunk[];
  fullTranscript: string;
  createdAt: number;
  updatedAt: number;
  isComplete: boolean;
}

export interface ApiHealthResponse {
  status: string;
  app: string;
  model: string;
  chunkMinutes: number;
  hasApiKey: boolean;
  requiresPasscode: boolean;
  passcodeValid: boolean;
}
