import { TranscriptionSession } from '../types';

const PASSCODE_STORAGE_KEY = 'bisaya_passcode';
const SESSION_PREFIX = 'bisaya_session_';

export function getStoredPasscode(): string {
  try {
    return localStorage.getItem(PASSCODE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPasscode(passcode: string): void {
  try {
    localStorage.setItem(PASSCODE_STORAGE_KEY, passcode);
  } catch (err) {
    console.error('Failed to save passcode to localStorage', err);
  }
}

export function clearStoredPasscode(): void {
  try {
    localStorage.removeItem(PASSCODE_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear passcode', err);
  }
}

export function generateSessionKey(fileName: string, fileSize: number, duration: number): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${SESSION_PREFIX}${safeName}_${fileSize}_${Math.round(duration)}`;
}

export function saveSession(session: TranscriptionSession): void {
  try {
    const key = session.id;
    localStorage.setItem(key, JSON.stringify(session));
  } catch (err) {
    console.warn('Failed to save session to localStorage (may have exceeded quota)', err);
  }
}

export function getSession(sessionId: string): TranscriptionSession | null {
  try {
    const raw = localStorage.getItem(sessionId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAllSavedSessions(): TranscriptionSession[] {
  const sessions: TranscriptionSession[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SESSION_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as TranscriptionSession;
            sessions.push(parsed);
          } catch {
            // ignore bad entry
          }
        }
      }
    }
    // Sort newest first
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    console.error('Error fetching sessions from localStorage', err);
  }
  return sessions;
}

export function deleteSession(sessionId: string): void {
  try {
    localStorage.removeItem(sessionId);
  } catch (err) {
    console.error('Error deleting session', err);
  }
}
