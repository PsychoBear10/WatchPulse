import React, { useEffect, useState } from 'react';
import { getAvatarGradient, getInitials, resolveMediaSrc } from '../../utils/media';

interface ModelAvatarProps {
  username: string;
  displayName?: string;
  thumbnail?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  accentColor?: string;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ModelAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[11px] rounded-md',
  sm: 'w-9 h-9 text-xs rounded-lg',
  md: 'w-12 h-12 text-sm rounded-xl',
  lg: 'w-20 h-20 text-xl rounded-2xl',
  xl: 'w-28 h-28 text-2xl rounded-2xl',
};

export const ModelAvatar: React.FC<ModelAvatarProps> = ({
  username,
  displayName,
  thumbnail = '',
  size = 'md',
  accentColor,
  className = '',
}) => {
  const resolved = resolveMediaSrc(thumbnail);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [resolved]);

  const showImage = Boolean(resolved) && !imgError;
  const initials = getInitials(displayName || username);
  const gradient = getAvatarGradient(username);

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-white/10 bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold tracking-tight text-white/90 select-none ${SIZE_CLASSES[size]} ${className}`}
      style={
        accentColor
          ? { boxShadow: `0 0 0 1px ${accentColor}40` }
          : undefined
      }
    >
      {showImage ? (
        <img
          src={resolved}
          alt={displayName || username}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};
