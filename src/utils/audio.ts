import { AudioChunk } from '../types';

/**
 * Extract audio duration without loading the entire audio file into memory.
 * Uses an HTMLAudioElement with preload="metadata" to read headers only.
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute('src');
      audio.load();
    };

    audio.onloadedmetadata = () => {
      const dur = audio.duration;
      cleanup();
      if (!isFinite(dur) || isNaN(dur) || dur <= 0) {
        reject(new Error('Audio duration could not be determined. Please verify the audio file format.'));
      } else {
        resolve(dur);
      }
    };

    audio.onerror = () => {
      cleanup();
      reject(new Error('Failed to read audio metadata. File might be unsupported or damaged.'));
    };
  });
}

/**
 * Format total seconds into mm:ss or hh:mm:ss
 */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format file size in human readable MB/KB
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get the last ~15 words of the previous transcript chunk
 */
export function getPreviousTail(text: string, count: number = 15): string {
  if (!text) return '';
  // Clean special review markers before grabbing words
  const cleaned = text.replace(/\[⚠[^\]]*\]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.slice(-count).join(' ');
}

/**
 * Calculate words per minute for a transcribed segment
 */
export function calculateWpm(text: string, durationSec: number): number {
  if (!text || durationSec <= 0) return 0;
  const cleaned = text.replace(/\[⚠[^\]]*\]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const minutes = Math.max(0.05, durationSec / 60);
  return Math.round(words.length / minutes);
}

/**
 * Infer MIME type from file extension if file.type is empty (common in iOS Safari for .m4a or .wav)
 */
export function inferMimeType(fileName: string, currentType?: string): string {
  if (currentType && currentType.includes('audio/')) {
    return currentType;
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mp3';
    case 'm4a':
      return 'audio/mp4'; // Gemini Files API accepts audio/mp4 or audio/m4a
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    case 'ogg':
      return 'audio/ogg';
    case 'webm':
      return 'audio/webm';
    case 'mp4':
      return 'audio/mp4';
    default:
      return currentType || 'audio/mp3';
  }
}

/**
 * Assemble final transcript from all chunks, inserting inline review notices:
 * "[⚠ 20:00–26:00 may be incomplete]" for any chunk marked needs_review.
 */
export function assembleFullTranscript(chunks: AudioChunk[]): string {
  return chunks
    .map((chunk) => {
      const parts: string[] = [];
      if (chunk.status === 'needs_review') {
        const startStr = formatTime(chunk.startSec);
        const endStr = formatTime(chunk.endSec);
        parts.push(`[⚠ ${startStr}–${endStr} may be incomplete]`);
      }
      if (chunk.text && chunk.text.trim()) {
        parts.push(chunk.text.trim());
      }
      return parts.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Count total words in text
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
