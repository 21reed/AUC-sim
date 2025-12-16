import './style.css'
import { buildGradient, type GradientParams, type GradientType } from './physics/gradient'
import { MultiSpeciesLamm } from './physics/multiLamm'
import { buildSizeDistribution, type SizeDistributionParams } from './physics/sizeDistributions'

type TimeScale = 1 | 10 | 100 | 1000 | 10000

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app container')
}

function must<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Missing ${label}`)
  }
  return value
}

app.innerHTML = `
  <main class="panel">
    <header class="headline">
      <div>
        <p class="eyebrow">AUC / DGU • Multi-size Lamm solver</p>
        <h1>Polydisperse radial transport</h1>
        <p class="lede">Explicit conservative finite-volume evolution with density and viscosity gradients; no-flux boundaries.</p>
      </div>
      <div class="time-controls">
        <button id="toggle">Pause</button>
        <label class="small-label">Time scale
          <select id="timescale">
            <option value="1">1×</option>
            <option value="10">10×</option>
            <option value="100">100×</option>
            <option value="1000">1k×</option>
            <option value="10000">10k×</option>
          </select>
        </label>
      </div>
    </header>

    <section class="info">
      <div>
        <p class="label">Domain (m)</p>
        <p id="domain"></p>
      </div>
      <div>
        <p class="label">Sim time</p>
        <p id="time">0 s</p>
      </div>
      <div>
        <p class="label">Effective speed</p>
        <p id="speed">1×</p>
      </div>
      <div>
        <p class="label">Δt stable (s)</p>
        <p id="dt">—</p>
      </div>
      <div>
        <p class="label">Mass (arb.)</p>
        <p id="mass">—</p>
      </div>
      <div>
        <p class="label">Pellet mass</p>
        <p id="pellet">—</p>
      </div>
      <div>
        <p class="label">Pellet % of initial</p>
        <p id="pelletPct">—</p>
      </div>
    </section>

    <section class="controls">
      <div class="control-block">
        <h2>Gradient (ρ, η)</h2>
        <div class="grid">
          <label>r_min (m)<input id="rmin" type="number" step="0.001" value="0.055"></label>
          <label>r_max (m)<input id="rmax" type="number" step="0.001" value="0.065"></label>
          <label>Cells N<input id="nradial" type="number" step="10" value="180"></label>
          <label>Gradient type
            <select id="gradtype">
              <option value="linear">linear</option>
              <option value="uniform">uniform</option>
              <option value="power">power</option>
              <option value="two_step">two_step</option>
            </select>
          </label>
          <label>ρ_top (kg/m³)<input id="rhotop" type="number" step="1" value="1010"></label>
          <label>ρ_bot (kg/m³)<input id="rhobot" type="number" step="1" value="1150"></label>
          <label>η_top (Pa·s)<input id="etatop" type="number" step="0.0001" value="0.0011"></label>
          <label>η_bot (Pa·s)<input id="etabot" type="number" step="0.0001" value="0.0022"></label>
          <label>Exponent p (unitless)<input id="expo" type="number" step="0.1" value="1.3"></label>
          <label>r_mid (m)<input id="rmid" type="number" step="0.001" value="0.060"></label>
          <label>ρ_mid (kg/m³)<input id="rhomid" type="number" step="1" value="1080"></label>
          <label>η_mid (Pa·s)<input id="etamid" type="number" step="0.0001" value="0.0016"></label>
        </div>
      </div>

      <div class="control-block">
        <h2>Size distribution</h2>
        <div class="grid">
          <label>Type
            <select id="disttype">
              <option value="lognormal">lognormal</option>
              <option value="bimodal_lognormal">bimodal lognormal</option>
              <option value="discrete">discrete</option>
            </select>
          </label>
          <label>D50 (nm, total diameter)<input id="d50" type="number" step="1" value="25"></label>
          <label>g_sigma (unitless)<input id="gsigma" type="number" step="0.1" value="1.4"></label>
          <label>D50_2 (nm, total diameter)<input id="d50_2" type="number" step="1" value="12"></label>
          <label>g_sigma2 (unitless)<input id="gsigma2" type="number" step="0.1" value="1.6"></label>
          <label>weight1 (rel.)<input id="w1" type="number" step="0.1" value="0.5"></label>
          <label>weight2 (rel.)<input id="w2" type="number" step="0.1" value="0.5"></label>
          <label>n bins (count)<input id="nbins" type="number" step="1" value="6"></label>
          <label>Disc d1 (nm)<input id="disc_d1" type="number" step="1" value="20"></label>
          <label>Disc w1 (rel.)<input id="disc_w1" type="number" step="0.1" value="1"></label>
          <label>Disc d2 (nm)<input id="disc_d2" type="number" step="1" value="35"></label>
          <label>Disc w2 (rel.)<input id="disc_w2" type="number" step="0.1" value="1"></label>
        </div>
      </div>

      <div class="control-block">
        <h2>Material & rotor</h2>
        <div class="grid">
          <label>ρ_core (kg/m³)<input id="rho_core" type="number" step="10" value="2200"></label>
          <label>ρ_shell (kg/m³)<input id="rho_shell" type="number" step="10" value="1050"></label>
          <label>t_shell (nm)<input id="t_shell" type="number" step="0.5" value="2"></label>
          <label>ω (rad/s)<input id="omega" type="number" step="100" value="25000"></label>
          <label>T (K)<input id="temp" type="number" step="1" value="293"></label>
        </div>
      </div>
    </section>

    <div class="actions">
      <button id="apply">Apply parameters</button>
      <p id="status" class="status"></p>
      <label class="small-label">
        <input id="showPellet" type="checkbox"> Show pellet on chart
      </label>
    </div>

    <canvas id="profile" width="900" height="420" aria-label="Concentration profile"></canvas>
  </main>
`

const canvas = must(document.querySelector<HTMLCanvasElement>('#profile'), 'profile canvas')
const toggle = must(document.querySelector<HTMLButtonElement>('#toggle'), 'toggle')
const applyBtn = must(document.querySelector<HTMLButtonElement>('#apply'), 'apply button')
const timeEl = must(document.querySelector<HTMLParagraphElement>('#time'), 'time readout')
const dtEl = must(document.querySelector<HTMLParagraphElement>('#dt'), 'dt readout')
const massEl = must(document.querySelector<HTMLParagraphElement>('#mass'), 'mass readout')
const pelletEl = must(document.querySelector<HTMLParagraphElement>('#pellet'), 'pellet readout')
const pelletPctEl = must(
  document.querySelector<HTMLParagraphElement>('#pelletPct'),
  'pellet percent readout',
)
const domainEl = must(document.querySelector<HTMLParagraphElement>('#domain'), 'domain readout')
const speedEl = must(document.querySelector<HTMLParagraphElement>('#speed'), 'speed readout')
const statusEl = must(document.querySelector<HTMLParagraphElement>('#status'), 'status text')
const timescaleSel = must(document.querySelector<HTMLSelectElement>('#timescale'), 'timescale select')
const showPelletToggle = must(
  document.querySelector<HTMLInputElement>('#showPellet'),
  'show pellet toggle',
)

function readNumber(id: string, fallback: number): number {
  const el = document.querySelector<HTMLInputElement>(`#${id}`)
  if (!el) return fallback
  const val = Number(el.value)
  return Number.isFinite(val) ? val : fallback
}

function readSelect<T extends string>(id: string, fallback: T): T {
  const el = document.querySelector<HTMLSelectElement>(`#${id}`)
  return (el?.value as T) ?? fallback
}

function buildGradientParams(): GradientParams {
  const type = readSelect<GradientType>('gradtype', 'linear')
  const rMin_m = readNumber('rmin', 0.055)
  const rMax_m = readNumber('rmax', 0.065)
  return {
    type,
    rMin_m,
    rMax_m,
    rhoTop: readNumber('rhotop', 1010),
    rhoBot: readNumber('rhobot', 1150),
    etaTop: readNumber('etatop', 0.001),
    etaBot: readNumber('etabot', 0.002),
    exponent: readNumber('expo', 1.3),
    rMid_m: readNumber('rmid', (rMin_m + rMax_m) / 2),
    rhoMid: readNumber('rhomid', 1080),
    etaMid: readNumber('etamid', 0.0016),
  }
}

function buildDistributionParams(): SizeDistributionParams {
  const type = readSelect<'lognormal' | 'bimodal_lognormal' | 'discrete'>('disttype', 'lognormal')
  if (type === 'lognormal') {
    return {
      type: 'lognormal',
      d50_nm: readNumber('d50', 25),
      gSigma: readNumber('gsigma', 1.4),
    }
  }
  if (type === 'bimodal_lognormal') {
    return {
      type: 'bimodal_lognormal',
      d50_1_nm: readNumber('d50', 25),
      gSigma1: readNumber('gsigma', 1.4),
      weight1: readNumber('w1', 0.5),
      d50_2_nm: readNumber('d50_2', 12),
      gSigma2: readNumber('gsigma2', 1.6),
      weight2: readNumber('w2', 0.5),
    }
  }
  return {
    type: 'discrete',
    entries: [
      { diameter_nm: readNumber('disc_d1', 20), weight: readNumber('disc_w1', 1) },
      { diameter_nm: readNumber('disc_d2', 35), weight: readNumber('disc_w2', 1) },
    ],
  }
}

function gaussianProfile(rMin: number, rMax: number): (r: number) => number {
  const center = rMin + 0.1 * (rMax - rMin)
  const sigma = 0.08 * (rMax - rMin)
  return (r: number) => Math.exp(-((r - center) ** 2) / (2 * sigma * sigma))
}

let solver: MultiSpeciesLamm
let simTime = 0
let running = true
let timeScale: TimeScale = 1
let showPellet = false

function buildSolver(): void {
  const gradParams = buildGradientParams()
  const n = Math.max(40, Math.floor(readNumber('nradial', 180)))
  const gradient = buildGradient(gradParams, n)
  const distParams = buildDistributionParams()
  const nBins = Math.max(3, Math.floor(readNumber('nbins', 6)))
  const { radii_m, weights } = buildSizeDistribution(distParams, { nBins })

  solver = new MultiSpeciesLamm({
    rMin: gradParams.rMin_m,
    rMax: gradParams.rMax_m,
    n,
    omega: readNumber('omega', 25000),
    temperature: readNumber('temp', 293),
    gradient,
    aBins_m: radii_m,
    weights,
    material: {
      rhoCore: readNumber('rho_core', 2200),
      rhoShell: readNumber('rho_shell', 1050),
      shellThickness_m: readNumber('t_shell', 2) * 1e-9,
    },
  })

  solver.setInitialConcentrations(gaussianProfile(gradParams.rMin_m, gradParams.rMax_m))
  simTime = 0
  domainEl.textContent = `${gradParams.rMin_m.toFixed(3)} – ${gradParams.rMax_m.toFixed(3)}`
  statusEl.textContent = `Bins: ${radii_m.length}, radial cells: ${n}`
}

buildSolver()

toggle.addEventListener('click', () => {
  running = !running
  toggle.textContent = running ? 'Pause' : 'Resume'
})

timescaleSel.addEventListener('change', () => {
  timeScale = Number(timescaleSel.value) as TimeScale
})

applyBtn.addEventListener('click', () => {
  buildSolver()
})

showPelletToggle.addEventListener('change', () => {
  showPellet = showPelletToggle.checked
})

const ctx = must(canvas.getContext('2d'), '2d context')
const colors = ['#6bd0ff', '#ff9f6b', '#9c7bff', '#5de6a9', '#f25f87', '#b6ff6b']

function render(): void {
  const width = canvas.width
  const height = canvas.height
  const margin = 64
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#050912'
  ctx.fillRect(0, 0, width, height)

  const { species, total } = solver.getConcentrations()
  const maxC = Math.max(...total)
  if (maxC <= 0) return
  const xScale = (width - 2 * margin) / (solver.r[solver.r.length - 1] - solver.r[0])
  const yScale = (height - 2 * margin) / maxC

  ctx.strokeStyle = '#1f2d49'
  ctx.beginPath()
  ctx.moveTo(margin, height - margin)
  ctx.lineTo(width - margin, height - margin)
  ctx.moveTo(margin, margin)
  ctx.lineTo(margin, height - margin)
  ctx.stroke()

  // Axis titles with units
  ctx.fillStyle = '#c8d4eb'
  ctx.font = '14px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Radius r (m)', margin + (width - 2 * margin) / 2, height - margin + 36)
  ctx.save()
  ctx.translate(margin - 46, margin + (height - 2 * margin) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Concentration c(r) (arb.)', 0, 0)
  ctx.restore()

  // species traces
  species.forEach((c, idx) => {
    ctx.beginPath()
    ctx.strokeStyle = colors[idx % colors.length]
    ctx.lineWidth = 1.5
    for (let i = 0; i < c.length; i += 1) {
      const x = margin + (solver.r[i] - solver.r[0]) * xScale
      const y = height - margin - c[i] * yScale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  })

  // total
  ctx.beginPath()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  for (let i = 0; i < total.length; i += 1) {
    const x = margin + (solver.r[i] - solver.r[0]) * xScale
    const y = height - margin - total[i] * yScale
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  if (showPellet) {
    const lastIdx = total.length - 1
    const xPellet = margin + (solver.r[lastIdx] - solver.r[0]) * xScale
    const yPellet = height - margin - total[lastIdx] * yScale
    ctx.fillStyle = '#ffea7a'
    ctx.beginPath()
    ctx.arc(xPellet, yPellet, 5, 0, 2 * Math.PI)
    ctx.fill()
    ctx.fillStyle = '#e9f1ff'
    ctx.fillText('Pellet (arb.)', xPellet + 8, yPellet - 8)
  }

  // Legend
  ctx.font = '13px "Space Grotesk", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#e9f1ff'
  const legendX = width - margin + 10
  let legendY = margin
  ctx.fillText('Legend (c in arb.)', legendX, legendY)
  legendY += 16
  species.forEach((_, idx) => {
    ctx.fillStyle = colors[idx % colors.length]
    ctx.fillRect(legendX, legendY - 10, 14, 4)
    ctx.fillStyle = '#e9f1ff'
    ctx.fillText(`Bin ${idx + 1}`, legendX + 20, legendY)
    legendY += 16
  })
  ctx.fillText('Total (white)', legendX, legendY)
}

let lastTime = performance.now()

function formatSimTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs.toFixed(0)}s`
  }
  return `${secs.toFixed(2)}s`
}

function formatMass(value: number): string {
  return `${value.toExponential(3)} arb`
}

// Pellet mass is taken as the mass contained in the outermost radial cell (display only; simulation unchanged).
function computePelletMass(solver: MultiSpeciesLamm): number {
  let pellet = 0
  const lastIndex = solver.r.length - 1
  for (let k = 0; k < solver.q.length; k += 1) {
    pellet += solver.q[k][lastIndex] * solver.dr
  }
  return pellet
}

function updateTelemetry(effectiveScale: number, isRunning: boolean): void {
  const dtStable = solver.computeStableDt()
  const masses = solver.computeMasses()
  timeEl.textContent = `t = ${formatSimTime(simTime)}`
  dtEl.textContent = Number.isFinite(dtStable) ? `${dtStable.toExponential(2)} s` : '—'
  massEl.textContent = `ΣM=${formatMass(masses.total)} | per bin: ${Array.from(
    masses.perBin,
  )
    .map((m) => formatMass(m))
    .join(', ')}`
  const pelletMass = computePelletMass(solver)
  const pelletPct =
    masses.total > 0 ? (100 * pelletMass) / masses.total : 0 // percentage of current total mass
  pelletEl.textContent = `${formatMass(pelletMass)}`
  pelletPctEl.textContent = `${pelletPct.toFixed(2)} %`
  speedEl.textContent = `${effectiveScale.toFixed(1)}×`
  if (isRunning && effectiveScale + 1e-6 < timeScale) {
    statusEl.textContent = `CPU-limited (max ${effectiveScale.toFixed(1)}× vs target ${timeScale}×)`
  } else {
    statusEl.textContent = ''
  }
}

function loop(now: number): void {
  const wallDt = (now - lastTime) / 1000
  lastTime = now
  let effectiveScale = 1
  if (running) {
    const targetAdvance = wallDt * timeScale
    const result = solver.advanceBy(targetAdvance, 400)
    simTime += result.advanced
    effectiveScale = wallDt > 0 ? result.advanced / wallDt : 1
  }
  updateTelemetry(effectiveScale, running)
  render()
  requestAnimationFrame(loop)
}

render()
requestAnimationFrame(loop)
