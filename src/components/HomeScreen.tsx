import React, { useRef, useState } from 'react';
import {
  AudioWaveIcon,
  UploadCloudIcon,
  ChevronRightIcon,
  ClockIcon,
  TrashIcon,
  SpinnerIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from './Icons';
import { formatTime, formatBytes, getAudioDuration, inferMimeType } from '../utils/audio';
import { TranscriptionSession } from '../types';

interface HomeScreenProps {
  onStartTranscription: (file: File, duration: number) => void;
  onResumeSession: (session: TranscriptionSession) => void;
  onDeleteSession: (sessionId: string) => void;
  savedSessions: TranscriptionSession[];
  chunkMinutes?: number;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onStartTranscription,
  onResumeSession,
  onDeleteSession,
  savedSessions,
  chunkMinutes = 6,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setIsLoadingMetadata(true);
    setSelectedFile(file);

    try {
      const dur = await getAudioDuration(file);
      setDuration(dur);
    } catch (err: any) {
      console.warn('Could not read duration with audio element, using fallback estimation:', err);
      // If browser cannot decode metadata directly (e.g. certain proprietary aac or m4a on non-Safari),
      // we estimate reasonable duration based on file size or proceed with default
      setFileError('Could not auto-detect duration. You can still proceed with estimated duration or pick another audio format.');
      // Estimate ~1MB per minute for standard 128kbps audio
      const estimatedSecs = Math.max(60, Math.round((file.size / (1024 * 1024)) * 60));
      setDuration(estimatedSecs);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleStart = () => {
    if (selectedFile && duration && duration > 0) {
      onStartTranscription(selectedFile, duration);
    }
  };

  const handleClearSelected = () => {
    setSelectedFile(null);
    setDuration(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const chunkSeconds = chunkMinutes * 60;
  const estimatedChunks = duration ? Math.ceil(duration / chunkSeconds) : 0;

  return (
    <div className="flex-1 w-full max-w-[640px] mx-auto px-5 py-6 flex flex-col">
      {/* iOS Large Title */}
      <div className="mb-6">
        <h1 className="text-[34px] font-bold tracking-tight text-[#1C1C1E] dark:text-[#F2F2F7] leading-tight">
          Transcriber
        </h1>
        <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D] mt-1">
          Full verbatim Bisaya &amp; Cebuano audio transcription
        </p>
      </div>

      {/* Main Action Card: Choose Audio File */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-[22px] border border-[#E5E5EA] dark:border-[#2C2C2E] p-6 shadow-xs mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.aac,.ogg,.webm,.mp4,audio/*,video/mp4"
          onChange={handleFileChange}
          className="hidden"
          id="audio-file-input"
        />

        {!selectedFile ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center py-8 px-4 rounded-[16px] border-2 border-dashed border-[#D1D1D6] dark:border-[#3A3A3C] hover:border-[#007AFF] dark:hover:border-[#0A84FF] active:scale-[0.99] transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-full bg-[#007AFF]/10 dark:bg-[#0A84FF]/15 text-[#007AFF] dark:text-[#0A84FF] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <UploadCloudIcon size={32} />
            </div>
            <h3 className="text-[18px] font-semibold text-[#1C1C1E] dark:text-[#F2F2F7] text-center">
              Choose Audio File
            </h3>
            <p className="text-[13px] text-[#8E8E93] dark:text-[#98989D] text-center mt-1">
              Tap to browse from Files or Voice Memos
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px] text-[#8E8E93] dark:text-[#98989D] font-medium">
              <span>MP3</span> · <span>M4A</span> · <span>WAV</span> · <span>AAC</span> · <span>OGG</span> · <span>WEBM</span> · <span>MP4</span>
            </div>
            <div className="mt-2 text-[11px] text-[#8E8E93]/80 dark:text-[#98989D]/80">
              Up to ~2 hours supported
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Selected File Details */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-[14px] bg-[#007AFF]/10 dark:bg-[#0A84FF]/15 text-[#007AFF] dark:text-[#0A84FF] flex items-center justify-center shrink-0">
                <AudioWaveIcon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-semibold text-[#1C1C1E] dark:text-[#F2F2F7] truncate leading-tight">
                  {selectedFile.name}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#8E8E93] dark:text-[#98989D] mt-1">
                  <span>{formatBytes(selectedFile.size)}</span>
                  <span>·</span>
                  {isLoadingMetadata ? (
                    <span className="flex items-center gap-1 text-[#007AFF]">
                      <SpinnerIcon size={12} /> Reading duration...
                    </span>
                  ) : (
                    <span>{duration ? formatTime(duration) : 'Unknown length'}</span>
                  )}
                  {estimatedChunks > 0 && (
                    <>
                      <span>·</span>
                      <span>{estimatedChunks} {estimatedChunks === 1 ? 'part' : 'parts'} ({chunkMinutes}m)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {fileError && (
              <div className="p-3 rounded-xl bg-[#FF9500]/10 text-[#FF9500] text-xs leading-relaxed flex items-start gap-2">
                <AlertTriangleIcon size={16} className="shrink-0 mt-0.5" />
                <span>{fileError}</span>
              </div>
            )}

            {/* Start Transcription CTA */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleStart}
                disabled={isLoadingMetadata || !duration}
                className="w-full h-[50px] rounded-[14px] bg-[#007AFF] hover:bg-[#0071E3] dark:bg-[#0A84FF] text-white font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
              >
                <span>Start Transcription</span>
              </button>

              <button
                type="button"
                onClick={handleClearSelected}
                className="w-full h-[44px] rounded-[14px] text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F2F2F7] text-[14px] font-medium flex items-center justify-center transition-colors"
              >
                Choose Different File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resume Previous Section */}
      {savedSessions.length > 0 && (
        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[13px] font-semibold text-[#8E8E93] dark:text-[#98989D] uppercase tracking-wider">
              Resume Previous
            </h2>
            <span className="text-xs text-[#8E8E93]">
              {savedSessions.length} {savedSessions.length === 1 ? 'saved session' : 'saved sessions'}
            </span>
          </div>

          <div className="bg-white dark:bg-[#1C1C1E] rounded-[20px] border border-[#E5E5EA] dark:border-[#2C2C2E] divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E] overflow-hidden shadow-xs">
            {savedSessions.map((session) => {
              const completedCount = session.chunks.filter((c) => c.status === 'done' || c.status === 'needs_review').length;
              const hasReview = session.chunks.some((c) => c.status === 'needs_review');

              return (
                <div
                  key={session.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div
                    onClick={() => onResumeSession(session)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-[15px] font-semibold text-[#1C1C1E] dark:text-[#F2F2F7] truncate">
                        {session.fileName}
                      </h4>
                      {session.isComplete ? (
                        <span className="text-[11px] font-medium text-[#34C759] flex items-center gap-1 shrink-0">
                          <CheckCircleIcon size={12} /> Done
                        </span>
                      ) : hasReview ? (
                        <span className="text-[11px] font-medium text-[#FF9500] flex items-center gap-1 shrink-0">
                          <AlertTriangleIcon size={12} /> Review
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#8E8E93] dark:text-[#98989D] mt-1">
                      <span>{formatTime(session.duration)}</span>
                      <span>·</span>
                      <span>{completedCount} of {session.totalChunks} parts</span>
                      <span>·</span>
                      <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResumeSession(session)}
                      aria-label="Resume transcription"
                      className="h-[36px] px-3.5 rounded-full bg-[#007AFF]/10 dark:bg-[#0A84FF]/15 text-[#007AFF] dark:text-[#0A84FF] text-xs font-semibold flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <span>{session.isComplete ? 'View' : 'Resume'}</span>
                      <ChevronRightIcon size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      aria-label="Delete saved session"
                      title="Delete session"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#8E8E93] hover:text-[#FF3B30] dark:hover:text-[#FF453A] active:opacity-70 transition-colors"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feature Bullet Points / Instructions */}
      <div className="mt-8 px-2 text-xs text-[#8E8E93] dark:text-[#98989D] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
          <span>Verbatim Cebuano/Bisaya transcription without summaries or skips.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF]" />
          <span>Uploaded directly to Gemini to preserve original high audio fidelity.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF9500]" />
          <span>Auto-splits and retries low-WPM ranges to guarantee complete coverage.</span>
        </div>
      </div>
    </div>
  );
};
