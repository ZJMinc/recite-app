import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addStudySeconds, commitReview, db, todayKey } from '../db'
import { useSettings } from '../store/settings'
import { applyRating, previewIntervals, type RatingKey } from '../scheduler'
import type { CardRecord } from '../types'
import { CardBody } from '../components/CardBody'
import { ProgressBar, RatingBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { CHAPTER_MAP, SUBJECT_MAP } from '../data/curriculum'
import { formatDuration } from '../lib/stats'

const EXTRA_NEW = 10
const MAX_REPEAT = 2

type Phase = 'loading' | 'reviewing' | 'empty' | 'done'

export function Review() {
  const navigate = useNavigate()
  const { dailyNewLimit, targetRetention } = useSettings()

  const [phase, setPhase] = useState<Phase>('loading')
  const [queue, setQueue] = useState<CardRecord[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<number | boolean | null>(null)
  const [hasMoreNew, setHasMoreNew] = useState(false)
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 })
  const [newLearned, setNewLearned] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const startedAt = useRef(Date.now())
  const repeatCount = useRef<Record<string, number>>({})

  const current = queue[index]

  // 评分按钮上的“下次间隔”，随卡片变化重新计算一次，避免渲染抖动
  const intervals = useMemo(
    () => (current ? previewIntervals(current, targetRetention) : null),
    [current, targetRetention],
  )

  const loadQueue = useCallback(
    async (extraNew = 0) => {
      setPhase('loading')
      const now = Date.now()
      const all = await db.cards.toArray()
      const today = await db.daily.get(todayKey())
      const usedNew = today?.newCount ?? 0
      const newAllowance = Math.max(0, dailyNewLimit - usedNew) + extraNew

      const due = all
        .filter((c) => c.state !== 0 && c.due <= now)
        .sort((a, b) => a.due - b.due)
      const freshAll = all
        .filter((c) => c.state === 0)
        .sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
      const fresh = freshAll.slice(0, newAllowance)

      setHasMoreNew(freshAll.length > fresh.length)
      repeatCount.current = {}
      setCounts({ again: 0, hard: 0, good: 0, easy: 0 })
      setNewLearned(0)
      setIndex(0)
      setRevealed(false)
      setPicked(null)
      startedAt.current = Date.now()

      if (due.length + fresh.length === 0) {
        setQueue([])
        setPhase('empty')
        return
      }
      setQueue([...due, ...fresh])
      setPhase('reviewing')
    },
    [dailyNewLimit],
  )

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const finish = useCallback(async () => {
    const seconds = (Date.now() - startedAt.current) / 1000
    await addStudySeconds(seconds)
    setElapsed(seconds)
    setPhase('done')
  }, [])

  const handleRate = useCallback(
    async (rating: RatingKey) => {
      if (!current) return
      const prevState = current.state
      const { card: nextCard } = applyRating(current, rating, targetRetention)
      await commitReview(nextCard, rating, prevState)

      setCounts((c) => ({
        ...c,
        again: c.again + (rating === 1 ? 1 : 0),
        hard: c.hard + (rating === 2 ? 1 : 0),
        good: c.good + (rating === 3 ? 1 : 0),
        easy: c.easy + (rating === 4 ? 1 : 0),
      }))
      if (prevState === 0) setNewLearned((n) => n + 1)

      let nextQueue = queue
      if (rating === 1) {
        const repeats = repeatCount.current[current.id] ?? 0
        if (repeats < MAX_REPEAT) {
          repeatCount.current[current.id] = repeats + 1
          nextQueue = [...queue, nextCard]
        }
      }
      setQueue(nextQueue)

      if (index + 1 >= nextQueue.length) {
        await finish()
      } else {
        setIndex((i) => i + 1)
        setRevealed(false)
        setPicked(null)
      }
    },
    [current, queue, index, targetRetention, finish],
  )

  const reveal = useCallback(() => setRevealed(true), [])

  const onPick = useCallback((value: number | boolean) => {
    setPicked(value)
    setRevealed(true)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== 'reviewing') return
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (!revealed) reveal()
        return
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        void handleRate(Number(e.key) as RatingKey)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, revealed, reveal, handleRate])

  const chapter = current ? CHAPTER_MAP.get(current.chapterId) : undefined
  const subject = current ? SUBJECT_MAP.get(current.subjectId) : undefined

  if (phase === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted">
        正在准备今日卡片…
      </div>
    )
  }

  if (phase === 'empty') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="check" size={30} />
        </div>
        <div>
          <p className="text-lg font-medium">今日任务已清空</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            没有到期复习，也没有剩余新卡。
            {hasMoreNew ? '想多背一点，可以再加学一组。' : '明天再来，间隔重复会安排新的复习。'}
          </p>
        </div>
        <div className="flex w-full max-w-[280px] flex-col gap-2.5">
          {hasMoreNew ? (
            <button
              type="button"
              onClick={() => void loadQueue(EXTRA_NEW)}
              className="rounded-2xl bg-accent py-3 text-[15px] font-medium text-white"
            >
              加学 {EXTRA_NEW} 张新卡
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-2xl border border-line bg-surface py-3 text-[15px] text-ink-soft"
          >
            回到今日
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const total = counts.again + counts.hard + counts.good + counts.easy
    const recallRate = total > 0 ? (counts.good + counts.easy) / total : 0
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-6 px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="check" size={36} />
          </div>
          <div>
            <h1 className="text-[22px] font-medium">这一轮背完了</h1>
            <p className="mt-1 text-[13px] text-muted">
              每一次主动回忆，都在加固记忆痕迹。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line/70 bg-surface px-2 py-4">
          <div className="text-center">
            <p className="tabular text-[20px] font-medium">{total}</p>
            <p className="mt-0.5 text-[11px] text-muted">张卡片</p>
          </div>
          <div className="border-x border-line/60 text-center">
            <p className="tabular text-[20px] font-medium">
              {Math.round(recallRate * 100)}%
            </p>
            <p className="mt-0.5 text-[11px] text-muted">记得率</p>
          </div>
          <div className="text-center">
            <p className="tabular text-[20px] font-medium">{formatDuration(elapsed)}</p>
            <p className="mt-0.5 text-[11px] text-muted">用时</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void loadQueue()}
            className="rounded-2xl bg-accent py-3 text-[15px] font-medium text-white"
          >
            再来一轮
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-2xl border border-line bg-surface py-3 text-[15px] text-ink-soft"
          >
            回到今日
          </button>
        </div>
        <p className="text-center text-[11px] text-muted">
          本轮新学 {newLearned} 张 · 忘记 {counts.again} 张
        </p>
      </div>
    )
  }

  if (!current) return null

  const progress = queue.length > 0 ? index / queue.length : 0

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          aria-label="退出背诵"
          onClick={() => navigate('/')}
          className="-ml-1 rounded-full p-1.5 text-muted hover:text-ink"
        >
          <Icon name="x" size={20} />
        </button>
        <div className="flex-1">
          <ProgressBar value={progress} />
        </div>
        <span className="tabular text-[12px] text-muted">
          {index + 1}/{queue.length}
        </span>
      </header>

      <div className="px-4 pb-1 text-[11px] text-muted">
        {subject?.title ?? ''}
        {chapter ? ` · ${chapter.title}` : ''}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2">
        <div className="my-auto rounded-[22px] border border-line/80 bg-surface px-5 py-5 shadow-[0_1px_2px_rgba(33,30,25,0.04),0_8px_24px_-16px_rgba(33,30,25,0.25)]">
          <CardBody
            key={current.id + index}
            card={current}
            revealed={revealed}
            picked={picked}
            onPick={onPick}
          />
        </div>
      </div>

      <footer className="border-t border-line/60 bg-paper/90 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur">
        {revealed && intervals ? (
          <RatingBar intervals={intervals} onRate={(r) => void handleRate(r)} />
        ) : (
          <button
            type="button"
            onClick={reveal}
            className="w-full rounded-2xl bg-accent py-3.5 text-[15px] font-medium text-white shadow-sm active:scale-[0.99]"
          >
            显示答案
          </button>
        )}
        <p className="mt-2 hidden text-center text-[10px] text-muted sm:block">
          空格显示答案 · 1 忘记 / 2 模糊 / 3 记住 / 4 简单
        </p>
      </footer>
    </div>
  )
}
