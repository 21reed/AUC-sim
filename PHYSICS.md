# PHYSICS.md

## Multi-bin Lamm equation (1D radial)
For each size bin `k`, the concentration field `c_k(r,t)` obeys

```
∂c_k/∂t = -(1/r) ∂[ r j_k ]/∂r
j_k = -D_k(r) ∂c_k/∂r + v_k(r) c_k
```

No-flux walls enforce `j_k(r_min)=j_k(r_max)=0`. The conserved quantity per bin is `M_k = ∫ r c_k dr`; total mass is `Σ_k M_k`.

### Conservative form
Define `q_k = r c_k` and `F_k = r j_k`, giving `∂q_k/∂t = -∂F_k/∂r`. We discretize `q_k` on a uniform finite-volume grid with width `Δr`, centers `r_i`, faces `r_{i±1/2}`:

```
q_i^{n+1} = q_i^n - (Δt/Δr)(F_{i+1/2} - F_{i-1/2})
c_i = q_i / r_i
```

Interior face flux uses centered diffusion and upwind advection with r- and size-dependent transport:

```
D_{i+1/2} = 0.5 (D_i + D_{i+1})
v_{i+1/2} = 0.5 (v_i + v_{i+1})
j_{i+1/2} = -D_{i+1/2}(c_{i+1}-c_i)/Δr + v_{i+1/2} c_upwind
F_{i+1/2} = r_{i+1/2} j_{i+1/2}
```

Boundary faces set `F=0` exactly (no ghost cells). No clamping is applied; positivity relies on a stable `Δt`.

### Hydrodynamics per bin
Particle radii `a_k` (geometric ≈ hydrodynamic). For shell thickness `t_shell`:

```
a_core = max(a_k - t_shell, 0)
V_core = 4/3 π a_core³
V_tot  = 4/3 π a_k³
ρ_eff  = (ρ_core V_core + ρ_shell_eff (V_tot - V_core)) / V_tot
Δρ(r)  = ρ_eff - ρ(r)
f(r)   = 6π η(r) a_k
D_k(r) = k_B T / f(r)
v_k(r) = Δρ(r) V_tot ω² r / f(r)
```

Gradients `ρ(r)`, `η(r)` come from parametric profiles (uniform, linear, power, two_step) sampled on the same radial grid.

### Size distributions (parametric only)
Size bins are generated procedurally (no CSVs): lognormal, bimodal lognormal, or discrete mixtures expanded over `nBins`. UI values are in nm; the solver uses SI (meters).

### Stability (explicit)
Global timestep constraint (applied over all bins `k` and cells `i`):

```
Δt_stable = safety · min( Δr²/(2 D_k[i]) , Δr/|v_k[i]| )
```

Typical safety 0.2–0.4. The animation loop requests a target `ΔT`; the solver advances via repeated small steps up to that budget.

### Steady/isopycnic behavior
Where `Δρ` changes sign, an isopycnic radius exists; advection drives material toward that radius while diffusion broadens the band. Uniform-fluid and diffusion-only limits reduce to the classical Lamm behavior with conserved mass. No CSV inputs are used—only parametric gradients and distributions.
