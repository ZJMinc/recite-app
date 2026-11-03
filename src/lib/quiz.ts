import { db } from '../db'
import type { CardRecord } from '../types'
import type { WrongRecord } from '../db'
import {
  transitionWrong,
  WRONG_CLEAR_STREAK,
  type QuizOptions,
  type WrongTransition,
} from './quiz-core'

export {
  isCorrect,
  isQuizCard,
  pickQuizCards,
  transitionWrong,
  WRONG_CLEAR_STREAK,
} from './quiz-core'
export type { QuizOptions, WrongTransition } from './quiz-core'

export interface AnswerOutcome {
  correct: boolean
  wrongCount: number
  /** 这次答对把错题从本子里移出了 */
  resolved: boolean
  /** 距离移出还差几次连对 */
  remaining: number
}

/** 把纯函数的决策落库，并回报给界面 */
export async function recordAnswer(
  cardId: string,
  correct: boolean,
  now: number = Date.now(),
): Promise<AnswerOutcome> {
  const existing = await db.wrongs.get(cardId)
  const transition = transitionWrong(existing, correct, now)

  if (transition.kind === 'delete') {
    await db.wrongs.delete(cardId)
    return { correct: true, wrongCount: transition.wrongCount, resolved: true, remaining: 0 }
  }

  if (transition.kind === 'put') {
    await db.wrongs.put({ ...transition.record, cardId })
    const streak = transition.record.correctStreak
    return {
      correct,
      wrongCount: transition.record.wrongCount,
      resolved: false,
      remaining: correct ? WRONG_CLEAR_STREAK - streak : WRONG_CLEAR_STREAK,
    }
  }

  return { correct: true, wrongCount: 0, resolved: false, remaining: 0 }
}

export interface WrongItem {
  record: WrongRecord
  card?: CardRecord
}

/** 错题本列表：错得多的在前，同次数按最近出错时间 */
export async function loadWrongItems(): Promise<WrongItem[]> {
  const [records, cards] = await Promise.all([db.wrongs.toArray(), db.cards.toArray()])
  const byId = new Map(cards.map((c) => [c.id, c]))
  return records
    .map((record) => ({ record, card: byId.get(record.cardId) }))
    .filter((item) => item.card !== undefined)
    .sort(
      (a, b) =>
        b.record.wrongCount - a.record.wrongCount ||
        b.record.lastWrongAt - a.record.lastWrongAt,
    )
}

export async function countWrongs(): Promise<number> {
  return db.wrongs.count()
}

export async function removeWrong(cardId: string): Promise<void> {
  await db.wrongs.delete(cardId)
}

export async function clearWrongs(): Promise<void> {
  await db.wrongs.clear()
}
