import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SETTINGS, type Settings } from '../types'

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void
  resetSettings: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      resetSettings: () => set({ ...DEFAULT_SETTINGS }),
    }),
    { name: 'jiaojibei:settings', version: 1 },
  ),
)
