import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Per-browser display preferences (spec 3.7: sound on/off, reduced-motion mode). */
export type MotionPreference = 'system' | 'reduce' | 'full';
/** Minimal vector art, or the illustrated images from the assets folder. */
export type ArtStyle = 'vector' | 'images';

interface Preferences {
  sound: boolean;
  motion: MotionPreference;
  art: ArtStyle;
  setSound: (sound: boolean) => void;
  setMotion: (motion: MotionPreference) => void;
  setArt: (art: ArtStyle) => void;
}

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      sound: true,
      motion: 'system',
      art: 'vector',
      setSound: (sound) => set({ sound }),
      setMotion: (motion) => set({ motion }),
      setArt: (art) => set({ art }),
    }),
    {
      name: 'splendor-preferences',
      version: 1,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') throw new Error('No storage on the server');
        return window.localStorage;
      }),
      partialize: (s) => ({ sound: s.sound, motion: s.motion, art: s.art }),
    },
  ),
);

/** Current art style; components switch between vector and illustrated rendering. */
export function useArtStyle(): ArtStyle {
  return usePreferences((s) => s.art);
}

const query = '(prefers-reduced-motion: reduce)';

function subscribeSystem(callback: () => void): () => void {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

/** True when animations should be skipped (system setting or explicit choice). */
export function useReducedMotion(): boolean {
  const pref = usePreferences((s) => s.motion);
  const system = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(query).matches,
    () => false,
  );
  return pref === 'reduce' || (pref === 'system' && system);
}
