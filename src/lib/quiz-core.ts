import type { WrongRecord } from '../db'
import type { CardRecord } from '../types'

/** 连对几次算“掌握”，从错题本移出 */
export const WRONG_CLEAR_STREAK = 2

/** 只有真正的客观题能进刷题模式 */
export function isQuizCard(card: CardRecord): boolean {
  if (card.type === 'choice') return (card.options?.length ?? 0) >= 2
  if (card.type === 'judge') return typeof card.answer === 'boolean'
  return false
}

export function isCorrect(card: CardRecord, picked: number | boolean): boolean {
  if (card.type === 'choice') return card.answer === picked
  if (card.type === 'judge') return Boolean(card.answer) === Boolean(picked)
  return false
}

export interface QuizOptions {
  chapterId?: string
  subjectId?: string
  /** 只出指定卡片（例如只练错题） */
  onlyCardIds?: Set<string>
  size?: number
}

/**
 * 组卷：重要度高的先出，同重要度按 id 稳定排序。
 * 刻意不打乱——同样的输入永远得到同样的卷子，便于复现与测试。
 */
export function pickQuizCards(all: CardRecord[], options: QuizOptions = {}): CardRecord[] {
  let pool = all.filter(isQuizCard)
  if (options.onlyCardIds) {
    const ids = options.onlyCardIds
    pool = pool.filter((c) => ids.has(c.id))
  }
  if (options.chapterId) pool = pool.filter((c) => c.chapterId === options.chapterId)
  if (options.subjectId) pool = pool.filter((c) => c.subjectId === options.subjectId)

  pool.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
  return options.size && options.size > 0 ? pool.slice(0, options.size) : pool
}

export type WrongTransition =
  | { kind: 'none' }
  | { kind: 'put'; record: WrongRecord }
  | { kind: 'delete'; wrongCount: number }

/**
 * 一次作答之后错题记录该怎么变（纯函数，不碰数据库）：
 *
 * - 答错：计数 +1、连对清零；从没错过的卡片在这里被收进错题本
 * - 答对且本来不在错题本：什么都不做
 * - 答对且连对达到阈值：删记录（移出错题本）
 * - 其它情况：连对 +1
 */
export function transitionWrong(
  existing: WrongRecord | undefined,
  correct: boolean,
  now: number,
): WrongTransition {
  if (!correct) {
    return {
      kind: 'put',
      record: {
        cardId: existing?.cardId ?? '',
        wrongCount: (existing?.wrongCount ?? 0) + 1,
        correctStreak: 0,
        lastWrongAt: now,
        lastAnsweredAt: now,
      },
    }
  }

  if (!existing) return { kind: 'none' }

  const streak = existing.correctStreak + 1
  if (streak >= WRONG_CLEAR_STREAK) {
    return { kind: 'delete', wrongCount: existing.wrongCount }
  }
  return {
    kind: 'put',
    record: { ...existing, correctStreak: streak, lastAnsweredAt: now },
  }
}
