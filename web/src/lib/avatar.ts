import type { AvatarStyle } from './types';

const DICEBEAR_VERSION = '9.x';

export function dicebearUrl(style: AvatarStyle, seed: string): string {
  return `https://api.dicebear.com/${DICEBEAR_VERSION}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
