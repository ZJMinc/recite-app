/**
 * 纯日期工具：不依赖数据库，可以在 Node 里直接单测。
 */

/** 距离考试日期还有几天；没有日期或格式非法返回 null。当天返回 0，过期返回负数 */
export function examCountdown(examDate?: string): number | null {
  if (!examDate) return null
  const target = new Date(`${examDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86_400_000)
}
