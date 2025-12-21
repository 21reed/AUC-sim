import { describe, expect, it } from 'vitest'
import { buildGradient } from './physics/gradient'
import { buildSizeDistribution } from './physics/sizeDistributions'
import { defaultConfig } from './config/defaults'

describe('defaultConfig', () => {
  it('builds gradient with expected endpoints and length', () => {
    const grad = buildGradient(defaultConfig.gradient, defaultConfig.radialCells)
    expect(grad.rho.length).toBe(defaultConfig.radialCells)
    expect(grad.eta.length).toBe(defaultConfig.radialCells)
    const { rMin_m, rMax_m, rhoTop, rhoBot, etaTop, etaBot } = defaultConfig.gradient
    const dr = (rMax_m - rMin_m) / defaultConfig.radialCells
    const xiTop = (rMin_m + 0.5 * dr - rMin_m) / (rMax_m - rMin_m)
    const xiBot =
      (rMin_m + (defaultConfig.radialCells - 0.5) * dr - rMin_m) / (rMax_m - rMin_m)
    const rhoExpectedTop = rhoTop + (rhoBot - rhoTop) * xiTop
    const rhoExpectedBot = rhoTop + (rhoBot - rhoTop) * xiBot
    const etaExpectedTop = etaTop + (etaBot - etaTop) * xiTop
    const etaExpectedBot = etaTop + (etaBot - etaTop) * xiBot
    expect(grad.rho[0]).toBeCloseTo(rhoExpectedTop, 6)
    expect(grad.rho[grad.rho.length - 1]).toBeCloseTo(rhoExpectedBot, 6)
    expect(grad.eta[0]).toBeCloseTo(etaExpectedTop, 8)
    expect(grad.eta[grad.eta.length - 1]).toBeCloseTo(etaExpectedBot, 8)
  })

  it('builds size distribution with expected bin count and D50 scale', () => {
    const dist = buildSizeDistribution(defaultConfig.sizeDistribution, { nBins: defaultConfig.nBins })
    expect(dist.radii_m.length).toBe(defaultConfig.nBins)
    const diameters = Array.from(dist.radii_m, (r) => r * 2 * 1e9)
    const closest = diameters.reduce((prev, curr) =>
      Math.abs(curr - defaultConfig.sizeDistribution.d50_nm) <
      Math.abs(prev - defaultConfig.sizeDistribution.d50_nm)
        ? curr
        : prev,
    diameters[0])
    expect(closest).toBeLessThan(2 * defaultConfig.sizeDistribution.d50_nm)
    const weightSum = dist.weights.reduce((s, w) => s + w, 0)
    expect(weightSum).toBeCloseTo(1, 6)
  })
})
