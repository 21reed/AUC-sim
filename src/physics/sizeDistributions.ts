// Parametric size distributions in diameter space -> bin radii and weights.
// See DOCS.md for supported types and intended usage.
export type SizeDistributionType = 'lognormal' | 'bimodal_lognormal' | 'discrete'

export interface LognormalParams {
  type: 'lognormal'
  d50_nm: number
  gSigma: number
  minDiameter_nm?: number
  maxDiameter_nm?: number
}

export interface BimodalLognormalParams {
  type: 'bimodal_lognormal'
  d50_1_nm: number
  gSigma1: number
  weight1: number
  d50_2_nm: number
  gSigma2: number
  weight2: number
  minDiameter_nm?: number
  maxDiameter_nm?: number
}

export interface DiscreteParams {
  type: 'discrete'
  entries: Array<{
    diameter_nm: number
    weight: number
    width_nm?: number
  }>
  minDiameter_nm?: number
  maxDiameter_nm?: number
}

export type SizeDistributionParams = LognormalParams | BimodalLognormalParams | DiscreteParams

export interface BuiltSizeDistribution {
  radii_m: Float64Array
  weights: Float64Array
}

function linspace(start: number, end: number, n: number): Float64Array {
  const arr = new Float64Array(n)
  const step = (end - start) / (n - 1)
  for (let i = 0; i < n; i += 1) {
    arr[i] = start + i * step
  }
  return arr
}

function normalize(weights: Float64Array): void {
  let sum = 0
  for (let i = 0; i < weights.length; i += 1) {
    if (Number.isFinite(weights[i]) && weights[i] > 0) {
      sum += weights[i]
    } else {
      weights[i] = 0
    }
  }
  if (sum === 0) {
    const uniform = 1 / weights.length
    for (let i = 0; i < weights.length; i += 1) {
      weights[i] = uniform
    }
    return
  }
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] /= sum
  }
}

function clampDiameter(d: number, min?: number, max?: number): number {
  let out = d
  if (min !== undefined) {
    out = Math.max(out, min)
  }
  if (max !== undefined) {
    out = Math.min(out, max)
  }
  return out
}

function lognormalPdf(x: number, median: number, gSigma: number): number {
  if (x <= 0) return 0
  const sigma = Math.log(gSigma)
  const mu = Math.log(median)
  const coeff = 1 / (x * sigma * Math.sqrt(2 * Math.PI))
  const exponent = -((Math.log(x) - mu) ** 2) / (2 * sigma * sigma)
  return coeff * Math.exp(exponent)
}

function buildLognormal(
  params: LognormalParams | BimodalLognormalParams,
  nBins: number,
): { diameters_nm: Float64Array; weights: Float64Array } {
  const baseMin =
    params.type === 'lognormal'
      ? params.d50_nm * 0.25
      : Math.min(params.d50_1_nm, params.d50_2_nm) * 0.25
  const baseMax =
    params.type === 'lognormal'
      ? params.d50_nm * 4
      : Math.max(params.d50_1_nm, params.d50_2_nm) * 4
  const min = params.minDiameter_nm ?? baseMin
  const max = params.maxDiameter_nm ?? baseMax
  const diameters_nm = linspace(min, max, nBins)
  const weights = new Float64Array(nBins)

  for (let i = 0; i < nBins; i += 1) {
    if (params.type === 'lognormal') {
      const val = lognormalPdf(diameters_nm[i], params.d50_nm, params.gSigma)
      weights[i] = Number.isFinite(val) ? val : 0
    } else {
      const p1 =
        lognormalPdf(diameters_nm[i], params.d50_1_nm, params.gSigma1) * params.weight1
      const p2 =
        lognormalPdf(diameters_nm[i], params.d50_2_nm, params.gSigma2) * params.weight2
      const val = p1 + p2
      weights[i] = Number.isFinite(val) ? val : 0
    }
  }

  normalize(weights)
  return { diameters_nm, weights }
}

function buildDiscrete(params: DiscreteParams, nBins: number): {
  diameters_nm: Float64Array
  weights: Float64Array
} {
  const entries = params.entries.slice(0, Math.max(1, Math.min(params.entries.length, 5)))
  let min = params.minDiameter_nm
  let max = params.maxDiameter_nm
  for (const entry of entries) {
    min = min === undefined ? entry.diameter_nm : Math.min(min, entry.diameter_nm)
    max = max === undefined ? entry.diameter_nm : Math.max(max, entry.diameter_nm)
  }
  if (min === undefined || max === undefined) {
    min = 1
    max = 10
  }
  const diameters_nm = linspace(min, max, nBins)
  const weights = new Float64Array(nBins)
  const widthDefault = (max - min) * 0.02

  for (const entry of entries) {
    const width = entry.width_nm ?? widthDefault
    const sigma = width / 2.355
    for (let i = 0; i < nBins; i += 1) {
      const x = diameters_nm[i]
      const coeff = 1 / (sigma * Math.sqrt(2 * Math.PI))
      const exponent = -((x - entry.diameter_nm) ** 2) / (2 * sigma * sigma)
      const contribution = entry.weight * coeff * Math.exp(exponent)
      if (Number.isFinite(contribution)) {
        weights[i] += contribution
      }
    }
  }

  normalize(weights)
  return { diameters_nm, weights }
}

// Build bin radii (m) and normalized weights from a parametric distribution.
export function buildSizeDistribution(
  params: SizeDistributionParams,
  options: { nBins: number },
): BuiltSizeDistribution {
  const nBins = Math.max(3, options.nBins)
  let diameters_nm: Float64Array
  let weights: Float64Array

  if (params.type === 'lognormal' || params.type === 'bimodal_lognormal') {
    ;({ diameters_nm, weights } = buildLognormal(params, nBins))
  } else {
    ;({ diameters_nm, weights } = buildDiscrete(params, nBins))
  }

  for (let i = 0; i < diameters_nm.length; i += 1) {
    diameters_nm[i] = clampDiameter(
      diameters_nm[i],
      params.minDiameter_nm,
      params.maxDiameter_nm,
    )
  }

  const radii_m = new Float64Array(diameters_nm.length)
  for (let i = 0; i < radii_m.length; i += 1) {
    radii_m[i] = (diameters_nm[i] * 1e-9) / 2
  }

  return { radii_m, weights }
}
