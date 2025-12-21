import type { GradientProfile } from './gradient'

const KB = 1.380649e-23
const PI = Math.PI

export interface MaterialParams {
  rhoCore: number
  rhoShell: number
  shellThickness_m: number
}

export interface MultiSpeciesConfig {
  rMin: number
  rMax: number
  n: number
  omega: number
  temperature: number
  gradient: GradientProfile
  aBins_m: Float64Array
  weights: Float64Array
  material: MaterialParams
}

export interface AdvanceResult {
  advanced: number
  steps: number
}

export class MultiSpeciesLamm {
  readonly r: Float64Array
  readonly rFaces: Float64Array
  readonly dr: number
  readonly aBins: Float64Array
  readonly weights: Float64Array
  readonly q: Array<Float64Array>
  readonly D: Array<Float64Array>
  readonly v: Array<Float64Array>
  readonly deltaRho: Array<Float64Array>
  private readonly omega: number
  private readonly temperature: number
  private readonly material: MaterialParams
  private gradient: GradientProfile

  constructor(config: MultiSpeciesConfig) {
    this.omega = config.omega
    this.temperature = config.temperature
    this.material = config.material
    this.gradient = config.gradient
    const n = config.n
    this.dr = (config.rMax - config.rMin) / n
    this.r = new Float64Array(n)
    this.rFaces = new Float64Array(n + 1)
    for (let i = 0; i <= n; i += 1) {
      this.rFaces[i] = config.rMin + i * this.dr
      if (i < n) {
        this.r[i] = config.rMin + (i + 0.5) * this.dr
      }
    }

    this.aBins = new Float64Array(config.aBins_m.length)
    this.weights = new Float64Array(config.weights.length)
    this.q = []
    this.D = []
    this.v = []
    this.deltaRho = []
    for (let k = 0; k < config.aBins_m.length; k += 1) {
      this.aBins[k] = config.aBins_m[k]
      this.weights[k] = config.weights[k]
      this.q.push(new Float64Array(n))
      this.D.push(new Float64Array(n))
      this.v.push(new Float64Array(n))
      this.deltaRho.push(new Float64Array(n))
    }
    this.normalizeWeights()
    this.refreshHydrodynamics()
  }

  private normalizeWeights(): void {
    let sum = 0
    for (let i = 0; i < this.weights.length; i += 1) {
      sum += this.weights[i]
    }
    if (sum === 0) {
      const val = 1 / this.weights.length
      for (let i = 0; i < this.weights.length; i += 1) {
        this.weights[i] = val
      }
      return
    }
    for (let i = 0; i < this.weights.length; i += 1) {
      this.weights[i] /= sum
    }
  }

  setGradient(gradient: GradientProfile): void {
    this.gradient = gradient
    this.refreshHydrodynamics()
  }

  private effectiveDensity(a: number): number {
    const aCore = Math.max(a - this.material.shellThickness_m, 0)
    const vCore = (4 / 3) * PI * aCore * aCore * aCore
    const vTot = (4 / 3) * PI * a * a * a
    if (vTot === 0) return 0
    return (
      (this.material.rhoCore * vCore +
        this.material.rhoShell * (vTot - vCore)) /
      vTot
    )
  }

  private refreshHydrodynamics(): void {
    for (let k = 0; k < this.aBins.length; k += 1) {
      const a = this.aBins[k]
      const vTot = (4 / 3) * PI * a * a * a
      const rhoEff = this.effectiveDensity(a)
      for (let i = 0; i < this.r.length; i += 1) {
        const rhoLocal = this.gradient.rho[i]
        const etaLocal = this.gradient.eta[i]
        const delta = rhoEff - rhoLocal
        const friction = 6 * PI * etaLocal * a
        const diff = friction > 0 ? (KB * this.temperature) / friction : 0
        const vel =
          friction > 0 ? (delta * vTot * this.omega * this.omega * this.r[i]) / friction : 0
        this.D[k][i] = Number.isFinite(diff) ? diff : 0
        this.v[k][i] = Number.isFinite(vel) ? vel : 0
        this.deltaRho[k][i] = Number.isFinite(delta) ? delta : 0
      }
    }
  }

  // Initializes using an arbitrary radial profile; mass per bin scales with weights.
  setInitialConcentrations(profile: (r: number) => number): void {
    for (let k = 0; k < this.q.length; k += 1) {
      const weight = this.weights[k]
      for (let i = 0; i < this.r.length; i += 1) {
        const raw = profile(this.r[i]) * weight
        const c = Number.isFinite(raw) && raw > 0 ? raw : 0
        this.q[k][i] = this.r[i] * c
      }
    }
  }

  // Loads all size bins into the very top of the tube (first cell), preserving per-bin weights.
  setInitialTopLoad(cells: number = 1): void {
    const cellCount = Math.max(1, Math.min(cells, this.r.length))
    for (let k = 0; k < this.q.length; k += 1) {
      this.q[k].fill(0)
      const massPerBin = this.weights[k] // mass proportional to weight
      const share = massPerBin / cellCount
      for (let i = 0; i < cellCount; i += 1) {
        // q = r*c; to yield mass share*dr, set q = share/dr → c = (share/dr)/r
        const cVal = share / (this.dr * this.r[i])
        this.q[k][i] = this.r[i] * cVal
      }
    }
  }

  getConcentrations(): { species: Array<Float64Array>; total: Float64Array } {
    const total = new Float64Array(this.r.length)
    const species: Array<Float64Array> = []
    for (let k = 0; k < this.q.length; k += 1) {
      const c = new Float64Array(this.r.length)
      for (let i = 0; i < this.r.length; i += 1) {
        const val = this.q[k][i] / this.r[i]
        c[i] = val
        total[i] += val
      }
      species.push(c)
    }
    return { species, total }
  }

  computeMasses(): { perBin: Float64Array; total: number } {
    const perBin = new Float64Array(this.q.length)
    let total = 0
    for (let k = 0; k < this.q.length; k += 1) {
      let m = 0
      for (let i = 0; i < this.r.length; i += 1) {
        m += this.q[k][i] * this.dr
      }
      perBin[k] = m
      total += m
    }
    return { perBin, total }
  }

  isopycnicRadiusForBin(binIndex: number): number | null {
    const deltas = this.deltaRho[binIndex]
    for (let i = 1; i < deltas.length; i += 1) {
      const prev = deltas[i - 1]
      const curr = deltas[i]
      if (prev === 0) return this.r[i - 1]
      if (curr === 0) return this.r[i]
      if ((prev < 0 && curr > 0) || (prev > 0 && curr < 0)) {
        const t = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr))
        return this.r[i - 1] * (1 - t) + this.r[i] * t
      }
    }
    return null
  }

  computeStableDt(safety = 0.3): number {
    let dt = Number.POSITIVE_INFINITY
    for (let k = 0; k < this.q.length; k += 1) {
      for (let i = 0; i < this.r.length; i += 1) {
        const diff = this.D[k][i]
        const vel = this.v[k][i]
        if (Number.isFinite(diff) && diff > 0) {
          dt = Math.min(dt, (this.dr * this.dr) / (2 * diff))
        }
        if (Number.isFinite(vel) && vel !== 0) {
          dt = Math.min(dt, this.dr / Math.abs(vel))
        }
      }
    }
    if (!Number.isFinite(dt)) {
      return safety > 0 ? safety : 1
    }
    return safety * dt
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return
    const n = this.r.length
    const qNext = this.q.map(() => new Float64Array(n))

    for (let k = 0; k < this.q.length; k += 1) {
      const c = new Float64Array(n)
      for (let i = 0; i < n; i += 1) {
        c[i] = this.q[k][i] / this.r[i]
      }

      const flux = new Float64Array(n + 1)
      flux[0] = 0
      flux[n] = 0

      for (let i = 1; i < n; i += 1) {
        const cL = c[i - 1]
        const cR = c[i]
        const grad = (cR - cL) / this.dr
        const dFaceRaw = 0.5 * (this.D[k][i - 1] + this.D[k][i])
        const vFaceRaw = 0.5 * (this.v[k][i - 1] + this.v[k][i])
        const dFace = Number.isFinite(dFaceRaw) ? dFaceRaw : 0
        const vFace = Number.isFinite(vFaceRaw) ? vFaceRaw : 0
        const diffusive = -dFace * grad
        const advective = vFace >= 0 ? vFace * cL : vFace * cR
        flux[i] = this.rFaces[i] * (diffusive + advective)
      }

      for (let i = 0; i < n; i += 1) {
        const net = (flux[i + 1] - flux[i]) / this.dr
        qNext[k][i] = this.q[k][i] - dt * net
      }
    }

    for (let k = 0; k < this.q.length; k += 1) {
      this.q[k].set(qNext[k])
    }
  }

  advanceBy(totalDt: number, maxSteps: number): AdvanceResult {
    let advanced = 0
    let steps = 0
    while (advanced < totalDt && steps < maxSteps) {
      const dtStable = this.computeStableDt()
      if (!Number.isFinite(dtStable) || dtStable <= 0) {
        break
      }
      const dt = Math.min(dtStable, totalDt - advanced)
      this.step(dt)
      advanced += dt
      steps += 1
    }
    return { advanced, steps }
  }
}
