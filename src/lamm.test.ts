import { describe, expect, it } from 'vitest'
import { computeMass, createLammState, estimateStableDt, stepLamm } from './lamm'

describe('Lamm solver', () => {
  it('conserves mass with no-flux boundaries', () => {
    const params = { diffusion: 1e-3, sedimentation: 5e-4, omega: 10 }
    const state = createLammState({
      n: 160,
      rMin: 1,
      rMax: 2,
      initial: (r) => 1 + 0.2 * Math.sin(4 * Math.PI * (r - 1)),
    })
    const dt = estimateStableDt(params, state, 0.4)
    const initialMass = computeMass(state)

    for (let i = 0; i < 500; i += 1) {
      stepLamm(state, params, dt)
    }

    const finalMass = computeMass(state)
    const relativeError = Math.abs(finalMass - initialMass) / initialMass
    expect(relativeError).toBeLessThan(1e-4)
  })

  it('maintains a zero-flux steady state profile', () => {
    const params = { diffusion: 0.02, sedimentation: 0.0008, omega: 5 }
    const vPrefactor = params.sedimentation * params.omega * params.omega
    const alpha = vPrefactor / (2 * params.diffusion)
    const rMin = 1.0
    const rMax = 2.0

    const state = createLammState({
      n: 200,
      rMin,
      rMax,
      initial: (r) => Math.exp(alpha * (r * r - rMin * rMin)),
    })

    const baseline = Float64Array.from(state.c)
    const dt = estimateStableDt(params, state, 0.3)

    for (let i = 0; i < 400; i += 1) {
      stepLamm(state, params, dt)
    }

    let maxRelative = 0
    for (let i = 0; i < state.c.length; i += 1) {
      const rel = Math.abs(state.c[i] - baseline[i]) / baseline[i]
      if (rel > maxRelative) {
        maxRelative = rel
      }
    }

    expect(maxRelative).toBeLessThan(0.02)
  })
})
