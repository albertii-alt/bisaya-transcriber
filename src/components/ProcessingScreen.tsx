import React, { useEffect, useState } from 'react';
import { CircularProgress } from './CircularProgress';
import {
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  SpinnerIcon,
  XMarkIcon,
  RefreshCwIcon,
} from './Icons';
import { AudioChunk } from '../types';
import { formatTime } from '../utils/audio';

interface ProcessingScreenProps {
  fileName: string;
  phase: 'uploading' | 'preparing' | 'transcribing' | 'retrying_split' | 'paused' | 'error';
  uploadPercent: number;
  currentChunkIndex: number;
  totalChunks: number;
  chunks: AudioChunk[];
  elapsedSeconds: number;
  wakeLockActive: boolean;
  statusMessage: string;
  errorMessage?: string;
  onCancel: () => void;
  onRetry?: () => void;
}

export const ProcessingScreen: React.FC<ProcessingScreenProps> = ({
  fileName,
  phase,
  uploadPercent,
  currentChunkIndex,
  totalChunks,
  chunks,
  elapsedSeconds,
  wakeLockActive,
  statusMessage,
  errorMessage,
  onCancel,
  onRetry,
}) => {
  // Calculate aggregate percentage
  // Phase 1 (Upload): 0% to 25%
  // Phase 2 (Prepare): 25% to 30%
  // Phase 3 (Transcribing chunks): 30% to 100%
  let overallPercent = 0;
  if (phase === 'uploading') {
    overallPercent = Math.round(uploadPercent * 0.25);
  } else if (phase === 'preparing') {
    overallPercent = 28;
  } else if (totalChunks > 0) {
    const completedChunks = chunks.filter((c) => c.status === 'done' || c.status === 'needs_review').length;
    const chunkRatio = completedChunks / totalChunks;
    overallPercent = Math.min(100, Math.round(30 + chunkRatio * 70));
  }

  // Label inside progress ring
  let ringLabel = 'Processing';
  if (phase === 'uploading') ringLabel = 'Uploading';
  else if (phase === 'preparing') ringLabel = 'Preparing';
  else if (phase === 'retrying_split') ringLabel = 'Refining';
  else if (phase === 'transcribing') {
    ringLabel = `Part ${Math.min(currentChunkIndex + 1, totalChunks)} / ${totalChunks}`;
  }

  return (
    <div className="flex-1 w-full max-w-[640px] mx-auto px-5 py-6 flex flex-col items-center">
      {/* File Name & Time Elapsed Header */}
      <div className="w-full flex items-center justify-between text-xs text-[#8E8E93] dark:text-[#98989D] mb-4 px-1">
        <span className="truncate max-w-[200px] font-medium text-[#1C1C1E] dark:text-[#F2F2F7]">
          {fileName}
        </span>
        <span className="tabular-nums font-mono">
          Elapsed: {formatTime(elapsedSeconds)}
        </span>
      </div>

      {/* Screen Wake Lock Notice Banner */}
      <div className="w-full mb-6 p-3 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] shadow-xs flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${wakeLockActive ? 'bg-[#34C759]' : 'bg-[#FF9500]'}`} />
        <p className="text-[12px] text-[#1C1C1E] dark:text-[#F2F2F7] leading-tight">
          Keep this screen open while transcribing.
          <span className="text-[#8E8E93] dark:text-[#98989D] ml-1">
            {wakeLockActive ? '(Screen wake lock active)' : '(Prevent device sleep)'}
          </span>
        </p>
      </div>

      {/* Circular Progress Ring */}
      <div className="my-2">
        <CircularProgress
          percentage={overallPercent}
          size={210}
          strokeWidth={14}
          label={ringLabel}
          sublabel={`${formatTime(elapsedSeconds)} elapsed`}
        />
      </div>

      {/* Primary Status Headline */}
      <div className="text-center mt-5 mb-6 px-4">
        <h3 className="text-[17px] font-semibold text-[#1C1C1E] dark:text-[#F2F2F7] leading-snug">
          {statusMessage}
        </h3>
        <p className="text-[13px] text-[#8E8E93] dark:text-[#98989D] mt-1">
          {phase === 'uploading' && `Uploading bytes directly to Gemini Files API (${uploadPercent}%)`}
          {phase === 'preparing' && 'Verifying audio file state with Gemini...'}
          {phase === 'transcribing' && `Verbatim transcription in ~6-minute chunks`}
          {phase === 'retrying_split' && `Low WPM detected: Sub-dividing chunk into 3-min slices for full coverage`}
        </p>
      </div>

      {/* Error Card if failed */}
      {phase === 'error' && errorMessage && (
        <div className="w-full mb-6 p-4 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-left">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon size={20} className="text-[#FF3B30] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-[14px] font-semibold text-[#FF3B30] dark:text-[#FF453A]">
                Transcription Paused
              </h4>
              <p className="text-[12px] text-[#1C1C1E] dark:text-[#F2F2F7] mt-1 leading-relaxed">
                {errorMessage}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-3 h-[36px] px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <RefreshCwIcon size={14} />
                  <span>Retry Current Part</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grouped List of Parts */}
      <div className="w-full flex-1 mb-6 flex flex-col">
        <div className="flex items-center justify-between px-1 mb-2">
          <h4 className="text-[12px] font-semibold text-[#8E8E93] dark:text-[#98989D] uppercase tracking-wider">
            Parts ({chunks.filter((c) => c.status === 'done' || c.status === 'needs_review').length}/{totalChunks || chunks.length})
          </h4>
          <span className="text-xs text-[#8E8E93]">
            {chunks.filter((c) => c.status === 'needs_review').length > 0 && (
              <span className="text-[#FF9500] font-medium">
                {chunks.filter((c) => c.status === 'needs_review').length} flagged for review
              </span>
            )}
          </span>
        </div>

        <div className="bg-white dark:bg-[#1C1C1E] rounded-[20px] border border-[#E5E5EA] dark:border-[#2C2C2E] divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E] overflow-y-auto max-h-[260px] shadow-xs">
          {chunks.map((chunk, index) => {
            const isCurrent = index === currentChunkIndex && (phase === 'transcribing' || phase === 'retrying_split');

            return (
              <div
                key={chunk.id}
                className={`p-3.5 flex items-center justify-between gap-3 text-sm transition-colors ${
                  isCurrent ? 'bg-[#007AFF]/5 dark:bg-[#0A84FF]/10' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    {chunk.status === 'done' && (
                      <span className="text-[#34C759]">
                        <CheckCircleIcon size={18} />
                      </span>
                    )}
                    {chunk.status === 'needs_review' && (
                      <span className="text-[#FF9500]" title="Low words-per-minute or incomplete">
                        <AlertTriangleIcon size={18} />
                      </span>
                    )}
                    {chunk.status === 'working' && (
                      <span className="text-[#007AFF] dark:text-[#0A84FF]">
                        <SpinnerIcon size={18} />
                      </span>
                    )}
                    {chunk.status === 'waiting' && (
                      <span className="text-[#8E8E93]">
                        <ClockIcon size={17} />
                      </span>
                    )}
                    {chunk.status === 'failed' && (
                      <span className="text-[#FF3B30]">
                        <AlertTriangleIcon size={18} />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#1C1C1E] dark:text-[#F2F2F7]">
                        Part {index + 1}
                      </span>
                      <span className="text-xs text-[#8E8E93] dark:text-[#98989D] tabular-nums">
                        ({formatTime(chunk.startSec)} – {formatTime(chunk.endSec)})
                      </span>
                    </div>

                    {chunk.text && (
                      <p className="text-xs text-[#8E8E93] dark:text-[#98989D] truncate max-w-[280px] mt-0.5">
                        {chunk.text.slice(0, 60)}...
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {chunk.status === 'done' && chunk.wpm && (
                    <span className="text-[11px] font-mono text-[#34C759] font-medium">
                      {chunk.wpm} wpm
                    </span>
                  )}
                  {chunk.status === 'needs_review' && (
                    <span className="text-[11px] font-medium text-[#FF9500] px-1.5 py-0.5 rounded bg-[#FF9500]/10">
                      Review
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[11px] font-medium text-[#007AFF] dark:text-[#0A84FF] animate-pulse">
                      Transcribing
                    </span>
                  )}
                  {chunk.status === 'waiting' && (
                    <span className="text-[11px] text-[#8E8E93]">Queued</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancel Button */}
      <button
        type="button"
        onClick={onCancel}
        className="w-full h-[50px] rounded-[14px] bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#FF3B30] dark:text-[#FF453A] font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
      >
        <XMarkIcon size={18} />
        <span>Cancel Transcription</span>
      </button>
    </div>
  );
};
