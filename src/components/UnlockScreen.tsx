import React, { useState } from 'react';
import { LockIcon, EyeIcon, EyeOffIcon, SpinnerIcon, CheckCircleIcon } from './Icons';

interface UnlockScreenProps {
  onUnlock: (passcode: string) => Promise<boolean>;
  initialPasscode?: string;
  isVerifying?: boolean;
  errorMessage?: string;
}

export const UnlockScreen: React.FC<UnlockScreenProps> = ({
  onUnlock,
  initialPasscode = '',
  isVerifying = false,
  errorMessage,
}) => {
  const [passcode, setPasscode] = useState(initialPasscode);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmed = passcode.trim();
    if (!trimmed) {
      setLocalError('Please enter your passcode to continue.');
      return;
    }

    try {
      const ok = await onUnlock(trimmed);
      if (!ok) {
        setLocalError('Incorrect passcode. Please check your APP_PASSCODE environment variable.');
      }
    } catch (err: any) {
      setLocalError(err.message || 'Verification failed. Please try again.');
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-5 py-8 max-w-[420px] mx-auto w-full">
      {/* Icon Squircle */}
      <div className="w-[88px] h-[88px] rounded-[24px] bg-[#007AFF]/10 dark:bg-[#0A84FF]/15 text-[#007AFF] dark:text-[#0A84FF] flex items-center justify-center shadow-xs mb-6">
        <LockIcon size={40} />
      </div>

      {/* Heading */}
      <h1 className="text-[28px] font-bold tracking-tight text-[#1C1C1E] dark:text-[#F2F2F7] text-center mb-2">
        Bisaya Transcriber
      </h1>
      <p className="text-[15px] text-[#8E8E93] dark:text-[#98989D] text-center mb-8 leading-snug">
        Enter your passcode to authenticate with your transcription server.
      </p>

      {/* Passcode Card */}
      <form onSubmit={handleSubmit} className="w-full">
        <div className="bg-white dark:bg-[#1C1C1E] rounded-[20px] border border-[#E5E5EA] dark:border-[#2C2C2E] p-1.5 shadow-xs mb-4">
          <div className="flex items-center px-4 h-[50px] gap-3">
            <span className="text-[#8E8E93] dark:text-[#98989D]">
              <LockIcon size={18} />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder="Enter passcode"
              autoFocus
              autoComplete="current-password"
              className="flex-1 bg-transparent text-[16px] text-[#1C1C1E] dark:text-[#F2F2F7] placeholder-[#8E8E93] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide passcode' : 'Show passcode'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F2F2F7] active:opacity-70 transition-colors"
            >
              {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
        </div>

        {displayError && (
          <div className="px-3 py-2 mb-4 text-xs font-medium text-[#FF3B30] dark:text-[#FF453A] bg-[#FF3B30]/10 rounded-xl text-center leading-relaxed">
            {displayError}
          </div>
        )}

        {/* Continue Button */}
        <button
          type="submit"
          disabled={isVerifying}
          className="w-full h-[50px] rounded-[14px] bg-[#007AFF] hover:bg-[#0071E3] dark:bg-[#0A84FF] text-white font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm cursor-pointer"
        >
          {isVerifying ? (
            <>
              <SpinnerIcon size={20} />
              <span>Verifying...</span>
            </>
          ) : (
            <span>Continue</span>
          )}
        </button>
      </form>

      {/* Helpful Hint */}
      <div className="mt-8 text-center text-xs text-[#8E8E93] dark:text-[#98989D] max-w-[320px]">
        Configured via the <span className="font-mono text-[11px] bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded">APP_PASSCODE</span> environment variable on your Vercel deployment.
      </div>
    </div>
  );
};
