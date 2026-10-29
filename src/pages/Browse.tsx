import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { CHAPTER_MAP, SUBJECTS, chaptersOf } from '../data/curriculum'
import type { CardRecord, SubjectId } from '../types'
import { CardBody, TypeBadge } from '../components/CardBody'
import { MasteryBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { averageMastery, isLearned } from '../lib/stats'

export function Browse() {
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const [openSubjects, setOpenSubjects] = useState<Set<SubjectId>>(
    () => new Set<SubjectId>(['pedagogy']),
  )
  const [openChapter, setOpenChapter] = useState<string | null>(null)
  const [detail, setDetail] = useState<CardRecord | null>(null)
  const [query, setQuery] = useState('')

  const byChapter = useMemo(() => {
    const map = new Map<string, CardRecord[]>()
    for (const c of cards ?? []) {
      const list = map.get(c.chapterId) ?? []
      list.push(c)
      map.set(c.chapterId, list)
    }
    return map
  }, [cards])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q || !cards) return []
    return cards.filter(
      (c) =>
        c.kp.includes(q) ||
        c.front.includes(q) ||
        c.back.includes(q) ||
        (CHAPTER_MAP.get(c.chapterId)?.title.includes(q) ?? false),
    )
  }, [cards, query])

  if (!cards) {
    return <div className="pt-16 text-center text-sm text-muted">载入中…</div>
  }

  const total = cards.length
  const learned = cards.filter(isLearned).length

  const toggleSubject = (id: SubjectId) => {
    setOpenSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setOpenChapter(null)
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-semibold">知识树</h1>
        <p className="mt-1 text-[12px] text-muted">
          6 个板块 · {total} 张卡片 · 已学 {learned} 张
        </p>
      </header>

      <div className="flex items-center gap-2 rounded-2xl border border-line/80 bg-surface px-3.5 py-2.5">
        <Icon name="search" size={17} className="text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜知识点、题干、关键词…"
          className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} className="text-muted">
            <Icon name="x" size={16} />
          </button>
        ) : null}
      </div>

      {query.trim() ? (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-[11px] text-muted">找到 {results.length} 张</p>
          {results.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setDetail(card)}
              className="flex flex-col gap-1 rounded-xl border border-line/70 bg-surface px-3.5 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <TypeBadge type={card.type} />
                <span className="text-[11px] text-muted">
                  {CHAPTER_MAP.get(card.chapterId)?.title}
                </span>
              </div>
              <p className="line-clamp-2 text-[13.5px] leading-snug text-ink">
                {card.kp}
              </p>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">没有找到，换个关键词试试</p>
          ) : null}
        </section>
      ) : (
        <div className="flex flex-col gap-2.5">
          {SUBJECTS.map((subject) => {
            const chapters = chaptersOf(subject.id)
            const subjectCards = chapters.flatMap((ch) => byChapter.get(ch.id) ?? [])
            const open = openSubjects.has(subject.id)
            const subjectLearned = subjectCards.filter(isLearned).length
            return (
              <section
                key={subject.id}
                className="overflow-hidden rounded-2xl border border-line/70 bg-surface"
              >
                <button
                  type="button"
                  onClick={() => toggleSubject(subject.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] font-medium text-ink">{subject.title}</span>
                      <span className="tabular text-[11px] text-muted">
                        {subjectLearned}/{subjectCards.length}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {subject.desc}
                    </span>
                  </span>
                  <span
                    className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`}
                  >
                    <Icon name="chevron" size={16} />
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-line/60 px-2 pb-2 pt-1">
                    {chapters.map((ch) => {
                      const list = byChapter.get(ch.id) ?? []
                      const mastery = averageMastery(list)
                      const isOpen = openChapter === ch.id
                      return (
                        <div key={ch.id}>
                          <button
                            type="button"
                            onClick={() => setOpenChapter(isOpen ? null : ch.id)}
                            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-paper/70"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[13.5px] text-ink-soft">
                                  {ch.title}
                                </span>
                                <span className="tabular shrink-0 text-[11px] text-muted">
                                  {list.length} 张
                                </span>
                              </span>
                              <MasteryBar value={mastery} color={subject.color} />
                            </span>
                          </button>
                          {isOpen ? (
                            <div className="ml-2 flex flex-col gap-0.5 pb-2 pl-2">
                              {list.length === 0 ? (
                                <p className="py-2 text-[11.5px] text-muted">本节卡片待补充</p>
                              ) : (
                                list.map((card) => (
                                  <button
                                    key={card.id}
                                    type="button"
                                    onClick={() => setDetail(card)}
                                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-paper/80"
                                  >
                                    <span
                                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor:
                                          card.reps === 0 ? '#d8d0bf' : subject.color,
                                      }}
                                    />
                                    <span className="line-clamp-1 flex-1 text-[12.5px] text-ink-soft">
                                      {card.kp}
                                    </span>
                                    <TypeBadge type={card.type} />
                                  </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}

      {detail ? (
        <CardSheet card={detail} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  )
}

function CardSheet({ card, onClose }: { card: CardRecord; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false)
  const chapter = CHAPTER_MAP.get(card.chapterId)
  const subject = SUBJECTS.find((s) => s.id === card.subjectId)

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
      />
      <div className="animate-rise relative z-10 max-h-[86dvh] w-full max-w-[600px] overflow-y-auto rounded-t-[26px] border-t border-line bg-paper px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted">
            {subject?.title} · {chapter?.title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted hover:text-ink"
            aria-label="关闭"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="rounded-2xl border border-line/80 bg-surface px-4 py-4">
          <CardBody card={card} revealed={revealed} />
        </div>

        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="mt-3 w-full rounded-2xl border border-line bg-surface py-3 text-[14px] text-ink-soft"
        >
          {revealed ? '先自己回忆一遍' : '展开答案'}
        </button>
      </div>
    </div>
  )
}
