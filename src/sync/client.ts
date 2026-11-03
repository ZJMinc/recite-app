import { loadToken, saveToken, type SyncConfig } from './config'

/** 服务端一条复习日志 */
export interface RemoteReview {
  id: string
  card_id: string
  at: number
  rating: number
  prev_state: number
  device?: string
}

/** 服务端一条卡片状态 */
export interface RemoteState {
  id: string
  card_id: string
  due: number
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review: number
  updated: number
  device?: string
}

/** 服务端一条内容记录 */
export interface RemoteCard {
  id: string
  card_id: string
  subject_id: string
  chapter_id: string
  kp: string
  type: string
  front?: string
  back: string
  options?: unknown
  answer?: unknown
  analysis?: string
  mnemonic?: string
  confusables?: string
  importance?: number
  tags?: unknown
  content_ver: number
  deleted?: boolean
}

export interface RemoteSettings {
  id: string
  daily_new_limit: number
  target_retention: number
  exam_date?: string
  updated: number
  device?: string
}

export class SyncError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'SyncError'
    this.status = status
    this.data = data
  }
}

/** PocketBase filter 里的字符串字面量转义 */
export function filterString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * 极简 PocketBase REST 客户端。
 * 刻意不引入 pocketbase JS SDK：同步只用 6 个端点，省掉一个依赖和一次版本对齐。
 */
export class SyncClient {
  readonly baseUrl: string
  private readonly email: string
  private readonly password: string
  private tokenValue: string | null

  constructor(config: SyncConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.email = config.email
    this.password = config.password
    this.tokenValue = loadToken()
  }

  private async raw(path: string, init: RequestInit): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    }
    if (this.tokenValue) headers.Authorization = this.tokenValue

    let response: Response
    try {
      response = await fetch(this.baseUrl + path, { ...init, headers })
    } catch (error) {
      throw new SyncError(
        `网络不可达：${(error as Error).message}`,
        0,
        null,
      )
    }

    const text = await response.text()
    const body = text ? parseJson(text) : null
    if (!response.ok) {
      throw new SyncError(
        `HTTP ${response.status} ${path}`,
        response.status,
        body,
      )
    }
    return body
  }

  /** 带 401 自动重认证的请求 */
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.tokenValue) await this.auth()
    try {
      return await this.raw(path, init)
    } catch (error) {
      if (error instanceof SyncError && error.status === 401) {
        saveToken(null)
        this.tokenValue = null
        await this.auth()
        return this.raw(path, init)
      }
      throw error
    }
  }

  async auth(): Promise<string> {
    const body = await this.raw('/api/collections/users/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: this.email, password: this.password }),
    })
    const token = (body as { token?: string }).token
    if (!token) throw new SyncError('登录失败：响应里没有 token', 401, body)
    this.tokenValue = token
    saveToken(token)
    return token
  }

  /** 分页拉全量，最多 maxPages 页，避免异常时死循环 */
  async listAll<T>(
    collection: string,
    options: { filter?: string; sort?: string; perPage?: number; maxPages?: number } = {},
  ): Promise<T[]> {
    const perPage = options.perPage ?? 200
    const maxPages = options.maxPages ?? 50
    const out: T[] = []
    for (let page = 1; page <= maxPages; page += 1) {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      })
      if (options.filter) params.set('filter', options.filter)
      if (options.sort) params.set('sort', options.sort)
      const body = (await this.request(
        `/api/collections/${collection}/records?${params.toString()}`,
      )) as { items?: T[]; totalPages?: number }
      const items = body.items ?? []
      out.push(...items)
      if (page >= (body.totalPages ?? 1)) break
    }
    return out
  }

  async create<T>(collection: string, body: Record<string, unknown>): Promise<T> {
    return (await this.request(`/api/collections/${collection}/records`, {
      method: 'POST',
      body: JSON.stringify(body),
    })) as T
  }

  async patch<T>(
    collection: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return (await this.request(`/api/collections/${collection}/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })) as T
  }

  /**
   * 复习日志是幂等的：同一 (card_id, at, rating) 重复推送会被唯一索引拒掉。
   * 这里的 400「不唯一」当作成功处理，这样重试、双端并发都不需要额外协调。
   */
  async createIgnoreDuplicate(
    collection: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.create(collection, body)
    } catch (error) {
      if (error instanceof SyncError && error.status === 400) {
        const text = JSON.stringify(error.data ?? '')
        if (text.toLowerCase().includes('unique')) return
      }
      throw error
    }
  }
}
