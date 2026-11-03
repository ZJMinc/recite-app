import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { TypeBadge } from '../components/CardBody'
import { Icon } from '../components/Icon'
import { CHAPTER_MAP } from '../data/curriculum'
import {
  WRONG_CLEAR_STREAK,
  clearWrongs,
  loadWrongItems,
  removeWrong,
} from '../lib/quiz'

export function Wrongs() {
  const navigate = useNavigate()
  const items = useLiveQuery(() => loadWrongItems(), [])
  const [confirming, setConfirming] = useState(false)

  const list = items ?? []
  const chapterCount = new Set(list.map((i) => i.card?.chapterId)).size

  return (
    <div className="flex flex-col gap-4 pb-2">
      <header className="flex items-center gap-2 px-1 pt-1">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate(-1)}
          className="-ml-1 rounded-full p-1.5 text-muted hover:text-ink"
        >
          <Icon name="chevron" size={18} className="rotate-180" />
        </button>
        <div className="flex-1">
          <h1 className="text-[22px] font-semibold">错题本</h1>
          <p className="mt-0.5 text-[12px] text-muted">
            答错的题自动进来，连对 {WRONG_CLEAR_STREAK} 次才移出
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="check" size={28} />
          </div>
          <div>
            <p className="text-[15px] font-medium">错题本是空的</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              去刷几道题，答错的会自动收进来。
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/quiz')}
            className="rounded-2xl bg-accent px-6 py-2.5 text-[14px] font-medium text-white"
          >
            去刷题
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-1">
            <button
              type="button"
              onClick={() => navigate('/quiz?wrong=1')}
              className="flex-1 rounded-xl bg-accent py-2.5 text-[14px] font-medium text-white"
            >
              重练全部 {list.length} 道
            </button>
            <button
              type="button"
              onClick={() => setConfirming((v) => !v)}
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] text-ink-soft"
            >
              清空
            </button>
          </div>

          <p className="px-1 text-[11px] text-muted">
            {list.length} 道待清 · 涉及 {chapterCount} 个章节
          </p>

          {confirming ? (
            <div className="rounded-2xl border border-rose/30 bg-rose-soft/40 px-4 py-3">
              <p className="text-[12.5px] text-rose">
                会清空全部错题记录，学习进度不受影响。确定吗？
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void clearWrongs()
                    setConfirming(false)
                  }}
                  className="flex-1 rounded-xl bg-rose py-2 text-[13px] text-white"
                >
                  确定清空
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl border border-line py-2 text-[13px] text-ink-soft"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {list.map(({ record, card }) => {
              if (!card) return null
              const chapter = CHAPTER_MAP.get(card.chapterId)
              const streak = record.correctStreak
              return (
                <li
                  key={record.cardId}
                  className="rounded-2xl border border-line/70 bg-surface px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={card.type} />
                        <span className="truncate text-[11px] text-muted">
                          {chapter?.title ?? card.chapterId}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-snug text-ink">
                        {card.front || card.kp}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="移出错题本"
                      onClick={() => void removeWrong(record.cardId)}
                      className="shrink-0 rounded-full p-1.5 text-muted hover:text-rose"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                    <span className="text-rose">错 {record.wrongCount} 次</span>
                    <span className="flex items-center gap-1">
                      连对
                      <span className="flex gap-0.5">
                        {Array.from({ length: WRONG_CLEAR_STREAK }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-1.5 w-4 rounded-full ${
                              i < streak ? 'bg-accent' : 'bg-line'
                            }`}
                          />
                        ))}
                      </span>
                      {streak}/{WRONG_CLEAR_STREAK}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
