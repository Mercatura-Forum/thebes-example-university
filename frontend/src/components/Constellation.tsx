import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogRow } from '../lib/university-api'

/**
 * Constellation — the catalog as YOUR degree map. Courses are stars arranged
 * by prerequisite depth (foundations left, capstones right); the edges are
 * the real prerequisite DAG from the contract. Gold stars are completed,
 * crimson is where you sit now, lit stars are open to you, dim ones are
 * locked behind prerequisites you haven't earned — so the picture is
 * different for every student, computed from their on-chain transcript.
 * Hover a star for the course; click to jump to its card. Static under
 * prefers-reduced-motion; pauses offscreen.
 */

interface Node {
  row: CatalogRow
  level: number
  x: number
  y: number
  phase: number
}

export function Constellation({ rows, onPick, className = '' }: {
  rows: CatalogRow[]
  onPick: (id: bigint) => void
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<Node | null>(null)
  const hoverRef = useRef<Node | null>(null)

  const nodes = useMemo<Node[]>(() => {
    const byId = new Map(rows.map((r) => [r.id.toString(), r]))
    const levels = new Map<string, number>()
    const levelOf = (r: CatalogRow, seen: Set<string>): number => {
      const k = r.id.toString()
      const memo = levels.get(k)
      if (memo !== undefined) return memo
      if (seen.has(k)) return 0 // cycle-proof (the contract forbids cycles anyway)
      seen.add(k)
      const prereqs = r.prereqIds ? r.prereqIds.split('|') : []
      let lvl = 0
      for (const p of prereqs) {
        const pr = byId.get(p)
        if (pr) lvl = Math.max(lvl, levelOf(pr, seen) + 1)
      }
      levels.set(k, lvl)
      return lvl
    }
    const withLevels = rows.map((r) => ({ row: r, level: levelOf(r, new Set()) }))
    const maxLevel = Math.max(...withLevels.map((n) => n.level), 0)
    const perLevel = new Map<number, number>()
    return withLevels.map((n) => {
      const idx = perLevel.get(n.level) ?? 0
      perLevel.set(n.level, idx + 1)
      const countAtLevel = withLevels.filter((m) => m.level === n.level).length
      return {
        ...n,
        x: maxLevel === 0 ? 0.5 : 0.12 + (n.level / maxLevel) * 0.76,
        y: (idx + 1) / (countAtLevel + 1),
        phase: Number(n.row.id) * 1.7,
      }
    })
  }, [rows])

  useEffect(() => {
    const el = host.current
    const cv = canvas.current
    if (!el || !cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dark = () => document.documentElement.classList.contains('dark')
    let raf = 0
    let running = true
    let visible = true
    let W = 0
    let H = 0

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(el)
    function resize() {
      if (!el || !cv || !ctx) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = el.clientWidth; H = el.clientHeight
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      cv.style.width = `${W}px`; cv.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const byId = new Map(nodes.map((n) => [n.row.id.toString(), n]))
    const px = (n: Node) => ({ x: n.x * W, y: 30 + n.y * (H - 60) })

    function colors(state: string, isDark: boolean) {
      const navy = isDark ? '#c7d4f2' : '#0f1e3d'
      switch (state) {
        case 'completed': return { fill: '#d4a017', ring: '#d4a017', dim: 1 }
        case 'enrolled': return { fill: isDark ? '#fb7185' : '#9f1239', ring: isDark ? '#fb7185' : '#9f1239', dim: 1 }
        case 'open': return { fill: 'transparent', ring: isDark ? '#4ade80' : '#15803d', dim: 1 }
        case 'waitlisted': return { fill: 'transparent', ring: '#d97706', dim: 1 }
        case 'full': return { fill: 'transparent', ring: '#d97706', dim: 0.75 }
        default: return { fill: 'transparent', ring: navy, dim: 0.3 } // locked
      }
    }

    function draw(tMs: number) {
      if (!ctx || nodes.length === 0) return
      const isDark = dark()
      ctx.clearRect(0, 0, W, H)
      const ink = isDark ? 'rgba(199,212,242,' : 'rgba(15,30,61,'

      // Edges: prerequisite → course, lit when the prerequisite is completed.
      for (const n of nodes) {
        const prereqs = n.row.prereqIds ? n.row.prereqIds.split('|') : []
        for (const p of prereqs) {
          const from = byId.get(p)
          if (!from) continue
          const a = px(from); const b = px(n)
          const lit = from.row.myState === 'completed'
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          const mx = (a.x + b.x) / 2
          ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y)
          ctx.strokeStyle = lit ? (isDark ? 'rgba(212,160,23,0.65)' : 'rgba(212,160,23,0.75)') : ink + '0.15)'
          ctx.lineWidth = lit ? 1.8 : 1
          ctx.stroke()
          // A spark travels lit edges.
          if (lit && !reduced) {
            const f = ((tMs / 2600) + n.phase) % 1
            const x = a.x + (b.x - a.x) * f
            const t2 = f * f * (3 - 2 * f)
            const y = a.y + (b.y - a.y) * t2
            ctx.beginPath()
            ctx.arc(x, y, 1.8, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(212,160,23,0.9)'
            ctx.fill()
          }
        }
      }

      // Stars.
      const active = hoverRef.current
      for (const n of nodes) {
        const { x, y } = px(n)
        const c = colors(n.row.myState, isDark)
        const isHover = active !== null && active.row.id === n.row.id
        const pulse = n.row.myState === 'enrolled' && !reduced ? 1 + Math.sin(tMs / 500 + n.phase) * 0.15 : 1
        const r = (isHover ? 11 : 8.5) * pulse
        ctx.globalAlpha = c.dim
        if (n.row.myState === 'completed' || n.row.myState === 'enrolled') {
          ctx.shadowColor = c.ring
          ctx.shadowBlur = 12
        }
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        if (c.fill !== 'transparent') { ctx.fillStyle = c.fill; ctx.fill() }
        ctx.strokeStyle = c.ring
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.shadowBlur = 0
        // Code label.
        ctx.font = '700 10.5px Libre Franklin Variable, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = ink + (c.dim < 1 ? '0.4)' : '0.85)')
        ctx.fillText(n.row.code, x, y + r + 13)
        ctx.globalAlpha = 1
      }
    }

    function loop(t: number) {
      if (!running) return
      if (visible && !document.hidden) draw(t)
      raf = requestAnimationFrame(loop)
    }
    if (reduced) draw(0)
    else raf = requestAnimationFrame(loop)

    function locate(ev: MouseEvent): Node | null {
      const rect = cv!.getBoundingClientRect()
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      for (const n of nodes) {
        const { x, y } = px(n)
        if (Math.hypot(mx - x, my - y) < 16) return n
      }
      return null
    }
    function onMove(ev: MouseEvent) {
      const h = locate(ev)
      hoverRef.current = h
      setHover(h)
      cv!.style.cursor = h ? 'pointer' : 'default'
      if (reduced) draw(0)
    }
    function onClick(ev: MouseEvent) {
      const h = locate(ev)
      if (h) onPick(h.row.id)
    }
    function onLeave() { hoverRef.current = null; setHover(null); if (reduced) draw(0) }
    cv.addEventListener('mousemove', onMove)
    cv.addEventListener('click', onClick)
    cv.addEventListener('mouseleave', onLeave)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      cv.removeEventListener('mousemove', onMove)
      cv.removeEventListener('click', onClick)
      cv.removeEventListener('mouseleave', onLeave)
    }
  }, [nodes, onPick])

  return (
    <div ref={host} className={`relative ${className}`} role="img"
      aria-label="Degree constellation: courses arranged by prerequisite depth. Gold stars are completed, crimson is enrolled, green-ringed are open to you, dim stars are locked behind prerequisites.">
      <canvas ref={canvas} />
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-surface px-3 py-1.5 text-xs shadow-lg"
          style={{ left: hover.x * (host.current?.clientWidth ?? 0), top: 30 + hover.y * ((host.current?.clientHeight ?? 0) - 60) - 46 }}>
          <b>{hover.row.code}</b> {hover.row.title} · {hover.row.credits.toString()} cr ·{' '}
          <span className="capitalize">{hover.row.myState}</span>
          {hover.row.lockReason && <span className="text-ink-soft"> — {hover.row.lockReason}</span>}
        </div>
      )}
    </div>
  )
}
