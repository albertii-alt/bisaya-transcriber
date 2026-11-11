import React from 'react';
import { AlertCircleIcon, RefreshCwIcon, CheckCircleIcon } from './Icons';

interface ApiStatusBannerProps {
  status: 'checking' | 'connected' | 'unreachable' | 'auth_error';
  errorMessage?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export const ApiStatusBanner: React.FC<ApiStatusBannerProps> = ({
  status,
  errorMessage,
  onRetry,
  isRetrying,
}) => {
  if (status === 'connected') {
    return null; // Quiet when everything is working normally
  }

  return (
    <div className="w-full mb-4 px-1">
      {status === 'checking' && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white/70 dark:bg-[#1C1C1E]/70 border border-[#E5E5EA] dark:border-[#2C2C2E] text-xs text-[#8E8E93]">
          <span className="w-2 h-2 rounded-full bg-[#007AFF] animate-ping" />
          <span>Connecting to transcription server...</span>
        </div>
      )}

      {status === 'unreachable' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#FF9500]/30 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FF9500]/10 flex items-center justify-center shrink-0 text-[#FF9500]">
              <AlertCircleIcon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-semibold text-[#1C1C1E] dark:text-[#F2F2F7]">
                Backend API Not Reachable
              </h4>
              <p className="text-[12px] text-[#8E8E93] dark:text-[#98989D] mt-1 leading-relaxed">
                {errorMessage ||
                  'The /api routes run on Vercel (or via tsx server.ts). In a static preview without serverless functions, Gemini uploads and transcription will wait for the API.'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="h-8 px-3 rounded-lg bg-[#007AFF]/10 hover:bg-[#007AFF]/20 text-[#007AFF] dark:text-[#0A84FF] text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
                >
                  <RefreshCwIcon size={13} className={isRetrying ? 'animate-spin' : ''} />
                  <span>{isRetrying ? 'Checking...' : 'Check Again'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {status === 'auth_error' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#FF3B30]/30 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FF3B30]/10 flex items-center justify-center shrink-0 text-[#FF3B30]">
              <AlertCircleIcon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-semibold text-[#1C1C1E] dark:text-[#F2F2F7]">
                Passcode Required
              </h4>
              <p className="text-[12px] text-[#8E8E93] dark:text-[#98989D] mt-1 leading-relaxed">
                {errorMessage || 'Passcode does not match the server APP_PASSCODE environment variable.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
