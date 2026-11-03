import { examCountdown } from './date.ts'

/**
 * 学习计划倒推：按考试日期把「还没学的新卡」摊到剩余天数上，
 * 判断当前每日新卡量跟不跟得上，给一句可执行的结论。
 *
 * 纯函数，不读数据库；调用方把当前统计传进来。
 */

export type PlanStatus = 'no-exam' | 'overdue' | 'done' | 'comfortable' | 'tight'

export interface StudyPlan {
  /** 距离考试的天数；没有考试日期为 null */
  daysLeft: number | null
  /** 还没学过的新卡 */
  remainingNew: number
  /** 要在考前学完，每天需要新增多少张；无法计算时为 null */
  perDayNeeded: number | null
  /** 当前设置下每天能学多少张 */
  dailyNewLimit: number
  status: PlanStatus
  message: string
}

export interface PlanInput {
  examDate?: string
  totalCards: number
  learnedCards: number
  dailyNewLimit: number
}

export function computePlan(input: PlanInput): StudyPlan {
  const remainingNew = Math.max(0, input.totalCards - input.learnedCards)
  const daysLeft = examCountdown(input.examDate)
  const dailyNewLimit = input.dailyNewLimit

  if (daysLeft === null) {
    return {
      daysLeft: null,
      remainingNew,
      perDayNeeded: null,
      dailyNewLimit,
      status: 'no-exam',
      message: '设置考试日期后，这里会倒推每天需要背多少张。',
    }
  }

  if (remainingNew === 0) {
    return {
      daysLeft,
      remainingNew,
      perDayNeeded: 0,
      dailyNewLimit,
      status: 'done',
      message: '新卡已经全部学过一轮，接下来交给间隔重复巩固。',
    }
  }

  if (daysLeft <= 0) {
    return {
      daysLeft,
      remainingNew,
      perDayNeeded: null,
      dailyNewLimit,
      status: 'overdue',
      message: `考试日期已${daysLeft < 0 ? '过' : '到'}，还有 ${remainingNew} 张没学。建议更新考试日期。`,
    }
  }

  const perDayNeeded = Math.ceil(remainingNew / daysLeft)
  // 留 20% 余量：卡在极限值上没有缓冲，一天落下就追不回
  const comfortable = perDayNeeded <= Math.max(1, Math.floor(dailyNewLimit * 1.2))

  return {
    daysLeft,
    remainingNew,
    perDayNeeded,
    dailyNewLimit,
    status: comfortable ? 'comfortable' : 'tight',
    message: comfortable
      ? `还有 ${remainingNew} 张没学，每天 ${perDayNeeded} 张能在考前学完。`
      : `还有 ${remainingNew} 张没学，考前需要每天 ${perDayNeeded} 张，当前设置是 ${dailyNewLimit} 张。`,
  }
}

/** 给培养计划用的每日目标：到期复习 + 新卡，不超过每日新卡上限 */
export function todayTarget(dueCount: number, plannedNew: number): number {
  return Math.max(0, dueCount) + Math.max(0, plannedNew)
}
