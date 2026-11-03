import type { CardRecord, DailyRecord, ReviewRecord, Settings } from '../types'

/**
 * 纯粹的合并规则，不碰 IndexedDB / 网络，便于单测。
 *
 * 三条规则决定了整个同步：
 *   1. reviews 只追加 → 取并集，按 (cardId, at, rating) 去重，永不冲突
 *   2. states 按 last_review 做 last-write-wins（时间戳即版本号）
 *   3. settings 按 updated 做 last-write-wins
 */

export type ReviewKey = string

export function reviewKey(
  r: Pick<ReviewRecord, 'cardId' | 'at' | 'rating'>,
): ReviewKey {
  return `${r.cardId}@${r.at}#${r.rating}`
}

/** 卡片 FSRS 状态的版本号：以最后一次复习时刻为准 */
export function stateVersion(card: Pick<CardRecord, 'last_review'>): number {
  return card.last_review ?? 0
}

/** 状态是否该被远端覆盖 */
export function shouldTakeRemoteState(
  local: Pick<CardRecord, 'last_review'>,
  remoteUpdated: number,
): boolean {
  return remoteUpdated > stateVersion(local)
}

/** 复习日志取并集：本地顺序保留，远端新条目追加，重复项丢弃 */
export function unionReviews(
  local: ReviewRecord[],
  incoming: ReviewRecord[],
): ReviewRecord[] {
  const seen = new Set<ReviewKey>()
  for (const r of local) seen.add(reviewKey(r))
  const out = local.slice()
  for (const r of incoming) {
    const key = reviewKey(r)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** 从复习日志重算某天的聚合；seconds 无法从日志推导，沿用本地既有值 */
export function recomputeDaily(
  reviews: ReviewRecord[],
  date: string,
  seconds = 0,
): DailyRecord {
  let newCount = 0
  let reviewCount = 0
  let againCount = 0
  for (const r of reviews) {
    if (r.prevState === 0) newCount += 1
    else reviewCount += 1
    if (r.rating === 1) againCount += 1
  }
  return { date, newCount, reviewCount, againCount, seconds }
}

/** 把时间戳落成本地时区的 YYYY-MM-DD，与 db.ts 的 todayKey 保持一致 */
export function localDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type SettingsWinner = 'local' | 'remote' | 'tie'

export function pickSettings(
  local: { values: Settings; updated: number } | null,
  remote: { values: Settings; updated: number } | null,
): SettingsWinner {
  if (!remote) return local ? 'local' : 'tie'
  if (!local) return 'remote'
  if (remote.updated > local.updated) return 'remote'
  if (local.updated > remote.updated) return 'local'
  return 'tie'
}
