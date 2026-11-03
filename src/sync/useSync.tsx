import { useEffect, useRef, useState } from 'react'
import { isSyncConfigured } from './config'
import { syncNow, type SyncResult } from './engine'

export interface SyncState {
  configured: boolean
  busy: boolean
  last: SyncResult | null
  error: string | null
}

const INTERVAL_MS = 5 * 60 * 1000

/**
 * 后台同步节奏：启动后一次、恢复前台一次、重连一次、之后每 5 分钟一次。
 * 全部失败都静默吞掉并写进 state —— 背卡不能因为后端不可用而中断。
 */
export function useSync(): SyncState {
  const [state, setState] = useState<SyncState>(() => ({
    configured: isSyncConfigured(),
    busy: false,
    last: null,
    error: null,
  }))
  const busyRef = useRef(false)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setInterval> | null = null

    const tick = async () => {
      if (disposed || busyRef.current || !isSyncConfigured()) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      busyRef.current = true
      setState((prev) => ({ ...prev, busy: true, configured: true }))
      try {
        const result = await syncNow()
        if (disposed) return
        setState({ configured: true, busy: false, last: result, error: null })
      } catch (error) {
        if (disposed) return
        setState((prev) => ({
          ...prev,
          busy: false,
          error: (error as Error).message,
        }))
      } finally {
        busyRef.current = false
      }
    }

    void tick()
    timer = setInterval(() => void tick(), INTERVAL_MS)

    const onOnline = () => void tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      disposed = true
      if (timer) clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return state
}

/** 挂在 Layout 里即可，未配置后端时是彻底的 no-op */
export function SyncRuntime() {
  useSync()
  return null
}
