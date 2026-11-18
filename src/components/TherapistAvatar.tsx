import { useEffect, useState } from 'react';

interface TherapistAvatarProps {
  name: string;
  src?: string;
  sizeClass?: string;
}

export const therapistAvatarsFallback = '';

export function TherapistAvatar({
  name,
  src,
  sizeClass = 'w-10 h-10',
}: TherapistAvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-slate-200 text-slate-700 font-display font-semibold text-xs flex items-center justify-center shrink-0 border border-slate-300`}
        aria-label={name}
      >
        {initials || 'SP'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-full object-cover shrink-0 border border-slate-200 bg-slate-100`}
    />
  );
}
