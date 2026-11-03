import type { ThemeMode } from '../types'

/**
 * 外观解析与落地。
 * resolveTheme 是纯函数（可单测）；applyTheme 才碰 document。
 */

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export type ResolvedTheme = 'light' | 'dark'

/** 把设置里的三种取值解析成实际生效的主题 */
export function resolveTheme(mode: ThemeMode | undefined, prefersDark: boolean): ResolvedTheme {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return prefersDark ? 'dark' : 'light'
}

/** 把主题写到 <html data-theme>，同步主题色（影响移动端状态栏） */
export function applyTheme(mode: ThemeMode | undefined, prefersDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(mode, prefersDark)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#14161a' : '#f7f4ee')
    }
  }
  return resolved
}

/** 订阅系统深浅色变化，回调里给出最新的 prefersDark */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event: MediaQueryListEvent) => onChange(event.matches)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * 首屏防闪：React 挂载前先把主题写到 <html>。
 * 直接读 zustand persist 的落地格式（{ state: {...}, version }），
 * 避免深色用户每次打开都先闪一下白底。
 */
export function restoreThemeBeforeRender(): void {
  let mode: ThemeMode | undefined
  try {
    const raw = localStorage.getItem('jiaojibei:settings')
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: ThemeMode } }
      mode = parsed.state?.theme
    }
  } catch {
    // 存储被禁用或格式异常：按 auto 处理
  }
  applyTheme(mode, systemPrefersDark())
}
