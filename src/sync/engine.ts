import { db, makeNewCard } from '../db'
import { useSettings } from '../store/settings'
import type { CardRecord, ReviewRecord, SeedCard } from '../types'
import {
  SyncClient,
  type RemoteCard,
  type RemoteReview,
  type RemoteSettings,
  type RemoteState,
} from './client'
import { loadConfig, type SyncConfig } from './config'
import {
  localDateKey,
  recomputeDaily,
  shouldTakeRemoteState,
  stateVersion,
  unionReviews,
} from './merge'

/** 游标存在 syncMeta 表里，全部是单调递增的水位线 */
const CURSOR = {
  reviewPush: 'cursor.review.push',
  statePush: 'cursor.state.push',
  contentPull: 'cursor.content.pull',
  statePull: 'cursor.state.pull',
  reviewPull: 'cursor.review.pull',
  settingsUpdated: 'cursor.settings.updated',
  device: 'meta.device',
} as const

export interface SyncResult {
  pushedReviews: number
  pushedStates: number
  pulledReviews: number
  pulledStates: number
  pulledCards: number
  settings: 'pushed' | 'pulled' | 'unchanged'
  at: number
}

async function getCursor(key: string): Promise<number> {
  const row = await db.syncMeta.get(key)
  return row ? Number(row.value) || 0 : 0
}

async function setCursor(key: string, value: number): Promise<void> {
  await db.syncMeta.put({ key, value: String(value) })
}

async function deviceId(): Promise<string> {
  const row = await db.syncMeta.get(CURSOR.device)
  if (row?.value) return row.value
  const id = Math.random().toString(36).slice(2, 8)
  await db.syncMeta.put({ key: CURSOR.device, value: id })
  return id
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function seedFromRemote(remote: RemoteCard): SeedCard {
  return {
    id: remote.card_id,
    subjectId: remote.subject_id as SeedCard['subjectId'],
    chapterId: remote.chapter_id,
    kp: remote.kp,
    type: remote.type as SeedCard['type'],
    front: remote.front ?? '',
    back: remote.back,
    options: Array.isArray(remote.options) ? (remote.options as string[]) : undefined,
    answer:
      typeof remote.answer === 'number' || typeof remote.answer === 'boolean'
        ? (remote.answer as number | boolean)
        : undefined,
    analysis: remote.analysis,
    mnemonic: remote.mnemonic,
    confusables: remote.confusables,
    importance: (remote.importance && remote.importance >= 1
      ? remote.importance
      : 3) as 1 | 2 | 3 | 4 | 5,
    tags: Array.isArray(remote.tags) ? (remote.tags as string[]) : [],
  }
}

/** 内容以服务端为准，学习进度（FSRS 状态）以本地为准 */
async function pullCards(client: SyncClient): Promise<number> {
  const since = await getCursor(CURSOR.contentPull)
  const remote = await client.listAll<RemoteCard>('cards', {
    filter: `content_ver > ${since}`,
    sort: 'content_ver',
    perPage: 200,
  })
  if (remote.length === 0) return 0

  let maxVer = since
  for (const item of remote) {
    maxVer = Math.max(maxVer, item.content_ver)
    const local = await db.cards.get(item.card_id)
    if (item.deleted) {
      if (local) await db.cards.delete(item.card_id)
      continue
    }
    const seed = seedFromRemote(item)
    if (local) {
      await db.cards.put({ ...local, ...seed })
    } else {
      await db.cards.put(makeNewCard(seed))
    }
  }
  await setCursor(CURSOR.contentPull, maxVer)
  return remote.length
}

async function pushReviews(
  client: SyncClient,
  device: string,
): Promise<number> {
  const since = await getCursor(CURSOR.reviewPush)
  const rows = await db.reviews.where('id').above(since).toArray()
  if (rows.length === 0) return 0

  let pushed = 0
  for (const group of chunk(rows, 20)) {
    await Promise.all(
      group.map((r) =>
        client.createIgnoreDuplicate('reviews', {
          card_id: r.cardId,
          at: r.at,
          rating: r.rating,
          prev_state: r.prevState,
          device,
        }),
      ),
    )
    pushed += group.length
    const lastId = group[group.length - 1].id
    if (typeof lastId === 'number') await setCursor(CURSOR.reviewPush, lastId)
  }
  return pushed
}

function stateBody(card: CardRecord, device: string) {
  return {
    card_id: card.id,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ?? 0,
    updated: stateVersion(card),
    device,
  }
}

async function pushStates(client: SyncClient, device: string): Promise<number> {
  const since = await getCursor(CURSOR.statePush)
  const cards = await db.cards.where('last_review').above(since).toArray()
  if (cards.length === 0) return 0

  const remoteStates = await client.listAll<RemoteState>('states', { perPage: 500 })
  const idByCard = new Map(remoteStates.map((s) => [s.card_id, s.id]))

  let pushed = 0
  let maxVersion = since
  for (const card of cards) {
    const body = stateBody(card, device)
    const existing = idByCard.get(card.id)
    if (existing) await client.patch('states', existing, body)
    else await client.create('states', body)
    pushed += 1
    maxVersion = Math.max(maxVersion, stateVersion(card))
  }
  await setCursor(CURSOR.statePush, maxVersion)
  return pushed
}

async function pullStates(client: SyncClient): Promise<number> {
  const since = await getCursor(CURSOR.statePull)
  const remote = await client.listAll<RemoteState>('states', {
    filter: `updated > ${since}`,
    sort: 'updated',
    perPage: 200,
  })
  if (remote.length === 0) return 0

  let applied = 0
  let maxUpdated = since
  for (const item of remote) {
    maxUpdated = Math.max(maxUpdated, item.updated)
    const card = await db.cards.get(item.card_id)
    if (!card) continue
    if (!shouldTakeRemoteState(card, item.updated)) continue
    await db.cards.put({
      ...card,
      due: item.due,
      stability: item.stability,
      difficulty: item.difficulty,
      scheduled_days: item.scheduled_days,
      learning_steps: item.learning_steps,
      reps: item.reps,
      lapses: item.lapses,
      state: item.state,
      last_review: item.last_review,
    })
    applied += 1
  }
  await setCursor(CURSOR.statePull, maxUpdated)
  return applied
}

async function pullReviews(client: SyncClient): Promise<number> {
  const since = await getCursor(CURSOR.reviewPull)
  const remote = await client.listAll<RemoteReview>('reviews', {
    filter: `at > ${since}`,
    sort: 'at',
    perPage: 500,
  })
  if (remote.length === 0) return 0

  const incoming: ReviewRecord[] = remote.map((r) => ({
    cardId: r.card_id,
    at: r.at,
    rating: r.rating as ReviewRecord['rating'],
    prevState: r.prev_state,
  }))

  const local = await db.reviews.toArray()
  const merged = unionReviews(local, incoming)
  const added = merged.slice(local.length)
  if (added.length === 0) {
    await setCursor(CURSOR.reviewPull, remote[remote.length - 1].at)
    return 0
  }

  await db.reviews.bulkAdd(added)

  // 刚落地的远端日志不该再被推回服务端
  const localMaxId = await db.reviews.orderBy('id').last()
  if (localMaxId?.id !== undefined) {
    await setCursor(CURSOR.reviewPush, localMaxId.id)
  }

  // 当日聚合可由日志重算，按受影响日期重刷
  const dates = new Set(added.map((r) => localDateKey(r.at)))
  for (const date of dates) {
    const dayStart = new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
    ).getTime()
    const dayReviews = await db.reviews
      .where('at')
      .between(dayStart, dayStart + 86_400_000, true, false)
      .toArray()
    const existing = await db.daily.get(date)
    await db.daily.put(recomputeDaily(dayReviews, date, existing?.seconds ?? 0))
  }

  await setCursor(CURSOR.reviewPull, remote[remote.length - 1].at)
  return added.length
}

async function syncSettings(
  client: SyncClient,
  device: string,
): Promise<'pushed' | 'pulled' | 'unchanged'> {
  const current = useSettings.getState()
  const localUpdated = await getCursor(CURSOR.settingsUpdated)
  const remote = (
    await client.listAll<RemoteSettings>('settings', { sort: '-updated', perPage: 1 })
  )[0]

  if (remote && remote.updated > localUpdated) {
    useSettings.setState({
      dailyNewLimit: remote.daily_new_limit,
      targetRetention: remote.target_retention,
      examDate: remote.exam_date || undefined,
    })
    await setCursor(CURSOR.settingsUpdated, remote.updated)
    return 'pulled'
  }

  const differs =
    !remote ||
    remote.daily_new_limit !== current.dailyNewLimit ||
    remote.target_retention !== current.targetRetention ||
    (remote.exam_date || undefined) !== current.examDate

  if (!differs) return 'unchanged'

  const updated = Date.now()
  const body = {
    daily_new_limit: current.dailyNewLimit,
    target_retention: current.targetRetention,
    exam_date: current.examDate ?? '',
    updated,
    device,
  }
  if (remote) await client.patch('settings', remote.id, body)
  else await client.create('settings', body)
  await setCursor(CURSOR.settingsUpdated, updated)
  return 'pushed'
}

async function runSync(config: SyncConfig): Promise<SyncResult> {
  const client = new SyncClient(config)
  await client.auth()
  const device = await deviceId()

  const pulledCards = await pullCards(client)
  const pushedReviews = await pushReviews(client, device)
  const pushedStates = await pushStates(client, device)
  const pulledStates = await pullStates(client)
  const pulledReviews = await pullReviews(client)
  const settings = await syncSettings(client, device)

  return {
    pushedReviews,
    pushedStates,
    pulledReviews,
    pulledStates,
    pulledCards,
    settings,
    at: Date.now(),
  }
}

let inFlight: Promise<SyncResult> | null = null

/** 并发调用共用同一次同步，避免多标签页/定时器互相踩踏 */
export function syncNow(config?: SyncConfig | null): Promise<SyncResult> {
  if (inFlight) return inFlight
  const resolved = config ?? loadConfig()
  if (!resolved) return Promise.reject(new Error('尚未配置同步后端'))
  const task = runSync(resolved).finally(() => {
    inFlight = null
  })
  inFlight = task
  return task
}

/** 忘记游标，下次全量重拉（本地数据不会被清） */
export async function resetSyncCursors(): Promise<void> {
  await db.syncMeta.bulkDelete(Object.values(CURSOR))
}
