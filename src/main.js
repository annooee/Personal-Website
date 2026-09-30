import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import * as THREE from 'three'
import FOGModule from 'vanta/dist/vanta.fog.min'
import './style.css'

history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const body = document.body

/* ───────────── Lenis ───────────── */
const lenis = new Lenis({ lerp: 0.085 })
lenis.stop() // locked until the intro finishes

$$('[data-to]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault()
    lenis.scrollTo(a.getAttribute('href'), { duration: 1.6 })
  })
)

/* ───────────── Vanta fog (three.js) ─────────────
   A soft pastel fog behind the whole page. The middle sections sit on a
   frosted veil, so the glass cards always have colour moving behind them.
   Falls back to a CSS gradient. */
const fogEl = $('#fog')
const FOG = FOGModule.default || FOGModule
try {
  FOG({
    el: fogEl,
    THREE,
    mouseControls: false,
    touchControls: false,
    gyroControls: false,
    highlightColor: 0xffc4e2,
    midtoneColor: 0xb9a4ff,
    lowlightColor: 0x8fb2ff,
    baseColor: 0xf4f1ff,
    blurFactor: 0.55,
    speed: reduceMotion ? 0 : 1.1,
    zoom: 0.75,
    scale: 2, // render at half resolution — it's a blur anyway, and much cheaper
    scaleMobile: 2,
  })
} catch (err) {
  console.warn('Vanta fog unavailable, using gradient fallback', err)
}
requestAnimationFrame(() => body.classList.add('fog-ready'))

/* ───────────── Confetti graph canvas ─────────────
   Each node has a random "home" (a loose, floating graph) and a target
   sampled from the rendered name. `morph` blends home → name, `scatter`
   floats the name apart as you scroll. Nearby nodes are linked by soft lines. */
const canvas = $('#graph')
const ctx = canvas.getContext('2d')
const graph = { W: 0, H: 0, nodes: [], gap: 8, reveal: 0, morph: 0, scatter: 0 }
const pointer = { x: -1e4, y: -1e4 }
const COLORS = ['#5b6cff', '#7a5cff', '#9d5cf6', '#c46be8', '#f07ab8', '#4fa3ff']
const SPARKLE_COLORS = ['#ffc14d', '#ff8fc4', '#7fb6ff']
const LINE = '91,76,200'

function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  graph.W = innerWidth
  graph.H = innerHeight
  canvas.width = graph.W * dpr
  canvas.height = graph.H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function sampleName(W, H) {
  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const o = off.getContext('2d', { willReadFrequently: true })
  const portrait = W < H * 0.9
  const lines = portrait ? ['Annie', 'Yu'] : ['Annie Yu']
  let size = portrait ? W * 0.36 : Math.min(W * 0.2, H * 0.38)
  const setFont = () => {
    o.font = `800 ${size}px "Bricolage Grotesque", sans-serif`
    o.letterSpacing = `${-size * 0.04}px`
  }
  setFont()
  const widest = Math.max(...lines.map((l) => o.measureText(l).width))
  if (widest > W * 0.86) {
    size *= (W * 0.86) / widest
    setFont()
  }
  o.fillStyle = '#000'
  o.textAlign = 'center'
  o.textBaseline = 'middle'
  const cy = H * 0.45
  lines.forEach((l, i) => o.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * size * 0.95))

  const data = o.getImageData(0, 0, W, H).data
  const gap = Math.max(5, Math.round(size / 25))
  let pts = []
  for (let y = 0; y < H; y += gap)
    for (let x = 0; x < W; x += gap)
      if (data[(y * W + x) * 4 + 3] > 128)
        pts.push({ x: x + (Math.random() - 0.5) * gap * 0.45, y: y + (Math.random() - 0.5) * gap * 0.45 })
  if (pts.length > 2200) pts = pts.sort(() => Math.random() - 0.5).slice(0, 2200)
  return { pts, gap }
}

function buildNodes(settled) {
  const { W, H } = graph
  const { pts, gap } = sampleName(W, H)
  graph.gap = gap
  graph.nodes = pts.map((p, id) => {
    const a = Math.random() * Math.PI * 2
    const s = 0.35 + Math.random() * 0.9
    const hx = Math.random() * W
    const hy = Math.random() * H
    const sparkle = Math.random() < 0.03
    return {
      id,
      tx: p.x, ty: p.y,
      hx, hy,
      x: settled ? p.x : hx,
      y: settled ? p.y : hy,
      vx: 0, vy: 0,
      ph: Math.random() * Math.PI * 2,
      sp: 0.25 + Math.random() * 0.6,
      sx: Math.cos(a) * s, sy: Math.sin(a) * s,
      r: Math.min(gap * 0.36, 1.5 + Math.random() * 1.5),
      sparkle,
      color: sparkle
        ? SPARKLE_COLORS[(Math.random() * SPARKLE_COLORS.length) | 0]
        : COLORS[(Math.random() * COLORS.length) | 0],
      born: Math.random(),
    }
  })
}

function stepGraph(t) {
  const { nodes, W, H } = graph
  const m = easeInOutCubic(graph.morph)
  const sc = graph.scatter
  const wob = 34 * (1 - m)
  for (const n of nodes) {
    let gx = lerp(n.hx + Math.sin(t * n.sp + n.ph) * wob * 1.4, n.tx + Math.sin(t * 1.4 + n.ph) * 1.2, m)
    let gy = lerp(n.hy + Math.cos(t * n.sp * 0.8 + n.ph) * wob, n.ty + Math.cos(t * 1.2 + n.ph) * 1.2, m)
    // scrolling floats everything up and outward, like released balloons
    gx += n.sx * sc * W * 0.6
    gy += n.sy * sc * H * 0.5 - sc * H * 0.35
    n.vx += (gx - n.x) * 0.05
    n.vy += (gy - n.y) * 0.05
    const dx = n.x - pointer.x
    const dy = n.y - pointer.y
    const d2 = dx * dx + dy * dy
    if (d2 < 16900) {
      const d = Math.sqrt(d2) || 1
      const f = (1 - d / 130) * 4.5
      n.vx += (dx / d) * f
      n.vy += (dy / d) * f
    }
    n.vx *= 0.82
    n.vy *= 0.82
    n.x += n.vx
    n.y += n.vy
  }
}

function sparklePath(p, x, y, s) {
  // four-point star
  p.moveTo(x, y - s)
  p.quadraticCurveTo(x, y, x + s, y)
  p.quadraticCurveTo(x, y, x, y + s)
  p.quadraticCurveTo(x, y, x - s, y)
  p.quadraticCurveTo(x, y, x, y - s)
}

function drawGraph(t) {
  const { W, H } = graph
  const m = easeInOutCubic(graph.morph)
  const linkDist = lerp(80, graph.gap * 1.7, m)
  const ld2 = linkDist * linkDist
  const near2 = ld2 * 0.3
  ctx.clearRect(0, 0, W, H)

  // spatial hash so edge search stays ~O(n)
  const vis = graph.nodes.filter((n) => n.born <= graph.reveal)
  const grid = new Map()
  const key = (cx, cy) => (cx + 2048) + (cy + 2048) * 8192
  for (const n of vis) {
    n.cx = Math.floor(n.x / linkDist)
    n.cy = Math.floor(n.y / linkDist)
    const k = key(n.cx, n.cy)
    const b = grid.get(k)
    b ? b.push(n) : grid.set(k, [n])
  }

  const pNear = new Path2D()
  const pFar = new Path2D()
  for (const n of vis) {
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const b = grid.get(key(n.cx + ox, n.cy + oy))
        if (!b) continue
        for (const o of b) {
          if (o.id <= n.id) continue
          const dx = o.x - n.x
          const dy = o.y - n.y
          const d2 = dx * dx + dy * dy
          if (d2 > ld2) continue
          const p = d2 < near2 ? pNear : pFar
          p.moveTo(n.x, n.y)
          p.lineTo(o.x, o.y)
        }
      }
  }
  ctx.lineWidth = 0.8
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(${LINE},0.1)`
  ctx.stroke(pFar)
  ctx.strokeStyle = `rgba(${LINE},0.2)`
  ctx.stroke(pNear)

  // one path per colour keeps draw calls low
  const byColor = new Map()
  for (const n of vis) {
    let p = byColor.get(n.color)
    if (!p) byColor.set(n.color, (p = new Path2D()))
    if (n.sparkle) {
      sparklePath(p, n.x, n.y, 5 + Math.sin(t * 3 + n.ph) * 2.2)
    } else {
      p.moveTo(n.x + n.r, n.y)
      p.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    }
  }
  for (const [color, p] of byColor) {
    ctx.fillStyle = color
    ctx.fill(p)
  }
}

addEventListener('pointermove', (e) => {
  if (reduceMotion) return
  pointer.x = e.clientX
  pointer.y = e.clientY
})
const resetPointer = () => ((pointer.x = -1e4), (pointer.y = -1e4))
document.addEventListener('pointerleave', resetPointer)
addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && resetPointer())
addEventListener('blur', resetPointer)

/* ───────────── Intro sequence ───────────── */
let skipped = false
let introDone = false
const tween = (dur, fn, ease = (x) => x) =>
  new Promise((res) => {
    const start = performance.now()
    const tick = (now) => {
      const t = skipped ? 1 : clamp((now - start) / dur)
      fn(ease(t))
      t < 1 ? requestAnimationFrame(tick) : res()
    }
    requestAnimationFrame(tick)
  })
const wait = (ms) =>
  new Promise((res) => {
    const start = performance.now()
    const tick = (now) => (skipped || now - start >= ms ? res() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  })

const skip = () => (skipped = true)
$('.loader__skip').addEventListener('click', skip)
addEventListener('keydown', (e) => {
  if (!introDone && ['Enter', 'Escape', ' '].includes(e.key)) skip()
})

const CAPTIONS = [
  [0, 'initialising'],
  [0.25, 'gathering ideas'],
  [0.5, 'connecting the dots'],
  [0.78, 'rendering colour'],
]

async function intro() {
  const count = $('#count')
  const bar = $('.loader__bar i')
  const caption = $('#caption')
  const setCaption = (text) => {
    caption.textContent = text
    caption.classList.remove('swap')
    void caption.offsetWidth // restart the pop animation
    caption.classList.add('swap')
  }

  if (!reduceMotion) {
    let next = 0
    await tween(
      2600,
      (p) => {
        graph.reveal = p
        count.textContent = Math.round(p * 100)
        bar.style.setProperty('--p', p)
        while (next < CAPTIONS.length && p >= CAPTIONS[next][0]) setCaption(CAPTIONS[next++][1])
      },
      easeInOutCubic
    )
    tween(1700, (m) => (graph.morph = m))
    setCaption('hello, I’m Annie')
    await wait(1700)
  }

  graph.reveal = 1
  graph.morph = 1
  body.classList.add('is-ready')
  body.classList.remove('is-loading')
  lenis.start()
  introDone = true
  setTimeout(() => body.classList.add('is-done'), 1000)
}

/* ───────────── Scroll-driven sections ───────────── */

// About: wrap every word so it can light up with scroll
function splitWords(el) {
  const words = []
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment()
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return
          if (/^\s+$/.test(part)) return frag.append(part)
          const span = document.createElement('span')
          span.className = 'w'
          span.textContent = part
          frag.append(span)
          words.push(span)
        })
        child.replaceWith(frag)
      } else walk(child)
    }
  }
  walk(el)
  return words
}
const statement = $('.about__statement')
const words = splitWords(statement)
function updateAbout(H) {
  const r = statement.getBoundingClientRect()
  if (r.bottom < -H || r.top > H) return
  const p = clamp((H * 0.82 - r.top) / (H * 0.6))
  const k = p * words.length
  words.forEach((w, i) => {
    const o = (0.16 + 0.84 * clamp(k - i + 1)).toFixed(3)
    if (w._o !== o) {
      w.style.opacity = o
      w._o = o
    }
  })
}

// Projects: vertical scroll → horizontal track
const hsec = $('.hscroll')
const track = $('.track')
const hMeter = $('.hscroll__meter i')
let hTravel = 0
function layoutH() {
  hTravel = Math.max(0, track.scrollWidth - innerWidth)
  hsec.style.height = innerHeight + hTravel + 'px'
}
function updateH(H) {
  const r = hsec.getBoundingClientRect()
  if (r.bottom < 0 || r.top > H) return
  const p = clamp(-r.top / (r.height - H || 1))
  track.style.transform = `translate3d(${-p * hTravel}px,0,0)`
  hMeter.style.transform = `scaleX(${p})`
}

// Skills: marquee that speeds up with scroll velocity and follows scroll direction
const marquees = $$('.marquee').map((el) => {
  el.append(el.firstElementChild.cloneNode(true))
  return { el, dir: +el.dataset.dir, x: 0, w: 0 }
})
const measureMarquees = () => marquees.forEach((m) => (m.w = m.el.scrollWidth / 2))
let scrollDir = 1
function updateMarquees() {
  if (reduceMotion) return
  if (lenis.direction) scrollDir = lenis.direction
  const boost = Math.min(Math.abs(lenis.velocity) * 0.35, 30)
  for (const m of marquees) {
    m.x += m.dir * scrollDir * (0.7 + boost)
    if (m.x <= -m.w) m.x += m.w
    if (m.x > 0) m.x -= m.w
    m.el.style.transform = `translate3d(${m.x}px,0,0)`
  }
}

// Fade-up reveals
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in')
        io.unobserve(e.target)
      }
    }),
  { rootMargin: '0px 0px -12% 0px' }
)
$$('.reveal').forEach((el) => io.observe(el))

const heroMeta = $('.hero__meta')

// Stats: count up the first time they scroll into view
const countIO = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return
      countIO.unobserve(e.target)
      const el = e.target
      const end = parseFloat(el.dataset.count)
      const dec = +(el.dataset.dec || 0)
      if (reduceMotion) return
      const start = performance.now()
      const tick = (now) => {
        const t = clamp((now - start) / 1400)
        el.textContent = (end * (1 - Math.pow(1 - t, 4))).toFixed(dec)
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }),
  { threshold: 0.6 }
)
$$('[data-count]').forEach((el) => countIO.observe(el))

// Glass cards: 3D tilt + a light that follows the cursor
if (!reduceMotion && matchMedia('(hover: hover)').matches) {
  $$('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      el.classList.add('is-tilting')
      el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`)
      el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`)
      el.style.setProperty('--mx', `${x * 100}%`)
      el.style.setProperty('--my', `${y * 100}%`)
    })
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-tilting')
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--ry', '0deg')
    })
  })
}

// Toronto clock
const clock = $('#clock')
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false })
const tickClock = () => (clock.textContent = fmt.format(new Date()))
tickClock()
setInterval(tickClock, 15000)

/* ───────────── Main loop ───────────── */
let canvasHidden = false
let lastTime = 0
function frame(time) {
  // physics runs in fixed ~60fps steps so slow devices still settle on time
  const steps = lastTime ? Math.min(6, Math.max(1, Math.round((time - lastTime) / 16.7))) : 1
  lastTime = time
  lenis.raf(time)
  const H = innerHeight
  const y = lenis.scroll

  graph.scatter = clamp(y / (H * 0.85))
  if (graph.scatter < 1) {
    for (let i = 0; i < steps; i++) stepGraph(time / 1000)
    drawGraph(time / 1000)
    canvas.style.opacity = (1 - graph.scatter).toFixed(3)
    canvasHidden = false
  } else if (!canvasHidden) {
    canvas.style.opacity = 0
    canvasHidden = true
  }

  if (introDone) {
    heroMeta.style.opacity = clamp(1 - graph.scatter * 1.6).toFixed(3)
    heroMeta.style.transform = `translate3d(0,${-y * 0.25}px,0)`
  }

  updateAbout(H)
  updateH(H)
  updateMarquees()
  requestAnimationFrame(frame)
}

/* ───────────── Boot ───────────── */
let lastW = innerWidth
let lastH = innerHeight
let resizeTimer
addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    layoutH()
    measureMarquees()
    sizeCanvas()
    // ignore small height changes (mobile URL bar) so the name doesn't re-shuffle
    if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 150) buildNodes(introDone)
    lastW = innerWidth
    lastH = innerHeight
  }, 150)
})

;(async () => {
  const fontTimeout = new Promise((r) => setTimeout(r, 2500))
  await Promise.race([
    Promise.all([document.fonts.load('800 100px "Bricolage Grotesque"'), document.fonts.ready]),
    fontTimeout,
  ])
  sizeCanvas()
  buildNodes(reduceMotion)
  layoutH()
  measureMarquees()
  requestAnimationFrame(frame)
  intro()
})()
