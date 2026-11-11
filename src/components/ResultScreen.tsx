import React, { useState, useMemo } from 'react';
import {
  CopyIcon,
  DownloadIcon,
  ShareIcon,
  SearchIcon,
  XMarkIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from './Icons';
import { countWords } from '../utils/audio';

interface ResultScreenProps {
  fileName: string;
  transcript: string;
  duration?: number;
  onNewTranscription: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  fileName,
  transcript,
  duration,
  onNewTranscription,
}) => {
  const [fontSize, setFontSize] = useState<number>(17); // Apple standard 17px body
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const wordCount = useMemo(() => countWords(transcript), [transcript]);
  const estimatedReadingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  // Increase / decrease font size
  const handleIncreaseFont = () => setFontSize((prev) => Math.min(prev + 2, 25));
  const handleDecreaseFont = () => setFontSize((prev) => Math.max(prev - 2, 13));

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Download .txt file
  const handleDownload = () => {
    const cleanFileName = fileName.replace(/\.[^/.]+$/, '');
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanFileName}_transcript.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Native iOS Share API (with copy fallback)
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${fileName} - Bisaya Transcript`,
          text: transcript,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  // Split transcript into paragraphs
  const paragraphs = useMemo(() => {
    return transcript.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  }, [transcript]);

  // Count search query matches
  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    try {
      const regex = new RegExp(searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = transcript.match(regex);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }, [searchQuery, transcript]);

  // Render paragraph with highlighted search text and warning badges
  const renderParagraph = (para: string, idx: number) => {
    // Check if this paragraph is a review warning marker
    const isWarningMarker = para.includes('[⚠') && para.includes('may be incomplete]');

    if (isWarningMarker) {
      return (
        <div
          key={idx}
          className="my-3 p-3 rounded-xl bg-[#FF9500]/10 border border-[#FF9500]/25 text-[#FF9500] dark:text-[#FF9F0A] text-xs font-semibold flex items-center gap-2"
        >
          <AlertTriangleIcon size={16} className="shrink-0" />
          <span>{para}</span>
        </div>
      );
    }

    if (!searchQuery.trim()) {
      return (
        <p key={idx} className="mb-4 leading-relaxed font-normal">
          {para}
        </p>
      );
    }

    // Highlight search query
    try {
      const parts = para.split(new RegExp(`(${searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return (
        <p key={idx} className="mb-4 leading-relaxed font-normal">
          {parts.map((part, pIdx) =>
            part.toLowerCase() === searchQuery.trim().toLowerCase() ? (
              <mark
                key={pIdx}
                className="bg-[#FFE600] text-black dark:bg-[#FFD60A] dark:text-black rounded px-1 py-0.5 font-medium"
              >
                {part}
              </mark>
            ) : (
              part
            )
          )}
        </p>
      );
    } catch {
      return (
        <p key={idx} className="mb-4 leading-relaxed font-normal">
          {para}
        </p>
      );
    }
  };

  return (
    <div className="flex-1 w-full max-w-[640px] mx-auto px-5 py-4 flex flex-col pb-28">
      {/* Top Bar with New Button & Word Count */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onNewTranscription}
          className="min-h-[44px] flex items-center gap-1 text-[#007AFF] dark:text-[#0A84FF] text-[15px] font-semibold active:opacity-70 transition-opacity"
        >
          <ChevronLeftIcon size={18} />
          <span>New</span>
        </button>

        <div className="text-right">
          <div className="text-xs font-semibold text-[#1C1C1E] dark:text-[#F2F2F7]">
            {wordCount.toLocaleString()} words
          </div>
          <div className="text-[11px] text-[#8E8E93] dark:text-[#98989D]">
            ~{estimatedReadingTimeMinutes} min read
          </div>
        </div>
      </div>

      {/* File Title */}
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight text-[#1C1C1E] dark:text-[#F2F2F7] truncate leading-tight">
          {fileName}
        </h1>
        <p className="text-xs text-[#8E8E93] dark:text-[#98989D] mt-0.5">
          Verbatim Bisaya transcript · Complete
        </p>
      </div>

      {/* Reading Controls Toolbar: Text Size & Search */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-[18px] border border-[#E5E5EA] dark:border-[#2C2C2E] p-2 mb-4 shadow-xs flex flex-col sm:flex-row items-center gap-2">
        {/* Search Input */}
        <div className="flex-1 w-full flex items-center px-3 h-[38px] rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] gap-2">
          <SearchIcon size={16} className="text-[#8E8E93]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            className="flex-1 bg-transparent text-[14px] text-[#1C1C1E] dark:text-[#F2F2F7] placeholder-[#8E8E93] outline-none"
          />
          {searchQuery && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#8E8E93] tabular-nums">
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-5 h-5 rounded-full bg-[#8E8E93]/20 flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E]"
              >
                <XMarkIcon size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Text Size Stepper */}
        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto px-2 gap-2">
          <span className="text-[11px] font-medium text-[#8E8E93] uppercase tracking-wider">
            Text Size
          </span>
          <div className="flex items-center rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] p-1">
            <button
              type="button"
              onClick={handleDecreaseFont}
              disabled={fontSize <= 13}
              aria-label="Decrease text size"
              className="w-8 h-7 rounded-lg flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F2F2F7] hover:bg-black/5 dark:hover:bg-white/10 active:opacity-70 disabled:opacity-30 transition-colors"
            >
              A−
            </button>
            <span className="w-8 text-center text-xs font-mono font-medium text-[#8E8E93]">
              {fontSize}
            </span>
            <button
              type="button"
              onClick={handleIncreaseFont}
              disabled={fontSize >= 25}
              aria-label="Increase text size"
              className="w-8 h-7 rounded-lg flex items-center justify-center text-xs font-semibold text-[#1C1C1E] dark:text-[#F2F2F7] hover:bg-black/5 dark:hover:bg-white/10 active:opacity-70 disabled:opacity-30 transition-colors"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {/* Main Transcript Reading Card */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-[22px] border border-[#E5E5EA] dark:border-[#2C2C2E] p-6 shadow-xs select-text">
        <div
          style={{ fontSize: `${fontSize}px` }}
          className="text-[#1C1C1E] dark:text-[#F2F2F7] transition-all"
        >
          {paragraphs.length > 0 ? (
            paragraphs.map((p, idx) => renderParagraph(p, idx))
          ) : (
            <p className="text-[#8E8E93] italic">No transcript text found.</p>
          )}
        </div>
      </div>

      {/* Pinned Apple HIG Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pb-safe backdrop-blur-xl bg-[#F2F2F7]/90 dark:bg-[#000000]/90 border-t border-[#E5E5EA] dark:border-[#2C2C2E] shadow-lg">
        <div className="max-w-[640px] mx-auto px-5 py-3 grid grid-cols-3 gap-3">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className={`h-[48px] rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer ${
              copied
                ? 'bg-[#34C759] text-white'
                : 'bg-white dark:bg-[#1C1C1E] text-[#007AFF] dark:text-[#0A84FF] border border-[#E5E5EA] dark:border-[#2C2C2E]'
            }`}
          >
            {copied ? (
              <>
                <CheckCircleIcon size={18} />
                <span>Copied</span>
              </>
            ) : (
              <>
                <CopyIcon size={18} />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="h-[48px] rounded-[14px] bg-[#007AFF] hover:bg-[#0071E3] dark:bg-[#0A84FF] text-white font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <DownloadIcon size={18} />
            <span>Download</span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className={`h-[48px] rounded-[14px] font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer ${
              shared
                ? 'bg-[#34C759] text-white'
                : 'bg-white dark:bg-[#1C1C1E] text-[#007AFF] dark:text-[#0A84FF] border border-[#E5E5EA] dark:border-[#2C2C2E]'
            }`}
          >
            {shared ? (
              <>
                <CheckCircleIcon size={18} />
                <span>Shared</span>
              </>
            ) : (
              <>
                <ShareIcon size={18} />
                <span>Share</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
