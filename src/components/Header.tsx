import React from 'react';
import { SunIcon, MoonIcon, LockIcon } from './Icons';

interface HeaderProps {
  onLockClick?: () => void;
  isUnlocked?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onLockClick,
  isUnlocked,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full backdrop-blur-xl bg-[#F2F2F7]/85 dark:bg-[#000000]/85 border-b border-[#E5E5EA]/80 dark:border-[#2C2C2E]/80 transition-colors pt-safe">
      <div className="max-w-[640px] mx-auto px-5 h-[52px] flex items-center justify-between">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F2F2F7] select-none">
            Bisaya Transcriber
          </span>
        </div>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Theme Switcher */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F2F2F7] active:opacity-70 transition-colors"
          >
            {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
          </button>

          {/* Passcode Lock/Unlock Status */}
          {isUnlocked && onLockClick && (
            <button
              type="button"
              onClick={onLockClick}
              aria-label="Lock app"
              title="Lock Passcode"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[#8E8E93] hover:text-[#007AFF] dark:hover:text-[#0A84FF] active:opacity-70 transition-colors"
            >
              <LockIcon size={17} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
