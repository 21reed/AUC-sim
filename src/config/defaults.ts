import type { GradientParams } from '../physics/gradient'
import type { LognormalParams } from '../physics/sizeDistributions'
import type { MaterialParams } from '../physics/multiLamm'

export interface RotorParams {
  omega: number
  temperature: number
}

export interface DefaultConfig {
  radialCells: number
  gradient: GradientParams
  sizeDistribution: LognormalParams
  nBins: number
  material: MaterialParams
  rotor: RotorParams
  timeScale: TimeScale
}

export type TimeScale = 1 | 10 | 100 | 1000 | 10000

export const defaultGradient: GradientParams = {
  type: 'linear',
  rMin_m: 0.0674,
  rMax_m: 0.1531,
  rhoTop: 780,
  rhoBot: 1426,
  etaTop: 0.000751,
  etaBot: 0.000694,
}

export const defaultSizeDistribution: LognormalParams = {
  type: 'lognormal',
  d50_nm: 7.82,
  gSigma: 1.5,
}

export const defaultMaterial: MaterialParams = {
  rhoCore: 2330,
  rhoShell: 1050,
  shellThickness_m: 1.66e-9,
}

export const defaultRotor: RotorParams = {
  omega: 3141.6,
  temperature: 274.15,
}

export const defaultConfig: DefaultConfig = {
  radialCells: 180,
  gradient: defaultGradient,
  sizeDistribution: defaultSizeDistribution,
  nBins: 100,
  material: defaultMaterial,
  rotor: defaultRotor,
  timeScale: 1000 as TimeScale,
}
