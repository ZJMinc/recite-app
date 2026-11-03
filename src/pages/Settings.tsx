import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, resetAll, todayKey } from '../db'
import { useSettings } from '../store/settings'
import { Icon } from '../components/Icon'
import { BUILTIN_CARD_COUNT } from '../data/seed'
import { clearConfig, loadConfig, saveConfig, syncNow } from '../sync'
import { THEME_OPTIONS } from '../lib/theme'
import { isSpeechSupported } from '../lib/speech'

// 自建后端的默认值，仅用于预填输入框。放在 .env.local（已 gitignore）里，
// 避免把个人地址写进公开仓库；没有配置时留空，用户在界面上填。
const DEFAULT_BASE_URL = import.meta.env.VITE_SYNC_BASE_URL ?? ''
const DEFAULT_EMAIL = import.meta.env.VITE_SYNC_EMAIL ?? ''

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

      {/* 外观与听背 */}
      <section className="rounded-2xl border border-line/70 bg-surface">
        <SectionTitle title="外观" />
        <div className="px-4 pb-4">
          <div className="flex gap-1.5">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => settings.update({ theme: opt.value })}
                className={[
                  'flex-1 rounded-xl border px-1 py-2 text-[11.5px] transition-colors',
                  (settings.theme ?? 'auto') === opt.value
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line text-muted',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink">听背（朗读卡片）</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">
                {isSpeechSupported()
                  ? '进入新卡时自动读题，通勤时可以不看屏幕'
                  : '当前浏览器不支持语音合成，此开关无效'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings.ttsEnabled) && isSpeechSupported()}
              disabled={!isSpeechSupported()}
              onClick={() => settings.update({ ttsEnabled: !settings.ttsEnabled })}
              className={[
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                Boolean(settings.ttsEnabled) && isSpeechSupported()
                  ? 'bg-accent'
                  : 'bg-line',
                isSpeechSupported() ? '' : 'opacity-40',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-[left]',
                  Boolean(settings.ttsEnabled) && isSpeechSupported()
                    ? 'left-[22px]'
                    : 'left-0.5',
                ].join(' ')}
              />
            </button>
          </div>
        </div>
      </section>

      {/* 多端同步 */}
      <SyncSection />

      {/* 关于 */}
      <section className="rounded-2xl border border-line/70 bg-surface">
        <SectionTitle title="关于" />
        <div className="px-4 pb-4 pt-1">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            教基背诵 v0.1 · 内置 {BUILTIN_CARD_COUNT} 张精编卡片，覆盖教育学、教育心理学、心理学基础、法规、师德与新课改。
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            采用 FSRS 间隔重复算法 + 主动回忆 + 挖空/口诀/易混辨析。默认只存于本机
            IndexedDB；开启「多端同步」后，学习进度会上传到你自己部署的服务器。
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

function SyncSection() {
  const [initial] = useState(() => loadConfig())
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? DEFAULT_BASE_URL)
  const [email, setEmail] = useState(initial?.email ?? DEFAULT_EMAIL)
  const [password, setPassword] = useState('')
  const [connected, setConnected] = useState(initial !== null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const connect = async () => {
    if (!baseUrl.trim() || !email.trim() || !password) {
      setMessage('服务地址、邮箱、密码都要填')
      return
    }
    setBusy(true)
    setMessage(null)
    const config = { baseUrl: baseUrl.trim(), email: email.trim(), password }
    saveConfig(config)
    try {
      const result = await syncNow(config)
      setConnected(true)
      setPassword('')
      setMessage(
        `已连接 · 推送 ${result.pushedReviews} 条复习、${result.pushedStates} 张状态；拉取 ${result.pulledReviews} 条复习、${result.pulledStates} 张状态`,
      )
    } catch (error) {
      setConnected(false)
      setMessage(`连接失败：${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = () => {
    clearConfig()
    setConnected(false)
    setPassword('')
    setMessage('已断开，本机学习数据保留')
  }

  return (
    <section className="rounded-2xl border border-line/70 bg-surface">
      <SectionTitle title="多端同步" />
      <div className="px-4 pb-4">
        <p className="text-[11px] leading-relaxed text-muted">
          连上你自己部署的服务器后，多台设备共用一份进度；离线照常背诵，联网后自动合并。
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <SyncField
            label="地址"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://your-host.ts.net"
          />
          <SyncField
            label="邮箱"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
          <SyncField
            label="密码"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void connect()}
            className="flex-1 rounded-xl bg-accent py-2 text-[13px] text-white disabled:opacity-60"
          >
            {busy ? '连接中…' : connected ? '保存并同步' : '连接并同步'}
          </button>
          {connected ? (
            <button
              type="button"
              onClick={disconnect}
              className="rounded-xl border border-line px-3 py-2 text-[13px] text-ink-soft"
            >
              断开
            </button>
          ) : null}
        </div>
        {message ? (
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">{message}</p>
        ) : connected ? (
          <p className="mt-2 text-[11.5px] text-muted">
            已连接，后台每 5 分钟自动同步一次
          </p>
        ) : null}
      </div>
    </section>
  )
}

function SyncField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[12px] text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink-soft outline-none"
      />
    </label>
  )
}
