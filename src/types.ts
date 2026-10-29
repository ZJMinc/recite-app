export type SubjectId =
  | 'pedagogy'
  | 'psychology'
  | 'edupsy'
  | 'law'
  | 'ethics'
  | 'newcur'

export type CardType = 'cloze' | 'qa' | 'choice' | 'judge'

export interface Subject {
  id: SubjectId
  title: string
  short: string
  desc: string
  color: string
}

export interface Chapter {
  id: string
  subjectId: SubjectId
  title: string
  order: number
}

/** 内容侧：编写卡片时只关心这些字段 */
export interface SeedCard {
  id: string
  subjectId: SubjectId
  chapterId: string
  /** 知识点名称，用于标题与分组 */
  kp: string
  type: CardType
  /** 题干（挖空卡可为空，此时用 kp 当标题） */
  front: string
  /** 答案。挖空卡用 {{答案}} 标记挖空处 */
  back: string
  options?: string[]
  /** 选择题为选项下标，判断题为 true/false */
  answer?: number | boolean
  analysis?: string
  mnemonic?: string
  confusables?: string
  importance?: 1 | 2 | 3 | 4 | 5
  tags?: string[]
}

/** 存储侧：内容 + FSRS 状态 */
export interface CardRecord extends SeedCard {
  importance: 1 | 2 | 3 | 4 | 5
  tags: string[]
  due: number
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** FSRS State: 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: number
  last_review?: number
}

export interface ReviewRecord {
  id?: number
  cardId: string
  at: number
  rating: 1 | 2 | 3 | 4
  prevState: number
}

export interface DailyRecord {
  date: string
  newCount: number
  reviewCount: number
  againCount: number
  seconds: number
}

export interface Settings {
  dailyNewLimit: number
  targetRetention: number
  examDate?: string
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNewLimit: 20,
  targetRetention: 0.9,
}
