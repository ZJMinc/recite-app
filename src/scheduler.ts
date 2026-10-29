import { fsrs, Rating, State, type Card as FSRSCard, type Grade } from 'ts-fsrs'
import type { CardRecord } from './types'

type Scheduler = ReturnType<typeof fsrs>

const cache = new Map<number, Scheduler>()

function getScheduler(retention: number): Scheduler {
  let s = cache.get(retention)
  if (!s) {
    s = fsrs({
      request_retention: retention,
      enable_fuzz: true,
      enable_short_term: false,
    })
    cache.set(retention, s)
  }
  return s
}

export function toFSRS(card: CardRecord): FSRSCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

export function formatInterval(ms: number): string {
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (ms < minute) return '1 分钟'
  if (ms < hour) return `${Math.round(ms / minute)} 分钟`
  if (ms < day) return `${Math.round(ms / hour)} 小时`
  const days = ms / day
  if (days < 30) return `${Math.round(days)} 天`
  if (days < 365) return `${Math.round(days / 30)} 个月`
  return `${(days / 365).toFixed(1)} 年`
}

export interface RatingResult {
  card: CardRecord
  interval: string
}

/** 按 FSRS 计算评分后的新状态 */
export function applyRating(
  card: CardRecord,
  rating: 1 | 2 | 3 | 4,
  retention: number,
  now: Date = new Date(),
): RatingResult {
  const scheduler = getScheduler(retention)
  const scheduling = scheduler.repeat(toFSRS(card), now)
  const item = scheduling[rating as Grade]
  const next = item.card
  const nextCard: CardRecord = {
    ...card,
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    scheduled_days: next.scheduled_days,
    learning_steps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state as number,
    last_review: now.getTime(),
  }
  return {
    card: nextCard,
    interval: formatInterval(Math.max(0, nextCard.due - now.getTime())),
  }
}

/** 四个按钮上显示的“下次间隔” */
export function previewIntervals(
  card: CardRecord,
  retention: number,
  now: Date = new Date(),
): Record<1 | 2 | 3 | 4, string> {
  const scheduler = getScheduler(retention)
  const scheduling = scheduler.repeat(toFSRS(card), now)
  const read = (r: Grade) =>
    formatInterval(Math.max(0, scheduling[r].card.due.getTime() - now.getTime()))
  return {
    1: read(Rating.Again),
    2: read(Rating.Hard),
    3: read(Rating.Good),
    4: read(Rating.Easy),
  }
}

export const RATING_META = {
  1: { label: '忘记', color: 'rose' },
  2: { label: '模糊', color: 'gold' },
  3: { label: '记住', color: 'accent' },
  4: { label: '简单', color: 'sky' },
} as const

export type RatingKey = 1 | 2 | 3 | 4
