import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { useSettings } from '../store/settings'
import { Icon } from '../components/Icon'
import { computeStreak, examCountdown, formatDateCn, isLearned } from '../lib/stats'
import { CHAPTER_MAP, SUBJECT_MAP } from '../data/curriculum'
import { ProgressBar } from '../components/ui'

const TIPS = [
  '先回忆，再翻面。憋答案的那几秒，才是记忆真正发生的地方。',
  '想不起来时，先想“它在哪一章”，用框架把细节带出来。',
  '简答题记要点首字，比整段硬背更牢——先搭骨架，再填血肉。',
  '今天背完，明天会忘掉一半，这很正常。复习会把它拉回来。',
  '每天 20 张的连续打卡，比周末一次背 200 张有效得多。',
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function Today() {
  const navigate = useNavigate()
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const days = useLiveQuery(() => db.daily.toArray(), [])
  const { dailyNewLimit, examDate } = useSettings()

  if (!cards || !days) {
    return <div className="pt-16 text-center text-sm text-muted">载入中…</div>
  }

  const now = Date.now()
  const today = new Date()
  const todayRecord = days.find((d) => d.date === toKey(today))
  const doneNew = todayRecord?.newCount ?? 0
  const doneReview = todayRecord?.reviewCount ?? 0
  const doneToday = doneNew + doneReview

  const dueCount = cards.filter((c) => c.state !== 0 && c.due <= now).length
  const newRemaining = Math.max(0, dailyNewLimit - doneNew)
  const newCards = cards.filter((c) => c.state === 0)
  const plannedNew = Math.min(newRemaining, newCards.length)
  const pending = dueCount + plannedNew

  const learned = cards.filter(isLearned).length
  const streak = computeStreak(days)
  const countdown = examCountdown(examDate)
  const target = doneToday + pending
  const tip = TIPS[new Date().getDate() % TIPS.length]

  const pendingCards = [
    ...cards.filter((c) => c.state !== 0 && c.due <= now),
    ...newCards.slice(0, plannedNew),
  ]
  const chapterCounts = new Map<string, number>()
  for (const c of pendingCards) {
    chapterCounts.set(c.chapterId, (chapterCounts.get(c.chapterId) ?? 0) + 1)
  }
  const plan = [...chapterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between px-1 pt-1">
        <div>
          <p className="text-[11px] tracking-wide text-muted">{formatDateCn()}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight text-ink">
            {greeting()}，今天背一点？
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-gold/25 bg-gold-soft px-2.5 py-1 text-gold">
          <Icon name="flame" size={14} />
          <span className="tabular text-[12px] font-medium">{streak} 天</span>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[26px] bg-accent px-5 pb-4 pt-5 text-white shadow-[0_10px_30px_-18px_rgba(29,74,59,0.9)]">
        <div
          className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/8"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-white/5"
          aria-hidden
        />
        <p className="text-[12px] text-white/70">今天还有</p>
        <div className="mt-0.5 flex items-end gap-1.5">
          <span className="tabular text-[46px] font-semibold leading-none">{pending}</span>
          <span className="mb-1.5 text-[13px] text-white/75">张要背</span>
        </div>

        <div className="mt-4 flex items-stretch gap-3 text-[12px]">
          <div className="flex-1">
            <p className="text-white/60">到期待复习</p>
            <p className="tabular mt-0.5 text-[16px] font-medium">{dueCount}</p>
          </div>
          <div className="w-px bg-white/15" />
          <div className="flex-1">
            <p className="text-white/60">今日新卡</p>
            <p className="tabular mt-0.5 text-[16px] font-medium">{plannedNew}</p>
          </div>
          <div className="w-px bg-white/15" />
          <div className="flex-1">
            <p className="text-white/60">今日已背</p>
            <p className="tabular mt-0.5 text-[16px] font-medium">{doneToday}</p>
          </div>
        </div>

        <div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-white/85 transition-[width] duration-300"
            style={{ width: `${target > 0 ? Math.min(100, (doneToday / target) * 100) : 100}%` }}
          />
        </div>

        <button
          type="button"
          onClick={() => navigate('/review')}
          className="mt-4 w-full rounded-2xl bg-white py-3 text-[15px] font-semibold text-accent-ink shadow-sm active:scale-[0.99]"
        >
          {pending > 0 ? `开始背诵 · ${pending} 张` : '今日已完成 · 自由加练'}
        </button>
      </section>

      {countdown !== null ? (
        <section className="flex items-center gap-3 rounded-2xl border border-line/70 bg-surface px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-soft text-sky">
            <Icon name="target" size={18} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] text-ink">距离考试</p>
            <p className="text-[11px] text-muted">
              {countdown >= 0 ? '按你的节奏，稳住每天的任务量' : '考试日期已过，记得更新'}
            </p>
          </div>
          <p className="tabular text-[18px] font-semibold text-accent">
            {countdown >= 0 ? countdown : 0}
            <span className="ml-0.5 text-[11px] font-normal text-muted">天</span>
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line/70 bg-surface px-4 py-3.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted">全库进度</span>
          <span className="tabular text-ink-soft">
            {learned} / {cards.length} 张
          </span>
        </div>
        <ProgressBar value={cards.length ? learned / cards.length : 0} className="mt-2.5" />
        <div className="mt-3.5 flex items-center justify-between text-[12px]">
          <span className="text-muted">新卡节奏</span>
          <span className="text-ink-soft">每天 {dailyNewLimit} 张</span>
        </div>
      </section>

      {plan.length > 0 ? (
        <section className="rounded-2xl border border-line/70 bg-surface px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium text-ink">今日安排</h2>
            <span className="text-[11px] text-muted">
              {pendingCards.length} 张 · {chapterCounts.size} 节
            </span>
          </div>
          <ul className="mt-2.5 flex flex-col gap-2">
            {plan.map(([chapterId, count]) => {
              const chapter = CHAPTER_MAP.get(chapterId)
              if (!chapter) return null
              const color = SUBJECT_MAP.get(chapter.subjectId)?.color ?? '#2e6b58'
              return (
                <li key={chapterId} className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 truncate text-[12.5px] text-ink-soft">
                    {chapter.title}
                  </span>
                  <span className="tabular text-[11px] text-muted">{count} 张</span>
                </li>
              )
            })}
            {chapterCounts.size > plan.length ? (
              <li className="pl-3.5 text-[11px] text-muted">
                还有 {chapterCounts.size - plan.length} 个章节…
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="flex gap-3 rounded-2xl border border-line/70 bg-surface px-4 py-3.5">
        <div className="mt-0.5 text-gold">
          <Icon name="sparkle" size={16} />
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">{tip}</p>
      </section>
    </div>
  )
}

function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
