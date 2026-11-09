import type { CastCount } from '@flix/shared'

// Cast counts in words ("1 woman, 2 men"), for the scene page and Settings (wiki features/cast).
export const CAST_WORDS = { F: ['woman', 'women'], M: ['man', 'men'], X: ['other', 'others'] } as const
export const CAST_LETTERS = ['F', 'M', 'X'] as const

export function castText(n: CastCount | null): string {
  if (!n) return 'Unknown'
  const parts = CAST_LETTERS.filter((l) => n[l]).map((l) => `${n[l]} ${CAST_WORDS[l][n[l] === 1 ? 0 : 1]}`)
  return parts.join(', ') || 'Unknown'
}
