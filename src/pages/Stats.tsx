import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { SUBJECTS, chaptersOf } from '../data/curriculum'
import type { DailyRecord, SubjectId } from '../types'
import { averageMastery, computeStreak, isLearned, isMastered } from '../lib/stats'
import { MasteryBar } from '../components/ui'

const HEAT = ['#ece7db', '#cfe0d6', '#9dc3b1', '#5f947e', '#2e6b58']

function heatLevel(total: number): number {
  if (total <= 0) return 0
  if (total < 10) return 1
  if (total < 30) return 2
  if (total < 60) return 3
  return 4
}

function buildHeatmap(days: DailyRecord[]) {
  const map = new Map(days.map((d) => [d.date, d]))
  const cells: { date: string; total: number; level: number }[] = []
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(end.getDate() - 84)
  // 对齐到周一
  const offset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - offset)

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    const rec = map.get(key)
    const total = rec ? rec.newCount + rec.reviewCount : 0
    cells.push({ date: key, total, level: heatLevel(total) })
  }
  // 补齐最后一周的空白格，保证 7 行对齐
  while (cells.length % 7 !== 0) {
    cells.push({ date: '', total: 0, level: -1 })
  }
  return cells
}

export function Stats() {
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const days = useLiveQuery(() => db.daily.toArray(), [])
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const [subject, setSubject] = useState<SubjectId>('pedagogy')

  const heat = useMemo(() => buildHeatmap(days ?? []), [days])

  if (!cards || !days || !reviews) {
    return <div className="pt-16 text-center text-sm text-muted">载入中…</div>
  }

  const learned = cards.filter(isLearned).length
  const mastered = cards.filter(isMastered).length
  const streak = computeStreak(days)
  const retention =
    reviews.length > 0
      ? reviews.filter((r) => r.rating >= 3).length / reviews.length
      : null
  const totalCards = cards.length

  const chapters = chaptersOf(subject)

  return (
    <div className="flex flex-col gap-4 pb-2">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-semibold">学习统计</h1>
        <p className="mt-1 text-[12px] text-muted">
          连续打卡 {streak} 天 · 累计评分 {reviews.length} 次
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2.5">
        <StatCard label="总卡片" value={String(totalCards)} sub="全库" />
        <StatCard
          label="已学"
          value={String(learned)}
          sub={`${Math.round((learned / Math.max(1, totalCards)) * 100)}%`}
        />
        <StatCard label="已掌握" value={String(mastered)} sub="间隔 ≥ 21 天" />
        <StatCard
          label="记得率"
          value={retention === null ? '—' : `${Math.round(retention * 100)}%`}
          sub="评分 ≥ 记住"
        />
      </section>

      <section className="rounded-2xl border border-line/70 bg-surface px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[13.5px] font-medium text-ink">近 13 周打卡</h2>
          <span className="text-[11px] text-muted">{heat.reduce((s, c) => s + Math.max(0, c.total), 0)} 张次</span>
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto no-scrollbar">
          {heat.map((cell, i) =>
            cell.level < 0 ? (
              <div key={`pad-${i}`} className="h-[13px] w-[13px] shrink-0" />
            ) : (
              <div
                key={cell.date}
                title={`${cell.date} · ${cell.total} 张`}
                className="h-[13px] w-[13px] shrink-0 rounded-[3px]"
                style={{ backgroundColor: HEAT[cell.level] }}
              />
            ),
          )}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted">
          <span>少</span>
          {HEAT.map((c) => (
            <span
              key={c}
              className="h-[10px] w-[10px] rounded-[2px]"
              style={{ backgroundColor: c }}
            />
          ))}
          <span>多</span>
        </div>
      </section>

      <section className="rounded-2xl border border-line/70 bg-surface px-3 pb-3 pt-3.5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13.5px] font-medium text-ink">章节掌握度</h2>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubject(s.id)}
              className={[
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                subject === s.id
                  ? 'bg-ink text-paper'
                  : 'border border-line text-muted hover:text-ink',
              ].join(' ')}
            >
              {s.short}
            </button>
          ))}
        </div>
        <div className="flex flex-col">
          {chapters.map((ch) => {
            const list = cards.filter((c) => c.chapterId === ch.id)
            const mastery = averageMastery(list)
            const color = SUBJECTS.find((s) => s.id === ch.subjectId)?.color ?? '#2e6b58'
            return (
              <div key={ch.id} className="px-1 py-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] text-ink-soft">{ch.title}</span>
                  <span className="tabular shrink-0 text-[10.5px] text-muted">
                    {Math.round(mastery * 100)}% · {list.length} 张
                  </span>
                </div>
                <MasteryBar value={mastery} color={color} />
              </div>
            )
          })}
        </div>
      </section>

      <p className="px-1 pb-2 text-center text-[10.5px] leading-relaxed text-muted">
        掌握度按记忆稳定性估算：复习间隔越长、越稳定，说明记得越牢。
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-2xl border border-line/70 bg-surface px-3.5 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[24px] font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10.5px] text-muted">{sub}</p>
    </div>
  )
}
