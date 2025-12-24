// Solvent gradient profiles for ρ(r), η(r) on the solver grid.
// see PHYSICS.md / DOCS.md.
export type GradientType = 'uniform' | 'linear' | 'power' | 'two_step'

export interface GradientParams {
  type: GradientType
  rMin_m: number
  rMax_m: number
  rhoTop: number
  rhoBot: number
  etaTop: number
  etaBot: number
  exponent?: number
  rMid_m?: number
  rhoMid?: number
  etaMid?: number
}

export interface GradientProfile {
  rho: Float64Array
  eta: Float64Array
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

// Build ρ(r), η(r) on cell centers for a uniform radial grid.
export function buildGradient(params: GradientParams, nRadial: number): GradientProfile {
  const rho = new Float64Array(nRadial)
  const eta = new Float64Array(nRadial)
  const { rMin_m, rMax_m } = params
  const dr = (rMax_m - rMin_m) / nRadial

  for (let i = 0; i < nRadial; i += 1) {
    const r = rMin_m + (i + 0.5) * dr
    const xi = clamp01((r - rMin_m) / (rMax_m - rMin_m))
    if (params.type === 'uniform') {
      rho[i] = params.rhoTop
      eta[i] = params.etaTop
    } else if (params.type === 'linear') {
      rho[i] = lerp(params.rhoTop, params.rhoBot, xi)
      eta[i] = lerp(params.etaTop, params.etaBot, xi)
    } else if (params.type === 'power') {
      const p = params.exponent ?? 1
      const t = xi ** p
      rho[i] = lerp(params.rhoTop, params.rhoBot, t)
      eta[i] = lerp(params.etaTop, params.etaBot, t)
    } else if (params.type === 'two_step') {
      const rMid = params.rMid_m ?? (params.rMin_m + params.rMax_m) / 2
      const midXi = clamp01((rMid - rMin_m) / (rMax_m - rMin_m))
      const xiLower = midXi > 0 ? Math.min(xi / midXi, 1) : 0
      const xiUpper = midXi < 1 ? clamp01((xi - midXi) / (1 - midXi)) : 1
      const rhoMid = params.rhoMid ?? lerp(params.rhoTop, params.rhoBot, midXi)
      const etaMid = params.etaMid ?? lerp(params.etaTop, params.etaBot, midXi)
      if (xi <= midXi) {
        rho[i] = lerp(params.rhoTop, rhoMid, xiLower)
        eta[i] = lerp(params.etaTop, etaMid, xiLower)
      } else {
        rho[i] = lerp(rhoMid, params.rhoBot, xiUpper)
        eta[i] = lerp(etaMid, params.etaBot, xiUpper)
      }
    }
  }

  return { rho, eta }
}
