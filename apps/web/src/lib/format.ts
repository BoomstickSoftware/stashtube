export function duration(sec: number): string {
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function resolution(height: number): string | null {
  if (height >= 2000) return '4K'
  if (height >= 1400) return '1440p'
  if (height >= 1000) return '1080p'
  if (height >= 700) return '720p'
  return height ? `${height}p` : null
}

export function date(d: string | null): string | null {
  if (!d) return null
  const t = new Date(d.length === 10 ? `${d}T12:00:00` : d)
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ago(d: string | null): string | null {
  if (!d) return null
  const s = (Date.now() - new Date(d).getTime()) / 1000
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ]
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [n, unit] of units) if (s >= n) return rtf.format(-Math.floor(s / n), unit)
  return 'just now'
}

export function bytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i >= 3 ? 1 : 0)} ${u[i]}`
}

export function age(birthdate: string | null): number | null {
  if (!birthdate) return null
  const b = new Date(birthdate)
  const n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--
  return a
}
