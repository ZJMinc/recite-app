import Dexie, { type Table } from 'dexie'
import { SEED_CARDS } from './data/seed'
import type { CardRecord, DailyRecord, ReviewRecord, SeedCard } from './types'

class AppDB extends Dexie {
  cards!: Table<CardRecord, string>
  reviews!: Table<ReviewRecord, number>
  daily!: Table<DailyRecord, string>

  constructor() {
    super('jiaojibei')
    this.version(1).stores({
      cards: 'id, subjectId, chapterId, due, state, type',
      reviews: '++id, cardId, at',
      daily: 'date',
    })
  }
}

export const db = new AppDB()

export function makeNewCard(seed: SeedCard): CardRecord {
  return {
    ...seed,
    importance: seed.importance ?? 3,
    tags: seed.tags ?? [],
    due: Date.now(),
    stability: 0,
    difficulty: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  }
}

/** 首次启动 / 内容更新时补齐缺失卡片，不动已有学习进度 */
export async function initDB() {
  const existing = new Set(await db.cards.toCollection().primaryKeys())
  const missing = SEED_CARDS.filter((c) => !existing.has(c.id)).map(makeNewCard)
  if (missing.length > 0) {
    await db.cards.bulkAdd(missing)
  }
}

/** 重置：清空全部学习数据，并重新写入内置内容 */
export async function resetAll() {
  await db.transaction('rw', db.cards, db.reviews, db.daily, async () => {
    await db.cards.clear()
    await db.reviews.clear()
    await db.daily.clear()
  })
  await db.cards.bulkAdd(SEED_CARDS.map(makeNewCard))
}

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EMPTY_DAY: Omit<DailyRecord, 'date'> = {
  newCount: 0,
  reviewCount: 0,
  againCount: 0,
  seconds: 0,
}

/** 记录一次评分：更新卡片 FSRS 状态 + 复习日志 + 当日统计 */
export async function commitReview(
  card: CardRecord,
  rating: 1 | 2 | 3 | 4,
  prevState: number,
  now: Date = new Date(),
) {
  const key = todayKey(now)
  await db.transaction('rw', db.cards, db.reviews, db.daily, async () => {
    await db.cards.put(card)
    await db.reviews.add({
      cardId: card.id,
      at: now.getTime(),
      rating,
      prevState,
    })
    const day = (await db.daily.get(key)) ?? { date: key, ...EMPTY_DAY }
    if (prevState === 0) day.newCount += 1
    else day.reviewCount += 1
    if (rating === 1) day.againCount += 1
    await db.daily.put(day)
  })
}

export async function addStudySeconds(seconds: number, now: Date = new Date()) {
  if (seconds <= 0) return
  const key = todayKey(now)
  const day = (await db.daily.get(key)) ?? { date: key, ...EMPTY_DAY }
  day.seconds += Math.round(seconds)
  await db.daily.put(day)
}
