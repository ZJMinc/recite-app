import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../db'
import { CardBody } from '../components/CardBody'
import { Icon } from '../components/Icon'
import { ProgressBar } from '../components/ui'
import { CHAPTER_MAP, SUBJECT_MAP } from '../data/curriculum'
import { isCorrect, pickQuizCards, recordAnswer } from '../lib/quiz'
import type { CardRecord } from '../types'

type Phase = 'loading' | 'running' | 'empty' | 'done'

interface Summary {
  total: number
  correct: number
  resolved: number
}

const EMPTY_SUMMARY: Summary = { total: 0, correct: 0, resolved: 0 }

export function Quiz() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const chapterId = params.get('chapter') ?? undefined
  const wrongOnly = params.get('wrong') === '1'
  const sizeParam = Number(params.get('size') ?? '')
  const size = Number.isFinite(sizeParam) && sizeParam > 0 ? sizeParam : undefined

  const [phase, setPhase] = useState<Phase>('loading')
  const [queue, setQueue] = useState<CardRecord[]>([])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | boolean | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [hint, setHint] = useState<string | null>(null)

  const current = queue[index]

  useEffect(() => {
    let alive = true
    setPhase('loading')
    void (async () => {
      const all = await db.cards.toArray()
      const onlyCardIds = wrongOnly
        ? new Set((await db.wrongs.toArray()).map((w) => w.cardId))
        : undefined
      const cards = pickQuizCards(all, { chapterId, onlyCardIds, size })
      if (!alive) return
      setQueue(cards)
      setIndex(0)
      setPicked(null)
      setRevealed(false)
      setSummary(EMPTY_SUMMARY)
      setHint(null)
      setPhase(cards.length > 0 ? 'running' : 'empty')
    })()
    return () => {
      alive = false
    }
  }, [chapterId, wrongOnly, size])

  const answer = useCallback(
    async (value: number | boolean) => {
      if (!current || revealed) return
      const ok = isCorrect(current, value)
      setPicked(value)
      setRevealed(true)
      const outcome = await recordAnswer(current.id, ok)
      setSummary((s) => ({
        total: s.total + 1,
        correct: s.correct + (ok ? 1 : 0),
        resolved: s.resolved + (outcome.resolved ? 1 : 0),
      }))
      if (!ok) setHint(`答错了，已加入错题本（累计 ${outcome.wrongCount} 次）`)
      else if (outcome.resolved) setHint('连续答对，已移出错题本')
      else if (outcome.wrongCount > 0) setHint(`还差 ${outcome.remaining} 次连对移出错题本`)
      else setHint(null)
    },
    [current, revealed],
  )

  const next = useCallback(() => {
    if (index + 1 >= queue.length) setPhase('done')
    else {
      setIndex((i) => i + 1)
      setPicked(null)
      setRevealed(false)
      setHint(null)
    }
  }, [index, queue.length])

  useEffect(() => {
    if (phase !== 'running' || !current) return
    const handler = (e: KeyboardEvent) => {
      if (revealed) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault()
          next()
        }
        return
      }
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1) {
        if (current.type === 'choice' && current.options && n <= current.options.length) {
          e.preventDefault()
          void answer(n - 1)
        } else if (current.type === 'judge' && (n === 1 || n === 2)) {
          e.preventDefault()
          void answer(n === 1)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, current, revealed, next, answer])

  const chapter = current ? CHAPTER_MAP.get(current.chapterId) : undefined
  const subject = current ? SUBJECT_MAP.get(current.subjectId) : undefined

  const accuracy = useMemo(
    () => (summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0),
    [summary],
  )

  if (phase === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted">
        正在组卷…
      </div>
    )
  }

  if (phase === 'empty') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="target" size={28} />
        </div>
        <div>
          <p className="text-lg font-medium">
            {wrongOnly ? '错题本是空的' : '这里还没有客观题'}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {wrongOnly
              ? '错题本只收录刷题时答错的卡片，答错后会自动进来。'
              : '刷题只取选择题和判断题。当前章节还没有这类卡片，可以先去背卡片，或换一个章节。'}
          </p>
        </div>
        <div className="flex w-full max-w-[280px] flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate(wrongOnly ? '/quiz' : '/browse')}
            className="rounded-2xl bg-accent py-3 text-[15px] font-medium text-white"
          >
            {wrongOnly ? '去刷题' : '去知识树'}
          </button>
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
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-6 px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="target" size={34} />
          </div>
          <div>
            <h1 className="text-[22px] font-medium">本轮刷完</h1>
            <p className="mt-1 text-[13px] text-muted">
              {accuracy >= 80
                ? '正确率不错，可以加量了。'
                : '错题会自动进错题本，练到连对两次才移出。'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line/70 bg-surface px-2 py-4">
          <div className="text-center">
            <p className="tabular text-[20px] font-medium">{summary.total}</p>
            <p className="mt-0.5 text-[11px] text-muted">道题</p>
          </div>
          <div className="border-x border-line/60 text-center">
            <p className="tabular text-[20px] font-medium">{accuracy}%</p>
            <p className="mt-0.5 text-[11px] text-muted">正确率</p>
          </div>
          <div className="text-center">
            <p className="tabular text-[20px] font-medium">{summary.resolved}</p>
            <p className="mt-0.5 text-[11px] text-muted">移出错题</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/quiz?wrong=1')}
            className="rounded-2xl bg-accent py-3 text-[15px] font-medium text-white"
          >
            去刷错题
          </button>
          <button
            type="button"
            onClick={() => navigate('/wrongs')}
            className="rounded-2xl border border-line bg-surface py-3 text-[15px] text-ink-soft"
          >
            打开错题本
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="py-1 text-[13px] text-muted"
          >
            回到今日
          </button>
        </div>
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
          aria-label="退出刷题"
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

      <div className="flex items-center justify-between px-4 pb-1 text-[11px] text-muted">
        <span>
          {subject?.title ?? ''}
          {chapter ? ` · ${chapter.title}` : ''}
        </span>
        {summary.total > 0 ? (
          <span className="tabular">正确率 {accuracy}%</span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2">
        <div className="my-auto rounded-[22px] border border-line/80 bg-surface px-5 py-5 shadow-[0_1px_2px_rgba(33,30,25,0.04),0_8px_24px_-16px_rgba(33,30,25,0.25)]">
          <CardBody
            key={current.id + index}
            card={current}
            revealed={revealed}
            picked={picked}
            onPick={(value) => void answer(value)}
          />
        </div>
      </div>

      <footer className="border-t border-line/60 bg-paper/90 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur">
        {revealed ? (
          <>
            {hint ? (
              <p className="mb-2 text-center text-[12px] text-rose">{hint}</p>
            ) : (
              <p className="mb-2 text-center text-[12px] text-accent-ink">
                回答正确
              </p>
            )}
            <button
              type="button"
              onClick={next}
              className="w-full rounded-2xl bg-accent py-3.5 text-[15px] font-medium text-white shadow-sm active:scale-[0.99]"
            >
              {index + 1 >= queue.length ? '查看结果' : '下一题'}
            </button>
          </>
        ) : (
          <p className="py-3 text-center text-[13px] text-muted">
            {current.type === 'choice' ? '选择一个答案' : '判断正误'}
          </p>
        )}
        <p className="mt-2 hidden text-center text-[10px] text-muted sm:block">
          {current.type === 'choice'
            ? `数字键 1–${current.options?.length ?? 0} 选择 · 回车下一题`
            : '1 正确 / 2 错误 · 回车下一题'}
        </p>
      </footer>
    </div>
  )
}
