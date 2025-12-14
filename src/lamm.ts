export interface LammParams {
  diffusion: number
  sedimentation: number
  omega: number
}

export interface LammConfig {
  n: number
  rMin: number
  rMax: number
  initial: (r: number) => number
}

export interface LammState {
  r: Float64Array
  rFaces: Float64Array
  c: Float64Array
  dr: number
}

export function createLammState(config: LammConfig): LammState {
  const dr = (config.rMax - config.rMin) / config.n
  const r = new Float64Array(config.n)
  const rFaces = new Float64Array(config.n + 1)
  const c = new Float64Array(config.n)

  for (let i = 0; i <= config.n; i += 1) {
    rFaces[i] = config.rMin + i * dr
  }

  for (let i = 0; i < config.n; i += 1) {
    const center = config.rMin + (i + 0.5) * dr
    r[i] = center
    c[i] = Math.max(0, config.initial(center))
  }

  return { r, rFaces, c, dr }
}

/**
 * Explicit conservative finite-volume step for the 1D Lamm equation.
 * Flux uses centered diffusion and upwind advection; boundaries impose zero flux.
 */
export function stepLamm(state: LammState, params: LammParams, dt: number): void {
  const { c, r, rFaces, dr } = state
  const n = c.length
  const flux = new Float64Array(n + 1)
  const vPrefactor = params.sedimentation * params.omega * params.omega

  flux[0] = 0
  flux[n] = 0

  for (let i = 1; i < n; i += 1) {
    const cL = c[i - 1]
    const cR = c[i]
    const faceR = rFaces[i]
    const grad = (cR - cL) / dr
    const diffusive = -params.diffusion * grad
    const velocity = vPrefactor * faceR
    const advective = velocity >= 0 ? velocity * cL : velocity * cR
    flux[i] = diffusive + advective
  }

  const next = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const inflow = rFaces[i] * flux[i]
    const outflow = rFaces[i + 1] * flux[i + 1]
    const net = (inflow - outflow) / (r[i] * dr)
    const updated = c[i] + dt * net
    next[i] = updated > 0 ? updated : 0
  }

  state.c.set(next)
}

export function computeMass(state: LammState): number {
  let total = 0
  for (let i = 0; i < state.c.length; i += 1) {
    total += state.r[i] * state.c[i] * state.dr
  }
  return total
}

export function estimateStableDt(params: LammParams, state: LammState, safety = 0.5): number {
  const vPrefactor = params.sedimentation * params.omega * params.omega
  const dr = state.dr
  const diffLimit =
    params.diffusion > 0 ? (dr * dr) / (2 * params.diffusion) : Number.POSITIVE_INFINITY
  const maxR = state.rFaces[state.rFaces.length - 1]
  const advLimit =
    vPrefactor !== 0 ? dr / Math.max(1e-12, Math.abs(vPrefactor * maxR)) : Number.POSITIVE_INFINITY
  const base = Math.min(diffLimit, advLimit)
  if (!Number.isFinite(base)) {
    return Number.POSITIVE_INFINITY
  }
  return safety * base
}
