/** EDM (Karras et al.) noise schedule constants used by the AF3-class diffusion module. */
export const SIGMA_MAX = 160
export const SIGMA_MIN = 4e-4
export const SIGMA_RHO = 7
export const DIFFUSION_STEPS = 200

/**
 * Approximate noise level σ at a given sampler step (0 → σ_max, 200 → σ_min).
 * σ_i = (σ_max^{1/ρ} + i/N · (σ_min^{1/ρ} − σ_max^{1/ρ}))^ρ
 */
export function diffusionSigma(step: number, totalSteps: number = DIFFUSION_STEPS): number {
  const t = Math.min(1, Math.max(0, totalSteps > 0 ? step / totalSteps : 0))
  const maxInv = SIGMA_MAX ** (1 / SIGMA_RHO)
  const minInv = SIGMA_MIN ** (1 / SIGMA_RHO)
  return (maxInv + t * (minInv - maxInv)) ** SIGMA_RHO
}

/** Human-friendly σ formatting: 160.0, 12.4, 0.83, 0.0004 */
export function formatSigma(sigma: number): string {
  if (sigma >= 100) return sigma.toFixed(1)
  if (sigma >= 10) return sigma.toFixed(1)
  if (sigma >= 1) return sigma.toFixed(2)
  if (sigma >= 0.01) return sigma.toFixed(3)
  return sigma.toFixed(4)
}
