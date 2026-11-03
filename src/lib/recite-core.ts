import type { CardRecord } from '../types'

/**
 * 默写打分：把「标准答案」拆成要点，再看用户手写的答案命中了几个要点。
 *
 * 刻意用字符级 LCS（最长公共子序列）而不是关键词表：
 * 中文简答题的采分点就是「关键词+短语」，LCS 能容忍少量语序变化和虚词差异，
 * 又不需要为每道题维护关键词，扩到几千张卡时不用额外标注成本。
 */

/** 行首的编号/项目符号：①②③、1. 、1、、- 、• 等 */
const MARKER_RE = /^[\s]*([①②③④⑤⑥⑦⑧⑨⑩⓪]|[0-9]{1,2}\s*[.、)）]|[-•·])\s*/

/** 句末/句中分隔符 */
const SEPARATOR_RE = /[。；;]/

/** 归一化：去掉标点与空白，英文转小写 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[，,。、；;：:！!？?（）()「」“”"'《》<>…—\-·]/g, '')
}

/**
 * 从 qa 卡的 back 里拆要点。
 * 先按换行拆，再对含句号/分号的行二次拆分；去掉编号与句末标点。
 */
export function extractPoints(back: string, limit = 10): string[] {
  const out: string[] = []
  for (const rawLine of back.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const segments = SEPARATOR_RE.test(line) ? line.split(SEPARATOR_RE) : [line]
    for (const segment of segments) {
      const text = segment
        .replace(MARKER_RE, '')
        .replace(/[。；;、\s]+$/, '')
        .trim()
      if (text.length < 2) continue
      out.push(text)
      if (out.length >= limit) return out
    }
  }
  return out
}

/** 最长公共子序列长度（滚动数组，O(n*m) 时间、O(min) 空间） */
export function lcsLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  let prev = new Array<number>(short.length + 1).fill(0)
  for (let i = 1; i <= long.length; i += 1) {
    const cur = new Array<number>(short.length + 1).fill(0)
    for (let j = 1; j <= short.length; j += 1) {
      cur[j] =
        long[i - 1] === short[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  return prev[short.length]
}

/** 命中了多少：0~1，用归一化后的字符覆盖率衡量 */
export function similarity(answer: string, point: string): number {
  const a = normalize(answer)
  const p = normalize(point)
  if (p.length === 0) return 0
  if (a.length === 0) return 0
  if (a.includes(p)) return 1
  return lcsLength(a, p) / p.length
}

export interface CoverageResult {
  /** 命中要点 / 总要点，0~1 */
  coverage: number
  total: number
  hits: string[]
  misses: string[]
  /** 每个要点的命中率，便于界面逐条显示 */
  details: { point: string; score: number; hit: boolean }[]
}

/**
 * 打分。threshold 默认 0.55：一段要点里过半的字按顺序出现就算命中，
 * 能容忍「记得大意但措辞不同」，又不至于写几个字就满分。
 */
export function scoreCoverage(
  answer: string,
  points: string[],
  threshold = 0.55,
): CoverageResult {
  const details = points.map((point) => {
    const score = similarity(answer, point)
    return { point, score, hit: score >= threshold }
  })
  const hits = details.filter((d) => d.hit).map((d) => d.point)
  const misses = details.filter((d) => !d.hit).map((d) => d.point)
  return {
    coverage: details.length > 0 ? hits.length / details.length : 0,
    total: details.length,
    hits,
    misses,
    details,
  }
}

export type SuggestedRating = 1 | 2 | 3 | 4

/** 把覆盖率映射成 FSRS 的四档自评，用户仍可手动改 */
export function suggestRating(coverage: number): SuggestedRating {
  if (coverage >= 0.85) return 4
  if (coverage >= 0.6) return 3
  if (coverage >= 0.35) return 2
  return 1
}

export interface ReciteOptions {
  chapterId?: string
  subjectId?: string
  onlyCardIds?: Set<string>
  size?: number
}

/** 默写只取问答卡（选择题/判断题归刷题，挖空卡归背诵） */
export function pickReciteCards(
  all: CardRecord[],
  options: ReciteOptions = {},
): CardRecord[] {
  let pool = all.filter((c) => c.type === 'qa' && (c.back ?? '').trim().length > 0)
  if (options.onlyCardIds) {
    const ids = options.onlyCardIds
    pool = pool.filter((c) => ids.has(c.id))
  }
  if (options.chapterId) pool = pool.filter((c) => c.chapterId === options.chapterId)
  if (options.subjectId) pool = pool.filter((c) => c.subjectId === options.subjectId)

  pool.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
  return options.size && options.size > 0 ? pool.slice(0, options.size) : pool
}
