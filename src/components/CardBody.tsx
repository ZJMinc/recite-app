import type { CardRecord } from '../types'

export function ClozeText({
  text,
  revealed,
  className = '',
}: {
  text: string
  revealed: boolean
  className?: string
}) {
  const parts = text.split(/(\{\{[\s\S]*?\}\})/g)
  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('{{') && part.endsWith('}}')) {
          const answer = part.slice(2, -2)
          return revealed ? (
            <span key={i} className="cloze-answer">
              {answer}
            </span>
          ) : (
            <span key={i} className="cloze-blank">
              {answer}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}

const TYPE_LABEL: Record<CardRecord['type'], string> = {
  cloze: '挖空',
  qa: '问答',
  choice: '选择',
  judge: '判断',
}

export function TypeBadge({ type }: { type: CardRecord['type'] }) {
  return (
    <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] tracking-wide text-muted">
      {TYPE_LABEL[type]}
    </span>
  )
}

interface CardBodyProps {
  card: CardRecord
  revealed: boolean
  picked?: number | boolean | null
  onPick?: (value: number | boolean) => void
}

export function CardBody({ card, revealed, picked, onPick }: CardBodyProps) {
  const isChoice = card.type === 'choice' && card.options?.length
  const isJudge = card.type === 'judge'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <TypeBadge type={card.type} />
        <span className="text-[11px] text-muted">{card.kp}</span>
      </div>

      {/* 题干 / 挖空正文 */}
      {card.type === 'cloze' ? (
        <div className="card-body text-[18px] text-ink">
          {card.front ? (
            <p className="mb-2 text-[13px] text-muted">{card.front}</p>
          ) : null}
          <ClozeText text={card.back} revealed={revealed} className="card-body text-[18px]" />
        </div>
      ) : (
        <p className="card-body text-[19px] font-medium text-ink">{card.front}</p>
      )}

      {/* 选择题选项 */}
      {isChoice && card.options ? (
        <ul className="flex flex-col gap-2">
          {card.options.map((opt, i) => {
            const isAnswer = card.answer === i
            const isPicked = picked === i
            let cls =
              'border-line bg-surface text-ink-soft hover:border-accent/40'
            if (revealed) {
              if (isAnswer) cls = 'border-accent bg-accent-soft text-accent-ink'
              else if (isPicked) cls = 'border-rose/50 bg-rose-soft text-rose'
              else cls = 'border-line bg-surface text-muted'
            }
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={revealed}
                  onClick={() => onPick?.(i)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[15px] transition-colors ${cls}`}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {/* 判断题 */}
      {isJudge ? (
        <div className="flex gap-3">
          {[true, false].map((val) => {
            const isAnswer = card.answer === val
            const isPicked = picked === val
            let cls = 'border-line bg-surface text-ink-soft'
            if (revealed) {
              if (isAnswer) cls = 'border-accent bg-accent-soft text-accent-ink'
              else if (isPicked) cls = 'border-rose/50 bg-rose-soft text-rose'
              else cls = 'border-line bg-surface text-muted'
            }
            return (
              <button
                key={String(val)}
                type="button"
                disabled={revealed}
                onClick={() => onPick?.(val)}
                className={`flex-1 rounded-xl border px-4 py-3 text-[15px] transition-colors ${cls}`}
              >
                {val ? '正确' : '错误'}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* 答案区 */}
      {revealed && card.type !== 'cloze' ? (
        <div className="animate-rise rounded-2xl border border-line/70 bg-paper/70 px-4 py-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-1 w-1 rounded-full bg-accent" />
            答案
          </div>
          <p className="card-body whitespace-pre-line text-[16.5px] text-ink">
            {card.type === 'choice'
              ? `正确答案：${String.fromCharCode(65 + Number(card.answer))}`
              : card.back}
          </p>
        </div>
      ) : null}

      {revealed && card.analysis ? (
        <div className="animate-rise rounded-xl bg-sky-soft/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-sky-">
          <span className="font-medium">解析 · </span>
          {card.analysis}
        </div>
      ) : null}

      {revealed && card.mnemonic ? (
        <div className="animate-rise rounded-xl border border-gold/25 bg-gold-soft/70 px-3.5 py-3 text-[13.5px] leading-relaxed text-gold">
          <span className="font-medium">记忆钩子 · </span>
          {card.mnemonic}
        </div>
      ) : null}

      {revealed && card.confusables ? (
        <div className="animate-rise rounded-xl border border-rose/20 bg-rose-soft/50 px-3.5 py-3 text-[13.5px] leading-relaxed text-rose">
          <span className="font-medium">易混提醒 · </span>
          {card.confusables}
        </div>
      ) : null}
    </div>
  )
}
