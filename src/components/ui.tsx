import { RATING_META, type RatingKey } from '../scheduler'

const STYLE: Record<RatingKey, string> = {
  1: 'border-rose/30 bg-rose-soft/60 text-rose active:bg-rose-soft',
  2: 'border-gold/30 bg-gold-soft/60 text-gold active:bg-gold-soft',
  3: 'border-accent/30 bg-accent-soft/80 text-accent-ink active:bg-accent-soft',
  4: 'border-sky/25 bg-sky-soft/60 text-sky active:bg-sky-soft',
}

export function RatingBar({
  intervals,
  onRate,
}: {
  intervals: Record<RatingKey, string>
  onRate: (rating: RatingKey) => void
}) {
  const order: RatingKey[] = [1, 2, 3, 4]
  return (
    <div className="grid grid-cols-4 gap-2">
      {order.map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onRate(rating)}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 py-2.5 transition-transform active:scale-[0.97] ${STYLE[rating]}`}
        >
          <span className="text-[14px] font-medium">{RATING_META[rating].label}</span>
          <span className="text-[10px] opacity-70">{intervals[rating]}</span>
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({
  value,
  className = '',
}: {
  value: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line/70 ${className}`}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function MasteryBar({
  value,
  color = '#2e6b58',
}: {
  value: number
  color?: string
}) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line/60">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}
