import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, resetAll, todayKey } from '../db'
import { useSettings } from '../store/settings'
import { Icon } from '../components/Icon'
import { SEED_CARDS } from '../data/seed'

const RETENTIONS = [
  { value: 0.85, label: '轻松 85%' },
  { value: 0.9, label: '标准 90%' },
  { value: 0.95, label: '牢固 95%' },
]

export function Settings() {
  const settings = useSettings()
  const cards = useLiveQuery(() => db.cards.count(), [])
  const reviews = useLiveQuery(() => db.reviews.count(), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const flash = (text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(null), 2400)
  }

  const exportBackup = async () => {
    const [allCards, daily, allReviews] = await Promise.all([
      db.cards.toArray(),
      db.daily.toArray(),
      db.reviews.toArray(),
    ])
    const payload = {
      app: 'jiaojibei',
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: allCards,
      daily,
      reviews: allReviews,
      settings: {
        dailyNewLimit: settings.dailyNewLimit,
        targetRetention: settings.targetRetention,
        examDate: settings.examDate,
      },
    }
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `教基背诵-备份-${todayKey()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    flash('备份已导出')
  }

  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data.cards) || data.cards.length === 0) {
        throw new Error('文件里没有卡片数据')
      }
      await db.transaction('rw', db.cards, db.reviews, db.daily, async () => {
        await db.cards.clear()
        await db.reviews.clear()
        await db.daily.clear()
        await db.cards.bulkAdd(data.cards)
        if (Array.isArray(data.reviews)) await db.reviews.bulkAdd(data.reviews)
        if (Array.isArray(data.daily)) await db.daily.bulkAdd(data.daily)
      })
      if (data.settings) settings.update(data.settings)
      flash(`已恢复 ${data.cards.length} 张卡片`)
    } catch {
      flash('导入失败，请检查备份文件')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doReset = async () => {
    await resetAll()
    setConfirming(false)
    flash('已重置为初始状态')
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <header className="px-1 pt-1">
        <h1 className="text-[22px] font-semibold">设置</h1>
        <p className="mt-1 text-[12px] text-muted">数据保存在本机浏览器，建议定期备份</p>
      </header>

      {/* 学习计划 */}
      <section className="rounded-2xl border border-line/70 bg-surface">
        <SectionTitle title="学习计划" />
        <div className="divide-y divide-line/60">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[13.5px] text-ink">每日新卡</p>
              <p className="mt-0.5 text-[11px] text-muted">背完自动进入间隔重复</p>
            </div>
            <div className="flex items-center gap-3">
              <RoundButton
                label="减少新卡"
                onClick={() =>
                  settings.update({
                    dailyNewLimit: Math.max(5, settings.dailyNewLimit - 5),
                  })
                }
              >
                −
              </RoundButton>
              <span className="tabular w-8 text-center text-[16px] font-medium">
                {settings.dailyNewLimit}
              </span>
              <RoundButton
                label="增加新卡"
                onClick={() =>
                  settings.update({
                    dailyNewLimit: Math.min(60, settings.dailyNewLimit + 5),
                  })
                }
              >
                +
              </RoundButton>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-[13.5px] text-ink">考试日期</p>
              <p className="mt-0.5 text-[11px] text-muted">用于首页倒计时</p>
            </div>
            <input
              type="date"
              value={settings.examDate ?? ''}
              onChange={(e) =>
                settings.update({ examDate: e.target.value || undefined })
              }
              className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink-soft outline-none"
            />
          </div>

          <div className="px-4 py-3">
            <p className="text-[13.5px] text-ink">目标记忆率</p>
            <p className="mt-0.5 text-[11px] text-muted">
              越高越牢固，但复习频率也越高
            </p>
            <div className="mt-2.5 flex gap-1.5">
              {RETENTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => settings.update({ targetRetention: r.value })}
                  className={[
                    'flex-1 rounded-xl border px-1 py-2 text-[11.5px] transition-colors',
                    settings.targetRetention === r.value
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line text-muted',
                  ].join(' ')}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 数据 */}
      <section className="rounded-2xl border border-line/70 bg-surface">
        <SectionTitle title="数据" />
        <div className="divide-y divide-line/60">
          <Row
            icon="download"
            title="导出备份"
            desc={`${cards ?? 0} 张卡片 · ${reviews ?? 0} 条复习记录`}
            onClick={() => void exportBackup()}
          />
          <Row
            icon="upload"
            title="导入备份"
            desc="从 JSON 文件恢复，会覆盖现有数据"
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importBackup(file)
            }}
          />
          {confirming ? (
            <div className="px-4 py-3">
              <p className="text-[12.5px] text-rose">
                会清空全部学习进度并恢复初始卡片，确定吗？
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void doReset()}
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
          ) : (
            <Row
              icon="trash"
              title="重置学习进度"
              desc="不可撤销，建议先导出备份"
              danger
              onClick={() => setConfirming(true)}
            />
          )}
        </div>
      </section>

      {/* 关于 */}
      <section className="rounded-2xl border border-line/70 bg-surface">
        <SectionTitle title="关于" />
        <div className="px-4 pb-4 pt-1">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            教基背诵 v0.1 · 内置 {SEED_CARDS.length} 张精编卡片，覆盖教育学、教育心理学、心理学基础、法规、师德与新课改。
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            采用 FSRS 间隔重复算法 + 主动回忆 + 挖空/口诀/易混辨析。数据仅存于本机
            IndexedDB，不上传任何服务器。
          </p>
        </div>
      </section>

      {notice ? (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center">
          <p className="animate-rise rounded-full bg-ink px-4 py-2 text-[12px] text-paper shadow-lg">
            {notice}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="px-4 pb-1.5 pt-3.5 text-[11px] font-medium tracking-wide text-muted">
      {title}
    </p>
  )
}

function RoundButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[15px] leading-none text-ink-soft active:bg-line/50"
    >
      {children}
    </button>
  )
}

function Row({
  icon,
  title,
  desc,
  onClick,
  danger = false,
}: {
  icon: 'download' | 'upload' | 'trash'
  title: string
  desc: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          danger ? 'bg-rose-soft text-rose' : 'bg-accent-soft text-accent'
        }`}
      >
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13.5px] ${danger ? 'text-rose' : 'text-ink'}`}
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{desc}</span>
      </span>
      <span className="text-muted">
        <Icon name="chevron" size={15} />
      </span>
    </button>
  )
}
