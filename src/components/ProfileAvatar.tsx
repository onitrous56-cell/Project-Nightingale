import React from 'react';
import {User} from 'lucide-react';

export const PRESET_AVATARS: Array<{id: string; label: string; svgDataUrl: string}> = [
  {
    id: 'sky',
    label: 'Sky Guardian',
    svgDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#0ea5e9"/><circle cx="60" cy="46" r="20" fill="#f8fafc"/><path d="M26 104c4-20 18-30 34-30s30 10 34 30" fill="#f8fafc"/></svg>'
      ),
  },
  {
    id: 'neon',
    label: 'Neon Pulse',
    svgDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#0a1633"/><circle cx="60" cy="60" r="52" fill="none" stroke="#00f5d4" stroke-width="5"/><circle cx="60" cy="46" r="19" fill="#ff6b00"/><path d="M28 102c4-19 16-28 32-28s28 9 32 28" fill="#00a3ff"/></svg>'
      ),
  },
  {
    id: 'emerald',
    label: 'Calm Leaf',
    svgDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#10b981"/><circle cx="60" cy="46" r="19" fill="#fefce8"/><path d="M26 102c5-18 18-28 34-28s29 10 34 28" fill="#fefce8"/></svg>'
      ),
  },
  {
    id: 'amber',
    label: 'Warm Sun',
    svgDataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#f59e0b"/><circle cx="60" cy="46" r="20" fill="#0f172a"/><path d="M26 104c4-20 18-30 34-30s30 10 34 30" fill="#0f172a"/></svg>'
      ),
  },
];

export async function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl.length > 90000) {
          resolve(canvas.toDataURL('image/jpeg', 0.55));
        } else {
          resolve(dataUrl);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

interface ProfileAvatarProps {
  avatarDataUrl?: string;
  fullName: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  avatarDataUrl,
  fullName,
  size = 'md',
}) => {
  const dimClass =
    size === 'sm' ? 'w-10 h-10 text-sm' : size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-14 h-14 text-lg';

  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt={`${fullName || 'Patient'} profile`}
        className={`${dimClass} rounded-2xl object-cover border-2 border-theme shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${dimClass} rounded-2xl btn-accent font-display font-extrabold flex items-center justify-center shrink-0 border-2 border-theme`}
      aria-label={`${fullName || 'Patient'} initials`}
    >
      {initials || <User className="w-6 h-6" aria-hidden="true" />}
    </div>
  );
};
