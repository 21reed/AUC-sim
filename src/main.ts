import './style.css'
import {
  computeMass,
  createLammState,
  estimateStableDt,
  stepLamm,
  type LammParams,
} from './lamm'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app container')
}

app.innerHTML = `
  <main class="panel">
    <div class="headline">
      <div>
        <p class="eyebrow">Lamm Equation • 1D, single species</p>
        <h1>Radial concentration profile</h1>
        <p class="lede">
          Explicit conservative finite-volume solver with no-flux walls and non-negative enforcement.
        </p>
      </div>
      <button id="toggle">Pause</button>
    </div>
    <section class="info">
      <div>
        <p class="label">Domain</p>
        <p id="domain"></p>
      </div>
      <div>
        <p class="label">Time</p>
        <p id="time">0.000 s</p>
      </div>
      <div>
        <p class="label">Mass</p>
        <p id="mass">—</p>
      </div>
      <div>
        <p class="label">Δt (stable)</p>
        <p id="dt">—</p>
      </div>
    </section>
    <canvas id="profile" width="760" height="420" aria-label="Concentration profile"></canvas>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#profile')
const toggle = document.querySelector<HTMLButtonElement>('#toggle')
const massEl = document.querySelector<HTMLParagraphElement>('#mass')
const timeEl = document.querySelector<HTMLParagraphElement>('#time')
const dtEl = document.querySelector<HTMLParagraphElement>('#dt')
const domainEl = document.querySelector<HTMLParagraphElement>('#domain')

if (!canvas || !toggle || !massEl || !timeEl || !dtEl || !domainEl) {
  throw new Error('UI failed to render')
}

const params: LammParams = {
  diffusion: 2e-7,
  sedimentation: 1e-8,
  omega: 20000,
}

const state = createLammState({
  n: 240,
  rMin: 5.5,
  rMax: 6.6,
  initial: (r) => Math.exp(-((r - 5.65) ** 2) / (2 * 0.02 ** 2)),
})

const preferredDt = estimateStableDt(params, state, 0.4)
const dt = Number.isFinite(preferredDt) ? preferredDt : 1e-4
const ctx = canvas.getContext('2d')
const baseMass = computeMass(state)

if (!ctx) {
  throw new Error('Unable to acquire canvas context')
}

domainEl.textContent = `${state.r[0].toFixed(3)} ≤ r ≤ ${state.r[state.r.length - 1].toFixed(3)}`
dtEl.textContent = `${dt.toExponential(2)} s (suggested)`

let running = true
let simTime = 0
let accumulator = 0
let lastTime = performance.now()

toggle.addEventListener('click', () => {
  running = !running
  toggle.textContent = running ? 'Pause' : 'Resume'
  accumulator = 0
  lastTime = performance.now()
})

function render(): void {
  const width = canvas.width
  const height = canvas.height
  const margin = 48
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#0c1323'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = '#1f2d49'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(margin, height - margin)
  ctx.lineTo(width - margin, height - margin)
  ctx.moveTo(margin, margin)
  ctx.lineTo(margin, height - margin)
  ctx.stroke()

  const maxC = Math.max(...state.c)
  if (maxC <= 0) {
    return
  }

  const xScale = (width - 2 * margin) / (state.r[state.r.length - 1] - state.r[0])
  const yScale = (height - 2 * margin) / maxC

  ctx.lineWidth = 3
  ctx.strokeStyle = '#5ad1ff'
  ctx.beginPath()
  for (let i = 0; i < state.c.length; i += 1) {
    const x = margin + (state.r[i] - state.r[0]) * xScale
    const y = height - margin - state.c[i] * yScale
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()

  ctx.fillStyle = 'rgba(90, 209, 255, 0.1)'
  ctx.beginPath()
  ctx.moveTo(margin, height - margin)
  for (let i = 0; i < state.c.length; i += 1) {
    const x = margin + (state.r[i] - state.r[0]) * xScale
    const y = height - margin - state.c[i] * yScale
    ctx.lineTo(x, y)
  }
  ctx.lineTo(width - margin, height - margin)
  ctx.closePath()
  ctx.fill()
}

function stepSimulation(deltaSeconds: number): void {
  accumulator += deltaSeconds
  const steps = Math.min(5000, Math.floor(accumulator / dt))
  if (steps === 0) {
    return
  }
  for (let i = 0; i < steps; i += 1) {
    stepLamm(state, params, dt)
    simTime += dt
  }
  accumulator -= steps * dt
}

function loop(now: number): void {
  const delta = (now - lastTime) / 1000
  lastTime = now
  if (running) {
    stepSimulation(delta)
  }
  render()
  massEl.textContent = `${computeMass(state).toPrecision(4)} (start ${baseMass.toPrecision(4)})`
  timeEl.textContent = `${simTime.toFixed(3)} s`
  requestAnimationFrame(loop)
}

render()
requestAnimationFrame(loop)
