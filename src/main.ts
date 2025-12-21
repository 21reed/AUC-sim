import './style.css'
import { buildGradient, type GradientParams, type GradientType } from './physics/gradient'
import { MultiSpeciesLamm } from './physics/multiLamm'
import { buildSizeDistribution, type SizeDistributionParams } from './physics/sizeDistributions'
import { defaultConfig } from './config/defaults'

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

    <section id="massInspector" class="mass-inspector hidden">
      <div class="mass-inspector-header">
        <span id="massInspectorTitle">Mass bins</span>
        <button id="massInspectorClose" type="button">×</button>
      </div>
      <div class="mass-inspector-body">
        <table>
          <thead>
            <tr>
              <th>Bin</th>
              <th>D (nm)</th>
              <th>w (rel)</th>
              <th>Mass (arb.)</th>
            </tr>
          </thead>
          <tbody id="massInspectorRows"></tbody>
        </table>
      </div>
    </section>

    <section class="controls">
      <div class="control-block">
        <h2>Gradient (ρ, η)</h2>
        <div class="field-group gradient-group gradient-common first-group">
          <p class="group-label">Common (all types)</p>
          <div class="grid">
            <label>r_min (m)<input id="rmin" type="number" step="0.0001" value="${defaultConfig.gradient.rMin_m}"></label>
            <label>r_max (m)<input id="rmax" type="number" step="0.0001" value="${defaultConfig.gradient.rMax_m}"></label>
            <label>Cells N<input id="nradial" type="number" step="10" value="${defaultConfig.radialCells}"></label>
            <label>Gradient type
              <select id="gradtype">
                <option value="linear">linear</option>
                <option value="uniform">uniform</option>
                <option value="power">power</option>
                <option value="two_step">two_step</option>
              </select>
            </label>
          </div>
        </div>
        <div class="field-group gradient-group gradient-uniform">
          <p class="group-label">Uniform</p>
          <div class="grid">
            <label>ρ_top (kg/m³)<input id="rhotop" type="number" step="1" value="${defaultConfig.gradient.rhoTop}"></label>
            <label>η_top (Pa·s)<input id="etatop" type="number" step="0.000001" value="${defaultConfig.gradient.etaTop}"></label>
          </div>
        </div>
        <div class="field-group gradient-group gradient-linear-power">
          <p class="group-label">Linear / Power</p>
          <div class="grid">
            <label>ρ_top (kg/m³)<input id="rhotop" type="number" step="1" value="${defaultConfig.gradient.rhoTop}"></label>
            <label>ρ_bot (kg/m³)<input id="rhobot" type="number" step="1" value="${defaultConfig.gradient.rhoBot}"></label>
            <label>η_top (Pa·s)<input id="etatop" type="number" step="0.000001" value="${defaultConfig.gradient.etaTop}"></label>
            <label>η_bot (Pa·s)<input id="etabot" type="number" step="0.000001" value="${defaultConfig.gradient.etaBot}"></label>
            <label>Exponent p (unitless)<input id="expo" type="number" step="0.1" value="1.0"></label>
          </div>
        </div>
        <div class="field-group gradient-group gradient-two-step">
          <p class="group-label">Two-step</p>
          <div class="grid">
            <label>r_mid (m)<input id="rmid" type="number" step="0.001" value="${(defaultConfig.gradient.rMin_m + defaultConfig.gradient.rMax_m) / 2}"></label>
            <label>ρ_mid (kg/m³)<input id="rhomid" type="number" step="1" value="${(defaultConfig.gradient.rhoTop + defaultConfig.gradient.rhoBot) / 2}"></label>
            <label>η_mid (Pa·s)<input id="etamid" type="number" step="0.000001" value="${(defaultConfig.gradient.etaTop + defaultConfig.gradient.etaBot) / 2}"></label>
          </div>
        </div>
      </div>

      <div class="control-block">
        <h2>Size distribution</h2>
        <div class="field-group dist-group dist-common first-group">
          <p class="group-label">Common</p>
          <div class="grid">
            <label>Type
              <select id="disttype">
                <option value="lognormal">lognormal</option>
                <option value="bimodal_lognormal">bimodal lognormal</option>
                <option value="discrete">discrete</option>
              </select>
            </label>
            <label>n bins (count)<input id="nbins" type="number" step="1" value="${defaultConfig.nBins}"></label>
          </div>
        </div>
        <div class="field-group dist-group dist-lognormal">
          <p class="group-label">Lognormal</p>
          <div class="grid">
            <label>D50 (nm, total diameter)<input id="d50" type="number" step="0.01" value="${defaultConfig.sizeDistribution.d50_nm}"></label>
            <label>g_sigma (unitless)<input id="gsigma" type="number" step="0.1" value="${defaultConfig.sizeDistribution.gSigma}"></label>
          </div>
        </div>
        <div class="field-group dist-group dist-bimodal">
          <p class="group-label">Bimodal lognormal</p>
          <div class="grid">
            <label>D50_1 (nm, total diameter)<input id="d50" type="number" step="0.01" value="${defaultConfig.sizeDistribution.d50_nm}"></label>
            <label>g_sigma1 (unitless)<input id="gsigma" type="number" step="0.1" value="${defaultConfig.sizeDistribution.gSigma}"></label>
            <label>weight1 (rel.)<input id="w1" type="number" step="0.1" value="0.5"></label>
            <label>D50_2 (nm, total diameter)<input id="d50_2" type="number" step="1" value="12"></label>
            <label>g_sigma2 (unitless)<input id="gsigma2" type="number" step="0.1" value="1.6"></label>
            <label>weight2 (rel.)<input id="w2" type="number" step="0.1" value="0.5"></label>
          </div>
        </div>
        <div class="field-group dist-group dist-discrete">
          <p class="group-label">Discrete</p>
          <div class="grid">
            <label>Disc d1 (nm)<input id="disc_d1" type="number" step="1" value="20"></label>
            <label>Disc w1 (rel.)<input id="disc_w1" type="number" step="0.1" value="1"></label>
            <label>Disc d2 (nm)<input id="disc_d2" type="number" step="1" value="35"></label>
            <label>Disc w2 (rel.)<input id="disc_w2" type="number" step="0.1" value="1"></label>
          </div>
        </div>
      </div>

      <div class="control-block">
        <h2>Material & rotor</h2>
        <div class="grid">
          <label>ρ_core (kg/m³)<input id="rho_core" type="number" step="10" value="${defaultConfig.material.rhoCore}"></label>
          <label>ρ_shell (kg/m³)<input id="rho_shell" type="number" step="10" value="${defaultConfig.material.rhoShell}"></label>
          <label>t_shell (nm)<input id="t_shell" type="number" step="0.01" value="${defaultConfig.material.shellThickness_m * 1e9}"></label>
          <label>ω (rad/s)<input id="omega" type="number" step="10" value="${defaultConfig.rotor.omega}"></label>
          <label>T (K)<input id="temp" type="number" step="0.1" value="${defaultConfig.rotor.temperature}"></label>
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

    <div class="plot-row">
      <div class="plot-canvas-container">
        <canvas id="profile" width="900" height="420" aria-label="Concentration profile"></canvas>
      </div>
      <div id="plotLegend" class="plot-legend" aria-label="Plot legend"></div>
    </div>
  </main>
`

const canvas = must(document.querySelector<HTMLCanvasElement>('#profile'), 'profile canvas')
const plotLegend = must(document.querySelector<HTMLDivElement>('#plotLegend'), 'plot legend')
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
const massInspector = must(
  document.querySelector<HTMLElement>('#massInspector'),
  'mass inspector',
)
const massInspectorTitle = must(
  document.querySelector<HTMLSpanElement>('#massInspectorTitle'),
  'mass inspector title',
)
const massInspectorRows = must(
  document.querySelector<HTMLTableSectionElement>('#massInspectorRows'),
  'mass inspector rows',
)
const massInspectorClose = must(
  document.querySelector<HTMLButtonElement>('#massInspectorClose'),
  'mass inspector close',
)
const domainEl = must(document.querySelector<HTMLParagraphElement>('#domain'), 'domain readout')
const speedEl = must(document.querySelector<HTMLParagraphElement>('#speed'), 'speed readout')
const statusEl = must(document.querySelector<HTMLParagraphElement>('#status'), 'status text')
const timescaleSel = must(document.querySelector<HTMLSelectElement>('#timescale'), 'timescale select')
const showPelletToggle = must(
  document.querySelector<HTMLInputElement>('#showPellet'),
  'show pellet toggle',
)

const gradientGroups = {
  uniform: must(document.querySelector<HTMLDivElement>('.gradient-uniform'), 'gradient-uniform'),
  linearPower: must(
    document.querySelector<HTMLDivElement>('.gradient-linear-power'),
    'gradient-linear-power',
  ),
  twoStep: must(document.querySelector<HTMLDivElement>('.gradient-two-step'), 'gradient-two-step'),
}

const distGroups = {
  lognormal: must(document.querySelector<HTMLDivElement>('.dist-lognormal'), 'dist-lognormal'),
  bimodal: must(document.querySelector<HTMLDivElement>('.dist-bimodal'), 'dist-bimodal'),
  discrete: must(document.querySelector<HTMLDivElement>('.dist-discrete'), 'dist-discrete'),
}

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

function setHidden(el: HTMLElement, hidden: boolean): void {
  el.classList.toggle('hidden', hidden)
}

function updateGradientGroups(type: GradientType): void {
  setHidden(gradientGroups.uniform, type !== 'uniform')
  setHidden(gradientGroups.linearPower, !(type === 'linear' || type === 'power'))
  setHidden(gradientGroups.twoStep, type !== 'two_step')
}

function updateDistributionGroups(
  type: 'lognormal' | 'bimodal_lognormal' | 'discrete',
): void {
  setHidden(distGroups.lognormal, type !== 'lognormal')
  setHidden(distGroups.bimodal, type !== 'bimodal_lognormal')
  setHidden(distGroups.discrete, type !== 'discrete')
}

function buildGradientParams(): GradientParams {
  const type = readSelect<GradientType>('gradtype', 'linear')
  const rMin_m = readNumber('rmin', defaultConfig.gradient.rMin_m)
  const rMax_m = readNumber('rmax', defaultConfig.gradient.rMax_m)
  return {
    type,
    rMin_m,
    rMax_m,
    rhoTop: readNumber('rhotop', defaultConfig.gradient.rhoTop),
    rhoBot: readNumber('rhobot', defaultConfig.gradient.rhoBot),
    etaTop: readNumber('etatop', defaultConfig.gradient.etaTop),
    etaBot: readNumber('etabot', defaultConfig.gradient.etaBot),
    exponent: readNumber('expo', 1.0),
    rMid_m: readNumber('rmid', (rMin_m + rMax_m) / 2),
    rhoMid: readNumber('rhomid', (defaultConfig.gradient.rhoTop + defaultConfig.gradient.rhoBot) / 2),
    etaMid: readNumber('etamid', (defaultConfig.gradient.etaTop + defaultConfig.gradient.etaBot) / 2),
  }
}

function buildDistributionParams(): SizeDistributionParams {
  const type = readSelect<'lognormal' | 'bimodal_lognormal' | 'discrete'>('disttype', 'lognormal')
  if (type === 'lognormal') {
    return {
      type: 'lognormal',
      d50_nm: readNumber('d50', defaultConfig.sizeDistribution.d50_nm),
      gSigma: readNumber('gsigma', defaultConfig.sizeDistribution.gSigma),
    }
  }
  if (type === 'bimodal_lognormal') {
    return {
      type: 'bimodal_lognormal',
      d50_1_nm: readNumber('d50', defaultConfig.sizeDistribution.d50_nm),
      gSigma1: readNumber('gsigma', defaultConfig.sizeDistribution.gSigma),
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

let solver: MultiSpeciesLamm
let simTime = 0
let running = true
let timeScale: TimeScale = defaultConfig.timeScale
let showPellet = false
let showMassInspector = false
let selectedBinIndex: number | null = null

function buildSolver(): void {
  const gradParams = buildGradientParams()
  const n = Math.max(40, Math.floor(readNumber('nradial', defaultConfig.radialCells)))
  const gradient = buildGradient(gradParams, n)
  const distParams = buildDistributionParams()
  const nBins = Math.max(3, Math.floor(readNumber('nbins', defaultConfig.nBins)))
  const { radii_m, weights } = buildSizeDistribution(distParams, { nBins })

  solver = new MultiSpeciesLamm({
    rMin: gradParams.rMin_m,
    rMax: gradParams.rMax_m,
    n,
    omega: readNumber('omega', defaultConfig.rotor.omega),
    temperature: readNumber('temp', defaultConfig.rotor.temperature),
    gradient,
    aBins_m: radii_m,
    weights,
    material: {
      rhoCore: readNumber('rho_core', defaultConfig.material.rhoCore),
      rhoShell: readNumber('rho_shell', defaultConfig.material.rhoShell),
      shellThickness_m: readNumber('t_shell', defaultConfig.material.shellThickness_m * 1e9) * 1e-9,
    },
  })

  solver.setInitialTopLoad(1)
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

// set initial dropdown to default time scale
timescaleSel.value = `${defaultConfig.timeScale}`

applyBtn.addEventListener('click', () => {
  buildSolver()
})

showPelletToggle.addEventListener('change', () => {
  showPellet = showPelletToggle.checked
})

massEl.addEventListener('click', () => {
  showMassInspector = !showMassInspector
  massInspector.classList.toggle('hidden', !showMassInspector)
})

massInspectorClose.addEventListener('click', () => {
  showMassInspector = false
  massInspector.classList.add('hidden')
})

const initialGradientType = readSelect<GradientType>('gradtype', 'linear')
updateGradientGroups(initialGradientType)
const initialDistType = readSelect<'lognormal' | 'bimodal_lognormal' | 'discrete'>(
  'disttype',
  'lognormal',
)
updateDistributionGroups(initialDistType)

const gradTypeSelect = must(document.querySelector<HTMLSelectElement>('#gradtype'), 'gradtype')
gradTypeSelect.addEventListener('change', () => {
  const next = readSelect<GradientType>('gradtype', 'linear')
  updateGradientGroups(next)
})

const distTypeSelect = must(document.querySelector<HTMLSelectElement>('#disttype'), 'disttype')
distTypeSelect.addEventListener('change', () => {
  const next = readSelect<'lognormal' | 'bimodal_lognormal' | 'discrete'>('disttype', 'lognormal')
  updateDistributionGroups(next)
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

  const rMinPlot = solver.r[0]
  const rMaxFull = solver.r[solver.r.length - 1]
  const rMaxPlot = showPellet ? rMaxFull : rMinPlot + 0.99 * (rMaxFull - rMinPlot)

  const { species, total } = solver.getConcentrations()
  const visibleTotal: number[] = []
  for (let i = 0; i < total.length; i += 1) {
    if (solver.r[i] <= rMaxPlot) visibleTotal.push(total[i])
    else break
  }
  const maxC = visibleTotal.length > 0 ? Math.max(...visibleTotal) : 0
  if (maxC <= 0) return
  const xScale = (width - 2 * margin) / (rMaxPlot - rMinPlot)
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

  // x-axis ticks for plotted range
  const tickCount = 5
  const tickStep = (rMaxPlot - rMinPlot) / (tickCount - 1)
  ctx.strokeStyle = '#3a4a6a'
  ctx.fillStyle = '#9fb2d4'
  ctx.textAlign = 'center'
  ctx.font = '12px "Space Grotesk", sans-serif'
  for (let i = 0; i < tickCount; i += 1) {
    const rTick = rMinPlot + tickStep * i
    const xTick = margin + ((rTick - rMinPlot) / (rMaxPlot - rMinPlot)) * (width - 2 * margin)
    ctx.beginPath()
    ctx.moveTo(xTick, height - margin)
    ctx.lineTo(xTick, height - margin + 6)
    ctx.stroke()
    ctx.fillText(rTick.toFixed(3), xTick, height - margin + 18)
  }

  // species traces
  species.forEach((c, idx) => {
    const isSelected = selectedBinIndex === idx
    ctx.globalAlpha = selectedBinIndex === null ? 1 : isSelected ? 1 : 0.2
    ctx.lineWidth = isSelected ? 2.2 : 1.2
    ctx.beginPath()
    ctx.strokeStyle = colors[idx % colors.length]
    for (let i = 0; i < c.length; i += 1) {
      if (solver.r[i] > rMaxPlot) break
      const x = margin + (solver.r[i] - rMinPlot) * xScale
      const y = height - margin - c[i] * yScale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  })
  ctx.globalAlpha = 1
  ctx.lineWidth = 1

  // total
  ctx.beginPath()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  for (let i = 0; i < total.length; i += 1) {
    if (solver.r[i] > rMaxPlot) break
    const x = margin + (solver.r[i] - rMinPlot) * xScale
    const y = height - margin - total[i] * yScale
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  if (showPellet) {
    const lastIdx = total.length - 1
    const xPellet = margin + (solver.r[lastIdx] - rMinPlot) * xScale
    const yPellet = height - margin - total[lastIdx] * yScale
    ctx.fillStyle = '#ffea7a'
    ctx.beginPath()
    ctx.arc(xPellet, yPellet, 5, 0, 2 * Math.PI)
    ctx.fill()
    ctx.fillStyle = '#e9f1ff'
    ctx.fillText('Pellet (arb.)', xPellet + 8, yPellet - 8)
  }
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
  massEl.textContent = `Mass: ${masses.perBin.length} bins, total = ${formatMass(masses.total)} (details)`
  const pelletMass = computePelletMass(solver)
  const pelletPct =
    masses.total > 0 ? (100 * pelletMass) / masses.total : 0 // percentage of current total mass
  pelletEl.textContent = `${formatMass(pelletMass)}`
  pelletPctEl.textContent = `${pelletPct.toFixed(2)} %`

  if (showMassInspector) {
    massInspectorTitle.textContent = `Mass bins (N = ${masses.perBin.length})`
    massInspectorRows.innerHTML = ''
    const totalMass = masses.total
    for (let k = 0; k < masses.perBin.length; k += 1) {
      const row = document.createElement('tr')
      row.dataset.binIndex = `${k}`
      if (selectedBinIndex === k) {
        row.classList.add('selected')
      }
      const diameterNm = solver.aBins[k] * 2e9
      const rel = totalMass > 0 ? masses.perBin[k] / totalMass : 0
      row.innerHTML = `
        <td>${k + 1}</td>
        <td>${diameterNm.toFixed(2)}</td>
        <td>${rel.toFixed(4)}</td>
        <td>${formatMass(masses.perBin[k])}</td>
      `
      row.addEventListener('click', () => {
        selectedBinIndex = k
      })
      massInspectorRows.appendChild(row)
    }
  }
  const legendRows: string[] = []
  legendRows.push(
    '<div class="plot-legend-row"><span class="plot-legend-swatch plot-legend-total"></span><span>Total (white)</span></div>',
  )
  if (selectedBinIndex !== null) {
    const color = colors[selectedBinIndex % colors.length]
    const diameterNm = solver.aBins[selectedBinIndex] * 2e9
    legendRows.push(
      `<div class="plot-legend-row"><span class="plot-legend-swatch" style="background:${color}"></span><span>Bin ${selectedBinIndex + 1} (${diameterNm.toFixed(2)} nm)</span></div>`,
    )
  }
  plotLegend.innerHTML = `<div class="plot-legend-title">Legend (c in arb.)</div>${legendRows.join('')}`
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
