# PHYSICS.md

## Single-species 1D Lamm equation

We model a dilute, single-species solution in a spinning cell using the radial Lamm equation in conservative form:

∂c/∂t = - (1/r) ∂[ r j ]/∂r

csharp
Copy code

with flux

j(r,t) = -D ∂c/∂r + v(r) c
v(r) = s ω² r

markdown
Copy code

where:
- `c(r,t)` is concentration
- `D` is diffusion coefficient (m²/s)
- `s` is sedimentation coefficient (s)
- `ω` is angular speed (rad/s)

### Boundary conditions (no-flux)
No-flux walls impose:

j(r_min,t) = 0
j(r_max,t) = 0

csharp
Copy code

Important: this is not equivalent to `∂c/∂r = 0` in general.

### Conserved quantity
Define the conserved radial mass:

M = ∫_{r_min}^{r_max} r c(r,t) dr

perl
Copy code

A conservative discretization should preserve `M` up to time-integration error.

## Conservative variable and flux

Define:

q(r,t) = r c(r,t)
F(r,t) = r j(r,t)

css
Copy code

Then the PDE becomes a 1D conservation law:

∂q/∂t = - ∂F/∂r

go
Copy code

We evolve `q` conservatively and recover `c = q/r` at cell centers.

## Discretisation

Use a uniform finite-volume grid with cell width `Δr`, cell centers `r_i`, and faces `r_{i±1/2}`.

Cell-averaged conserved quantity:
q_i = r_i c_i

sql
Copy code

Semi-discrete update:
d/dt [ q_i Δr ] = - ( F_{i+1/2} - F_{i-1/2} )

arduino
Copy code

Forward Euler time step:
q_i^{n+1} = q_i^n - (Δt/Δr) ( F_{i+1/2} - F_{i-1/2} )
c_i^{n+1} = q_i^{n+1} / r_i

csharp
Copy code

### Interior face flux

At an interior face, compute `j_{i+1/2}` as diffusion + advection:

j_{i+1/2} = -D (c_{i+1} - c_i)/Δr + v_{i+1/2} c_upwind
v_{i+1/2} = s ω² r_{i+1/2}
c_upwind = (v_{i+1/2} ≥ 0) ? c_i : c_{i+1}
F_{i+1/2} = r_{i+1/2} j_{i+1/2}

nginx
Copy code

### Boundary face flux (no-flux)

Enforce no-flux by setting boundary face fluxes to zero:

F_{1/2} = r_{1/2} j_{1/2} = 0
F_{N+1/2} = r_{N+1/2} j_{N+1/2} = 0

vbnet
Copy code

(Equivalently, ghost cells may be used if they enforce `j=0` exactly.)

### Positivity vs conservation

Do not “clamp negative values to zero” as a generic fix; that deletes mass and violates conservation. If negative values appear, prefer:
- reducing `Δt` (via stability constraints below),
- improving the flux scheme to be positivity-preserving,
- rejecting the step and retrying with smaller `Δt`.

If any fixup is applied, it must preserve `M` to within the test tolerances.

## Stability guidance

For explicit stepping, use a combined diffusion + advection constraint as guidance:

Δt ≤ safety · min( Δr²/(2D), Δr/|v_max| )
v_max ≈ |s ω²| r_max

markdown
Copy code

Notes:
- Increasing `D`, `ω`, or `s` typically requires smaller `Δt`.
- Refining the grid (smaller `Δr`) also requires smaller `Δt`.
- The helper `estimateStableDt` should implement this logic and be used by default.

## Zero-flux steady state

Setting `j = 0` yields the continuum steady profile:

c(r) = C · exp[ (s ω² / (2D)) (r² - r_min²) ]

perl
Copy code

With no-flux boundaries, the solver should approximately preserve this profile (up to discretization and time integration error). The steady-state test seeds the grid with this profile.

## Verification checklist

At minimum, the implementation should satisfy:
- Mass conservation: `M(t)` stays within tolerance of `M(0)` for no-flux boundaries.
- Non-negativity: `c(r,t)` stays ≥ `-ε` for small numerical tolerance.
- Diffusion-only limit (`s=0`): Gaussian broadening trend in time.
- Advection-only limit (`D=0`): conservative transport with no spurious mass gain/loss.
- Zero-flux steady state: seeded steady profile remains close over many steps.