import React from 'react';

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  size = 200,
  strokeWidth = 12,
  label,
  sublabel,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center select-none" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-[#E5E5EA] dark:text-[#2C2C2E]"
          fill="none"
        />
        {/* Progress Value */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-[#007AFF] dark:text-[#0A84FF] transition-[stroke-dashoffset] duration-300 ease-out"
          fill="none"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <span className="text-[38px] font-bold tracking-tight text-[#1C1C1E] dark:text-[#F2F2F7] tabular-nums leading-none">
          {clamped}%
        </span>
        {label && (
          <span className="mt-1 text-xs font-medium text-[#8E8E93] dark:text-[#98989D] uppercase tracking-wider">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="text-[11px] text-[#8E8E93] dark:text-[#98989D] mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};
