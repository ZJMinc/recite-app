import { todayKey } from '../db'
import type { CardRecord, DailyRecord } from '../types'

export const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export function formatDateCn(d: Date = new Date()) {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WEEKDAY[d.getDay()]}`
}

export function todayKeyOf(d: Date = new Date()) {
  return todayKey(d)
}

export function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

/** 连续学习天数：今天有记录从今天算，否则从昨天算 */
export function computeStreak(days: DailyRecord[]): number {
  const active = new Set(
    days.filter((d) => d.newCount + d.reviewCount > 0).map((d) => d.date),
  )
  let streak = 0
  let cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!active.has(todayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (active.has(todayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function isLearned(card: CardRecord): boolean {
  return card.reps > 0 || card.state > 0
}

export function isMastered(card: CardRecord): boolean {
  return card.state >= 2 && card.stability >= 21
}

/** 单卡掌握度 0~1，用于章节进度条 */
export function cardMastery(card: CardRecord): number {
  if (card.reps === 0) return 0
  if (card.state >= 2 && card.stability >= 21) return 1
  if (card.state >= 2) return 0.7
  if (card.reps >= 2) return 0.4
  return 0.15
}

export function averageMastery(cards: CardRecord[]): number {
  if (cards.length === 0) return 0
  return cards.reduce((sum, c) => sum + cardMastery(c), 0) / cards.length
}

// 实现在 lib/date.ts（纯函数、可单测），这里转出保持原有引用路径不变
export { examCountdown } from './date'

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`
}
