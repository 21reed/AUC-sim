import { describe, expect, it } from 'vitest'
import { buildGradient } from './physics/gradient'
import { MultiSpeciesLamm } from './physics/multiLamm'
import { buildSizeDistribution } from './physics/sizeDistributions'

function gaussianProfile(rMin: number, rMax: number): (r: number) => number {
  const center = rMin + 0.2 * (rMax - rMin)
  const sigma = 0.05 * (rMax - rMin)
  return (r: number) => Math.exp(-((r - center) ** 2) / (2 * sigma * sigma))
}

function setupSolver() {
  const rMin = 0.05
  const rMax = 0.065
  const n = 120
  const gradient = buildGradient(
    { type: 'uniform', rMin_m: rMin, rMax_m: rMax, rhoTop: 1050, rhoBot: 1050, etaTop: 0.001, etaBot: 0.001 },
    n,
  )
  const dist = buildSizeDistribution(
    { type: 'bimodal_lognormal', d50_1_nm: 18, gSigma1: 1.3, weight1: 0.6, d50_2_nm: 32, gSigma2: 1.5, weight2: 0.4 },
    { nBins: 5 },
  )
  expect(dist.weights.length).toBeGreaterThan(0)
  const weightMax = Math.max(...Array.from(dist.weights))
  expect(weightMax).toBeGreaterThan(0)
  const weightSum = dist.weights.reduce((s, w) => s + w, 0)
  expect(Number.isFinite(weightSum)).toBe(true)
  expect(weightSum).toBeGreaterThan(0)
  const solver = new MultiSpeciesLamm({
    rMin,
    rMax,
    n,
    omega: 25000,
    temperature: 293,
    gradient,
    aBins_m: dist.radii_m,
    weights: dist.weights,
    material: { rhoCore: 2200, rhoShell: 1050, shellThickness_m: 2e-9 },
  })
  solver.setInitialConcentrations(gaussianProfile(rMin, rMax))
  return solver
}

describe('MultiSpeciesLamm', () => {
  it('conserves mass per species and in total under no-flux boundaries', () => {
    const solver = setupSolver()
    const initial = solver.computeMasses()
    const dt = solver.computeStableDt(0.25)
    expect(Number.isFinite(dt)).toBe(true)
    expect(initial.total).toBeGreaterThan(0)

    for (let step = 0; step < 300; step += 1) {
      solver.step(dt)
    }

    const final = solver.computeMasses()
    const relDriftTotal = Math.abs(final.total - initial.total) / initial.total
    expect(relDriftTotal).toBeLessThan(1e-4)
    for (let k = 0; k < initial.perBin.length; k += 1) {
      const rel = Math.abs(final.perBin[k] - initial.perBin[k]) / initial.perBin[k]
      expect(rel).toBeLessThan(1e-4)
    }
  })

  it('maintains non-negativity within numerical tolerance', () => {
    const solver = setupSolver()
    const dt = solver.computeStableDt(0.2)
    for (let step = 0; step < 200; step += 1) {
      solver.step(dt)
    }
    const { species } = solver.getConcentrations()
    for (const c of species) {
      const min = Math.min(...c)
      expect(min).toBeGreaterThan(-1e-10)
    }
  })

  it('drifts toward the isopycnic radius then slows near it', () => {
    const rMin = 0.05
    const rMax = 0.07
    const gradient = buildGradient(
      { type: 'linear', rMin_m: rMin, rMax_m: rMax, rhoTop: 1020, rhoBot: 1200, etaTop: 0.001, etaBot: 0.001 },
      160,
    )
    const dist = buildSizeDistribution(
      { type: 'discrete', entries: [{ diameter_nm: 26, weight: 1 }] },
      { nBins: 1 },
    )
    const material = { rhoCore: 1200, rhoShell: 1020, shellThickness_m: 3e-9 }
    const solver = new MultiSpeciesLamm({
      rMin,
      rMax,
      n: 160,
      omega: 22000,
      temperature: 293,
      gradient,
      aBins_m: dist.radii_m,
      weights: dist.weights,
      material,
    })
    solver.setInitialConcentrations((r) => Math.exp(-((r - rMin) ** 2) / (2 * (0.002 ** 2))))

    const target = solver.isopycnicRadiusForBin(0)
    expect(target).not.toBeNull()
    const dt = solver.computeStableDt(0.2)
    for (let step = 0; step < 2000; step += 1) {
      solver.step(dt)
    }
    const { species } = solver.getConcentrations()
    const c = species[0]
    let mass = 0
    let centroid = 0
    for (let i = 0; i < solver.r.length; i += 1) {
      const m = solver.r[i] * c[i] * solver.dr
      mass += m
      centroid += solver.r[i] * m
    }
    centroid /= mass
    expect(Math.abs(centroid - (target ?? centroid))).toBeLessThan(5e-4)
  })

  it('handles diffusion-only limit without advection drift', () => {
    const rMin = 0.04
    const rMax = 0.06
    const gradient = buildGradient(
      { type: 'uniform', rMin_m: rMin, rMax_m: rMax, rhoTop: 1050, rhoBot: 1050, etaTop: 0.001, etaBot: 0.001 },
      120,
    )
    const dist = buildSizeDistribution({ type: 'lognormal', d50_nm: 20, gSigma: 1.2 }, { nBins: 4 })
    const material = { rhoCore: 1050, rhoShell: 1050, shellThickness_m: 0 }
    const solver = new MultiSpeciesLamm({
      rMin,
      rMax,
      n: 120,
      omega: 18000,
      temperature: 298,
      gradient,
      aBins_m: dist.radii_m,
      weights: dist.weights,
      material,
    })
    solver.setInitialConcentrations((r) => Math.exp(-((r - 0.045) ** 2) / (2 * (0.0015 ** 2))))
    const initialMass = solver.computeMasses().total
    const dt = solver.computeStableDt(0.25)
    for (let step = 0; step < 400; step += 1) {
      solver.step(dt)
    }
    const masses = solver.computeMasses()
    const rel = Math.abs(masses.total - initialMass) / initialMass
    expect(rel).toBeLessThan(1e-4)
  })

  it('advanceBy matches repeated small steps', () => {
    const solverA = setupSolver()
    const solverB = setupSolver()
    const dtBase = solverA.computeStableDt(0.3)
    const dtSeg = dtBase
    const segments = 20
    const totalT = dtSeg * segments
    for (let i = 0; i < segments; i += 1) {
      solverA.advanceBy(dtSeg, 5000)
    }
    const result = solverB.advanceBy(totalT, 5000)
    expect(result.advanced).toBeCloseTo(totalT, totalT * 1e-6)
    const concA = solverA.getConcentrations().total
    const concB = solverB.getConcentrations().total
    let maxRel = 0
    for (let i = 0; i < concA.length; i += 1) {
      const diff = Math.abs(concA[i] - concB[i])
      const scale = Math.max(Math.abs(concA[i]), Math.abs(concB[i]), 1e-12)
      const rel = diff / scale
      if (rel > maxRel) maxRel = rel
    }
    expect(maxRel).toBeLessThan(1e-6)
  })

  it('advances proportionally to requested timeScale', () => {
    const solver1 = setupSolver()
    const solver10 = setupSolver()
    const dtStable = solver1.computeStableDt(0.25)
    const wallDt = dtStable * 0.2
    const frames = 30
    let sim1 = 0
    let sim10 = 0
    for (let f = 0; f < frames; f += 1) {
      sim1 += solver1.advanceBy(wallDt * 1, 5000).advanced
      sim10 += solver10.advanceBy(wallDt * 10, 5000).advanced
    }
    const expected = sim1 * 10
    const relDiff = Math.abs(sim10 - expected) / expected
    expect(relDiff).toBeLessThan(1e-6)
  })
})
