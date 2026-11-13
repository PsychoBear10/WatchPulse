import React from 'react';

interface WatchPulseLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  withText?: boolean;
  subtitle?: string;
}

export const WatchPulseLogo: React.FC<WatchPulseLogoProps> = ({
  size = 'md',
  className = '',
  withText = false,
  subtitle,
}) => {
  const pixelSize =
    size === 'sm' ? 24 : size === 'md' ? 32 : size === 'lg' ? 44 : 64;

  const svgContent = (
    <div
      style={{ width: pixelSize, height: pixelSize }}
      className={`relative shrink-0 rounded-2xl p-[1px] transition-transform duration-300 hover:scale-105 select-none ${className}`}
    >
      {/* Outer Liquid Glass Specular Ring */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/30 via-white/10 to-transparent shadow-[0_8px_20px_-4px_rgba(99,102,241,0.35)]" />

      {/* Glass Body */}
      <div className="relative w-full h-full rounded-[15px] bg-gradient-to-br from-[#121626]/90 via-[#0C0F1A]/95 to-[#070912]/90 backdrop-blur-xl border border-white/20 flex items-center justify-center overflow-hidden shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.25)]">
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-indigo-500/25 blur-lg pointer-events-none" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-emerald-500/20 blur-lg pointer-events-none" />

        <svg
          viewBox="0 0 40 40"
          className="w-[82%] h-[82%] drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wpIrisGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#818CF8" />
              <stop offset="50%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>

            <linearGradient id="wpSpecular" x1="20" y1="6" x2="20" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
            </linearGradient>

            <radialGradient id="wpCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34D399" stopOpacity="1" />
              <stop offset="65%" stopColor="#059669" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.3" />
            </radialGradient>
          </defs>

          {/* Outer Liquid Aperture Wave / Watching Arc */}
          <path
            d="M6 20C9.5 12 14.5 8 20 8C25.5 8 30.5 12 34 20C30.5 28 25.5 32 20 32C14.5 32 9.5 28 6 20Z"
            stroke="url(#wpIrisGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-95"
          />

          {/* Concentric Glass Pulse Ring */}
          <circle
            cx="20"
            cy="20"
            r="7.5"
            stroke="url(#wpIrisGrad)"
            strokeWidth="1.75"
            strokeDasharray="1.5 2.5"
            className="animate-spin-slow opacity-80"
          />

          {/* Concentric Solid Aperture Rim */}
          <circle
            cx="20"
            cy="20"
            r="5"
            stroke="#A5B4FC"
            strokeWidth="1.2"
            strokeOpacity="0.7"
          />

          {/* Center Jewel Core (Active Live Pulse Sensor) */}
          <circle
            cx="20"
            cy="20"
            r="3.2"
            fill="url(#wpCoreGlow)"
          />

          {/* Specular Highlight Glint */}
          <circle
            cx="18.8"
            cy="18.5"
            r="1"
            fill="#FFFFFF"
            className="opacity-95"
          />

          {/* Waveform Micro-Pulse Bars at Base */}
          <rect x="13" y="27" width="2.2" height="2" rx="1" fill="#F43F5E" opacity="0.9" />
          <rect x="17" y="26" width="2.2" height="3" rx="1" fill="#F59E0B" opacity="0.9" />
          <rect x="21" y="25" width="2.2" height="4" rx="1" fill="#10B981" opacity="0.95" />
          <rect x="25" y="27" width="2.2" height="2" rx="1" fill="#38BDF8" opacity="0.9" />
        </svg>
      </div>
    </div>
  );

  if (!withText) {
    return svgContent;
  }

  return (
    <div className="flex items-center gap-2.5 select-none">
      {svgContent}
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
          <span>WatchPulse</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            v3.0
          </span>
        </div>
        {subtitle && (
          <div className="text-[10px] text-slate-400">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
