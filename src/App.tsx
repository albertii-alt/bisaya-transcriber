/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScreenMode, AudioChunk, TranscriptionSession } from './types';
import { Header } from './components/Header';
import { UnlockScreen } from './components/UnlockScreen';
import { HomeScreen } from './components/HomeScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { ResultScreen } from './components/ResultScreen';
import { ApiStatusBanner } from './components/ApiStatusBanner';
import {
  getStoredPasscode,
  setStoredPasscode,
  clearStoredPasscode,
  generateSessionKey,
  saveSession,
  getAllSavedSessions,
  deleteSession,
} from './utils/storage';
import {
  createUploadSession,
  uploadFileInChunks,
  pollFileStatus,
  transcribeChunk,
  checkApiHealth,
  DetailedErrorInfo,
  ApiError,
} from './utils/api';
import {
  formatTime,
  formatBytes,
  getPreviousTail,
  calculateWpm,
  inferMimeType,
  assembleFullTranscript,
} from './utils/audio';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('bisaya_theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    try {
      localStorage.setItem('bisaya_theme', theme);
    } catch {}
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Screen State
  const [screen, setScreen] = useState<ScreenMode>('unlock');
  const [passcode, setPasscode] = useState<string>(() => getStoredPasscode());
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);
  const [unlockError, setUnlockError] = useState<string | undefined>();

  // API connectivity status
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'unreachable' | 'auth_error'>('checking');
  const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>();
  const [isRetryingApi, setIsRetryingApi] = useState(false);
  const [chunkMinutes, setChunkMinutes] = useState(6);

  // Saved sessions list
  const [savedSessions, setSavedSessions] = useState<TranscriptionSession[]>([]);

  // Active Processing State
  const [activeSession, setActiveSession] = useState<TranscriptionSession | null>(null);
  const [processingPhase, setProcessingPhase] = useState<
    'uploading' | 'preparing' | 'transcribing' | 'retrying_split' | 'paused' | 'error'
  >('uploading');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  const [processingError, setProcessingError] = useState<string | undefined>();
  const [detailedError, setDetailedError] = useState<DetailedErrorInfo | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // Active File Reference (needed for direct upload bytes)
  const currentAudioFileRef = useRef<File | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const wakeLockRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // Load saved sessions from localStorage
  const refreshSavedSessions = useCallback(() => {
    setSavedSessions(getAllSavedSessions());
  }, []);

  // Health check on mount
  const verifyApi = useCallback(async (codeToTest?: string) => {
    setIsRetryingApi(true);
    setApiErrorMessage(undefined);
    try {
      const health = await checkApiHealth(codeToTest || passcode);
      setChunkMinutes(health.chunkMinutes || 6);

      if (health.requiresPasscode && !health.passcodeValid) {
        setApiStatus('auth_error');
        setApiErrorMessage('Passcode does not match the server APP_PASSCODE.');
        return false;
      } else {
        setApiStatus('connected');
        return true;
      }
    } catch (err: any) {
      console.warn('API health check error:', err);
      // If 401, passcode is wrong
      if (err.status === 401) {
        setApiStatus('auth_error');
        setApiErrorMessage('Invalid passcode according to server.');
        return false;
      }
      // If 404 or network failed, backend is unreachable
      setApiStatus('unreachable');
      setApiErrorMessage(
        'Server /api routes are not reachable. If running on Vercel, check deployment; in preview mode, /api endpoints require tsx server.ts.'
      );
      return false;
    } finally {
      setIsRetryingApi(false);
    }
  }, [passcode]);

  // Initial authentication & check
  useEffect(() => {
    refreshSavedSessions();
    const stored = getStoredPasscode();
    if (stored) {
      setPasscode(stored);
      verifyApi(stored).then((ok) => {
        if (ok) {
          setScreen('home');
        } else {
          // If server is unreachable or requires auth, check if user has passcode stored
          // If simply unreachable in static preview, let the user enter home screen with banner
          setScreen('home');
        }
      });
    } else {
      setApiStatus('checking');
      verifyApi('').then((ok) => {
        // If server doesn't require passcode, go straight to home
        if (ok) {
          setScreen('home');
        } else {
          setScreen('unlock');
        }
      });
    }
  }, []);

  // Handle Passcode Submission from Unlock Screen
  const handleUnlock = async (enteredPasscode: string): Promise<boolean> => {
    setIsVerifyingPasscode(true);
    setUnlockError(undefined);
    try {
      const ok = await verifyApi(enteredPasscode);
      // Save passcode regardless so requests send x-passcode
      setPasscode(enteredPasscode);
      setStoredPasscode(enteredPasscode);

      if (ok || apiStatus === 'unreachable') {
        // Proceed to home even if offline/preview so user can test UI
        setScreen('home');
        return true;
      } else {
        setUnlockError('Passcode rejected by server.');
        return false;
      }
    } catch (err: any) {
      setUnlockError(err.message || 'Passcode verification failed.');
      return false;
    } finally {
      setIsVerifyingPasscode(false);
    }
  };

  const handleLockClick = () => {
    clearStoredPasscode();
    setPasscode('');
    setScreen('unlock');
  };

  // Screen Wake Lock Handler
  const acquireWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch (err) {
        console.warn('Wake Lock request error:', err);
        setWakeLockActive(false);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
  };

  // Re-acquire wake lock on visibility change if transcribing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && screen === 'processing') {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [screen]);

  // Timer for elapsed seconds
  const startTimer = () => {
    setElapsedSeconds(0);
    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerIntervalRef.current);
  };

  // Sleep utility
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * The Core Transcription Engine
   */
  const runTranscriptionEngine = async (session: TranscriptionSession, audioFile?: File | null) => {
    isCancelledRef.current = false;
    setScreen('processing');
    setProcessingError(undefined);
    setDetailedError(null);
    startTimer();
    await acquireWakeLock();

    let currentSessionState = { ...session };
    const chunkSliceMinutes = chunkMinutes || 6;
    const chunkSeconds = chunkSliceMinutes * 60;

    try {
      // STEP 1 & 2: Ensure file is uploaded to Gemini Files API
      if (!currentSessionState.fileUri || !currentSessionState.fileResourceName) {
        if (!audioFile) {
          throw new Error('Audio file binary is required for first-time upload to Gemini.');
        }

        setProcessingPhase('uploading');
        setStatusMessage('Starting upload session...');
        setUploadPercent(0);

        // 1. Get resumable upload URL from server
        const { uploadUrl } = await createUploadSession(audioFile, passcode);

        if (isCancelledRef.current) return;

        // 2. Server-relayed chunked upload to /api/upload-chunk (bypasses CORS & Vercel limits)
        setStatusMessage(`Starting upload for ${formatBytes(audioFile.size)}...`);
        const uploadResult = await uploadFileInChunks(
          audioFile,
          uploadUrl,
          passcode,
          (progress) => {
            setUploadPercent(progress.percent);
            setStatusMessage(progress.statusText);
          },
          () => isCancelledRef.current
        );

        if (isCancelledRef.current) return;

        // 3. Poll until ACTIVE
        setProcessingPhase('preparing');
        setStatusMessage('Preparing audio on Gemini (verifying)...');
        const activeResult = await pollFileStatus(uploadResult.name, passcode, (state) => {
          setStatusMessage(`Preparing audio: ${state}...`);
        });

        currentSessionState.fileUri = activeResult.uri;
        currentSessionState.fileResourceName = activeResult.name;
        currentSessionState.updatedAt = Date.now();
        setActiveSession(currentSessionState);
        saveSession(currentSessionState);
      }

      // STEP 3: Sequential Chunk Transcription
      setProcessingPhase('transcribing');
      const chunks = [...currentSessionState.chunks];

      for (let i = 0; i < chunks.length; i++) {
        if (isCancelledRef.current) {
          console.log('Transcription cancelled by user.');
          break;
        }

        const chunk = chunks[i];

        // Skip chunks already completed in previous run
        if (chunk.status === 'done' || chunk.status === 'needs_review') {
          continue;
        }

        setCurrentChunkIndex(i);
        chunk.status = 'working';
        currentSessionState.chunks = [...chunks];
        setActiveSession({ ...currentSessionState });
        setStatusMessage(`Transcribing part ${i + 1} of ${chunks.length} (${formatTime(chunk.startSec)} – ${formatTime(chunk.endSec)})...`);

        // Determine previous tail from last completed chunk
        let previousTail = '';
        if (i > 0) {
          const prevChunk = chunks[i - 1];
          previousTail = getPreviousTail(prevChunk.text || '');
        }

        try {
          // Call /api/transcribe
          const result = await transcribeChunk({
            fileUri: currentSessionState.fileUri!,
            mimeType: currentSessionState.mimeType,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            previousTail,
            passcode,
            chunkNumber: i + 1,
            totalChunks: chunks.length,
          });

          if (isCancelledRef.current) break;

          let chunkText = result.text.trim();
          const chunkDurationSec = chunk.endSec - chunk.startSec;
          const wpm = calculateWpm(chunkText, chunkDurationSec);
          chunk.wpm = wpm;
          chunk.finishReason = result.finishReason;

          // COMPLETENESS RULE:
          // "After each chunk compute words per minute. If a chunk is below ~60 wpm, finishReason isn't STOP,
          // or the response is empty, automatically retry by splitting that range in half and transcribing each half.
          // If it still fails, keep the best result and mark that range as 'needs review'."
          const isSuspect = wpm < 60 || result.finishReason !== 'STOP' || !chunkText;

          if (isSuspect && chunkDurationSec >= 60) {
            console.warn(`[Transcriber] Part ${i + 1} flagged as suspect (WPM: ${wpm}, Finish: ${result.finishReason}). Splitting range in half to ensure completeness...`);
            setProcessingPhase('retrying_split');
            setStatusMessage(`Refining part ${i + 1}: Splitting into two halves to capture every word...`);

            const midSec = Math.round(chunk.startSec + chunkDurationSec / 2);

            try {
              // Half 1
              const sub1 = await transcribeChunk({
                fileUri: currentSessionState.fileUri!,
                mimeType: currentSessionState.mimeType,
                startSec: chunk.startSec,
                endSec: midSec,
                previousTail,
                passcode,
                chunkNumber: i + 1,
                totalChunks: chunks.length,
              });

              await sleep(1500); // polite delay

              // Half 2
              const sub1Tail = getPreviousTail(sub1.text || previousTail);
              const sub2 = await transcribeChunk({
                fileUri: currentSessionState.fileUri!,
                mimeType: currentSessionState.mimeType,
                startSec: midSec,
                endSec: chunk.endSec,
                previousTail: sub1Tail,
                passcode,
                chunkNumber: i + 1,
                totalChunks: chunks.length,
              });

              const combinedText = `${sub1.text.trim()}\n\n${sub2.text.trim()}`.trim();
              const combinedWpm = calculateWpm(combinedText, chunkDurationSec);

              if (combinedText.length > chunkText.length || combinedWpm >= 50) {
                chunk.text = combinedText;
                chunk.wpm = combinedWpm;
                chunk.status = combinedWpm >= 60 ? 'done' : 'needs_review';
              } else {
                chunk.text = chunkText;
                chunk.status = 'needs_review';
              }
            } catch (splitErr) {
              console.warn('Sub-divided retry encountered an error:', splitErr);
              chunk.text = chunkText;
              chunk.status = 'needs_review';
            }

            setProcessingPhase('transcribing');
          } else {
            chunk.text = chunkText;
            chunk.status = 'done';
          }

          // Save progress after EVERY chunk
          currentSessionState.updatedAt = Date.now();
          currentSessionState.fullTranscript = assembleFullTranscript(chunks);
          saveSession(currentSessionState);
          setActiveSession({ ...currentSessionState });

          // Rate limit courtesy pause (2 seconds between chunks)
          if (i < chunks.length - 1 && !isCancelledRef.current) {
            await sleep(2000);
          }
        } catch (chunkError: any) {
          console.error(`Error transcribing chunk ${i}:`, chunkError);
          chunk.status = 'failed';
          currentSessionState.chunks = [...chunks];
          saveSession(currentSessionState);
          setActiveSession({ ...currentSessionState });
          setProcessingPhase('error');
          const msg = chunkError.message || `Part ${i + 1} failed`;
          setProcessingError(msg);
          setDetailedError(
            chunkError.details || {
              stage: `Transcription Part ${i + 1}/${chunks.length}`,
              status: chunkError.status,
              chunkNumber: i + 1,
              totalChunks: chunks.length,
              serverMessage: msg,
              timestamp: new Date().toISOString(),
            }
          );
          return;
        }
      }

      if (isCancelledRef.current) {
        return;
      }

      // Finalize transcription session
      currentSessionState.isComplete = true;
      currentSessionState.updatedAt = Date.now();
      currentSessionState.fullTranscript = assembleFullTranscript(currentSessionState.chunks);
      saveSession(currentSessionState);
      setActiveSession(currentSessionState);
      refreshSavedSessions();

      // Show Result screen
      setScreen('result');
    } catch (error: any) {
      console.error('Fatal transcription error:', error);
      setProcessingPhase('error');
      const msg = error.message || 'An unexpected error occurred during transcription.';
      setProcessingError(msg);
      setDetailedError(
        error.details || {
          stage: 'Processing Pipeline',
          status: error.status,
          serverMessage: msg,
          timestamp: new Date().toISOString(),
        }
      );
    } finally {
      stopTimer();
      releaseWakeLock();
    }
  };

  // Start new transcription
  const handleStartTranscription = (file: File, duration: number) => {
    currentAudioFileRef.current = file;
    const chunkSliceMinutes = chunkMinutes || 6;
    const chunkSeconds = chunkSliceMinutes * 60;
    const totalChunks = Math.max(1, Math.ceil(duration / chunkSeconds));

    const chunks: AudioChunk[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const startSec = i * chunkSeconds;
      const endSec = Math.min(duration, (i + 1) * chunkSeconds);
      chunks.push({
        id: i,
        startSec,
        endSec,
        label: `Part ${i + 1} (${formatTime(startSec)} – ${formatTime(endSec)})`,
        status: 'waiting',
        text: '',
      });
    }

    const sessionId = generateSessionKey(file.name, file.size, duration);

    // Check if an existing session exists in storage
    const existing = getAllSavedSessions().find((s) => s.id === sessionId);
    let session: TranscriptionSession;

    if (existing) {
      session = existing;
    } else {
      session = {
        id: sessionId,
        fileName: file.name,
        fileSize: file.size,
        duration,
        mimeType: inferMimeType(file.name, file.type),
        totalChunks,
        chunks,
        fullTranscript: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isComplete: false,
      };
      saveSession(session);
    }

    setActiveSession(session);
    runTranscriptionEngine(session, file);
  };

  // Resume an existing session
  const handleResumeSession = (session: TranscriptionSession) => {
    setActiveSession(session);
    if (session.isComplete) {
      setScreen('result');
    } else {
      // If it still needs upload or we don't have binary, prompt or proceed with Gemini URI if available
      if (session.fileUri) {
        runTranscriptionEngine(session, null);
      } else {
        // Needs the audio file to be selected again to upload
        alert('To resume uploading, please select the audio file from your device again.');
      }
    }
  };

  // Delete saved session
  const handleDeleteSession = (sessionId: string) => {
    deleteSession(sessionId);
    refreshSavedSessions();
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
    }
  };

  // Cancel processing
  const handleCancelProcessing = () => {
    isCancelledRef.current = true;
    stopTimer();
    releaseWakeLock();
    if (activeSession) {
      saveSession(activeSession);
      refreshSavedSessions();
    }
    setScreen('home');
  };

  // Retry part
  const handleRetryCurrentPart = () => {
    if (activeSession) {
      setProcessingError(undefined);
      runTranscriptionEngine(activeSession, currentAudioFileRef.current);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#000000] text-[#1C1C1E] dark:text-[#F2F2F7] flex flex-col font-sans transition-colors">
      <Header
        onLockClick={handleLockClick}
        isUnlocked={Boolean(passcode)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 flex flex-col">
        {/* API Status Banner */}
        <div className="max-w-[640px] mx-auto w-full px-5 pt-3">
          <ApiStatusBanner
            status={apiStatus}
            errorMessage={apiErrorMessage}
            onRetry={() => verifyApi()}
            isRetrying={isRetryingApi}
          />
        </div>

        {screen === 'unlock' && (
          <UnlockScreen
            onUnlock={handleUnlock}
            initialPasscode={passcode}
            isVerifying={isVerifyingPasscode}
            errorMessage={unlockError}
          />
        )}

        {screen === 'home' && (
          <HomeScreen
            onStartTranscription={handleStartTranscription}
            onResumeSession={handleResumeSession}
            onDeleteSession={handleDeleteSession}
            savedSessions={savedSessions}
            chunkMinutes={chunkMinutes}
          />
        )}

        {screen === 'processing' && activeSession && (
          <ProcessingScreen
            fileName={activeSession.fileName}
            phase={processingPhase}
            uploadPercent={uploadPercent}
            currentChunkIndex={currentChunkIndex}
            totalChunks={activeSession.totalChunks}
            chunks={activeSession.chunks}
            elapsedSeconds={elapsedSeconds}
            wakeLockActive={wakeLockActive}
            statusMessage={statusMessage}
            errorMessage={processingError}
            errorDetails={detailedError}
            onCancel={handleCancelProcessing}
            onRetry={handleRetryCurrentPart}
          />
        )}

        {screen === 'result' && activeSession && (
          <ResultScreen
            fileName={activeSession.fileName}
            transcript={activeSession.fullTranscript}
            duration={activeSession.duration}
            onNewTranscription={() => {
              setActiveSession(null);
              currentAudioFileRef.current = null;
              setScreen('home');
              refreshSavedSessions();
            }}
          />
        )}
      </main>
    </div>
  );
}
