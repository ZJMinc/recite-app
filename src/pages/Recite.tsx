import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addStudySeconds, commitReview, db } from '../db'
import { useSettings } from '../store/settings'
import { applyRating, type RatingKey } from '../scheduler'
import { Icon } from '../components/Icon'
import { ProgressBar } from '../components/ui'
import { CHAPTER_MAP, SUBJECT_MAP } from '../data/curriculum'
import {
  extractPoints,
  pickReciteCards,
  scoreCoverage,
  suggestRating,
  type CoverageResult,
} from '../lib/recite-core'
import type { CardRecord } from '../types'
import { isSpeechSupported, speak, stopSpeaking } from '../lib/speech'

type Phase = 'loading' | 'running' | 'empty' | 'done'

const DEFAULT_SIZE = 10

const RATING_LABEL: Record<RatingKey, string> = {
  1: '忘记',
  2: '模糊',
  3: '记住',
  4: '简单',
}

export function Recite() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { targetRetention, ttsEnabled } = useSettings()

  const chapterId = params.get('chapter') ?? undefined
  const sizeParam = Number(params.get('size') ?? '')
  const size = Number.isFinite(sizeParam) && sizeParam > 0 ? sizeParam : DEFAULT_SIZE

  const [phase, setPhase] = useState<Phase>('loading')
  const [queue, setQueue] = useState<CardRecord[]>([])
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<CoverageResult | null>(null)
  const [summary, setSummary] = useState({ answered: 0, sumCoverage: 0 })
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const current = queue[index]
  const points = useMemo(
    () => (current ? extractPoints(current.back) : []),
    [current],
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const all = await db.cards.toArray()
      const cards = pickReciteCards(all, { chapterId, size })
      if (!alive) return
      startedAt.current = Date.now()
      setQueue(cards)
      setIndex(0)
      setDraft('')
      setResult(null)
      setSummary({ answered: 0, sumCoverage: 0 })
      setPhase(cards.length > 0 ? 'running' : 'empty')
    })()
    return () => {
      alive = false
    }
  }, [chapterId, size])

  const ttsOn = Boolean(ttsEnabled) && isSpeechSupported()

  useEffect(() => {
    if (!ttsOn || !current) return
    speak(current.front || current.kp)
    return () => stopSpeaking()
  }, [ttsOn, current?.id])

  const submit = useCallback(() => {
    if (!current || result) return
    if (draft.trim().length === 0) return
    setResult(scoreCoverage(draft, points))
  }, [current, draft, points, result])

  const rate = useCallback(
    async (rating: RatingKey) => {
      if (!current || !result) return
      const prevState = current.state
      const { card: nextCard } = applyRating(current, rating, targetRetention)
      await commitReview(nextCard, rating, prevState)

      setSummary((s) => ({
        answered: s.answered + 1,
        sumCoverage: s.sumCoverage + result.coverage,
      }))

      if (index + 1 >= queue.length) {
        const seconds = (Date.now() - startedAt.current) / 1000
        await addStudySeconds(seconds)
        setElapsed(seconds)
        setPhase('done')
        return
      }
      setIndex((i) => i + 1)
      setDraft('')
      setResult(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [current, result, index, queue.length, targetRetention],
  )

  useEffect(() => {
    if (phase !== 'running') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (!result) submit()
        return
      }
      if (result && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        void rate(Number(e.key) as RatingKey)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, result, submit, rate])

  if (phase === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted">
        正在准备默写…
      </div>
    )
  }

  if (phase === 'empty') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="upload" size={28} />
        </div>
        <div>
          <p className="text-lg font-medium">还没有可默写的简答题</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            默写只取问答卡。当前章节没有这类卡片，换一章或去背卡片。
          </p>
        </div>
        <div className="flex w-full max-w-[280px] flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/browse')}
            className="rounded-2xl bg-accent py-3 text-[15px] font-medium text-white"
          >
            去知识树
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
    const avg = summary.answered > 0 ? summary.sumCoverage / summary.answered : 0
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-6 px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="check" size={36} />
          </div>
          <div>
            <h1 className="text-[22px] font-medium">默写完成</h1>
            <p className="mt-1 text-[13px] text-muted">
              输出式记忆比只读一遍牢固得多，写不出来才是真收获。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line/70 bg-surface px-2 py-4">
          <div className="text-center">
            <p className="tabular text-[20px] font-medium">{summary.answered}</p>
            <p className="mt-0.5 text-[11px] text-muted">道题</p>
          </div>
          <div className="border-x border-line/60 text-center">
            <p className="tabular text-[20px] font-medium">{Math.round(avg * 100)}%</p>
            <p className="mt-0.5 text-[11px] text-muted">平均覆盖</p>
          </div>
          <div className="text-center">
            <p className="tabular text-[20px] font-medium">
              {Math.max(1, Math.round(elapsed / 60))}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">分钟</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/recite')}
            className="rounded-2xl bg-accent py-3 text-[15px] font-medium text-white"
          >
            再默一组
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

  if (!current) return null

  const chapter = CHAPTER_MAP.get(current.chapterId)
  const subject = SUBJECT_MAP.get(current.subjectId)
  const suggested = result ? suggestRating(result.coverage) : null
  const progress = queue.length > 0 ? index / queue.length : 0

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          aria-label="退出默写"
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

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2">
        <div className="rounded-[22px] border border-line/80 bg-surface px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted">默写题目 · {current.kp}</p>
            {ttsOn ? (
              <button
                type="button"
                aria-label="朗读题目"
                onClick={() => speak(current.front || current.kp)}
                className="-mr-1 rounded-full p-1 text-muted hover:text-accent"
              >
                <Icon name="speaker" size={15} />
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[17px] font-medium leading-snug text-ink">
            {current.front}
          </p>
        </div>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          readOnly={result !== null}
          rows={6}
          autoFocus
          placeholder="不看答案，把要点写出来。写不出的地方留空，比翻答案更有用。"
          className="w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/70 focus:border-accent/50"
        />

        {result ? (
          <>
            <div className="animate-rise rounded-2xl border border-line/70 bg-surface px-4 py-3.5">
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] text-muted">
                  要点覆盖 · 命中 {result.hits.length}/{result.total}
                </p>
                <p className="tabular text-[20px] font-semibold text-accent">
                  {Math.round(result.coverage * 100)}%
                </p>
              </div>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {result.details.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                        d.hit ? 'bg-accent-soft text-accent' : 'bg-rose-soft text-rose'
                      }`}
                    >
                      {d.hit ? '✓' : '✗'}
                    </span>
                    <span className={d.hit ? 'text-ink-soft' : 'text-muted'}>
                      {d.point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-rise rounded-2xl border border-line/70 bg-paper/70 px-4 py-3.5">
              <p className="text-[11px] text-muted">标准答案</p>
              <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-ink">
                {current.back}
              </p>
            </div>
          </>
        ) : null}
      </div>

      <footer className="border-t border-line/60 bg-paper/90 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur">
        {result ? (
          <>
            <p className="mb-2 text-center text-[11.5px] text-muted">
              评这一档，决定下次复习间隔
              {suggested ? `（按覆盖率建议「${RATING_LABEL[suggested]}」）` : ''}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as RatingKey[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => void rate(r)}
                  className={[
                    'rounded-xl border py-2.5 text-[13px] transition-colors',
                    r === suggested
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line bg-surface text-ink-soft',
                  ].join(' ')}
                >
                  {RATING_LABEL[r]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={draft.trim().length === 0}
            onClick={submit}
            className="w-full rounded-2xl bg-accent py-3.5 text-[15px] font-medium text-white shadow-sm disabled:opacity-50"
          >
            提交并对照要点
          </button>
        )}
        <p className="mt-2 hidden text-center text-[10px] text-muted sm:block">
          ⌘/Ctrl + 回车提交 · 1–4 评分
        </p>
      </footer>
    </div>
  )
}
