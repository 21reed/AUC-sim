# AUC-sim: interactive Lamm-equation sandbox for DGU / AUC

*AUC-sim* is a browser-based numerical solver for the 1D radial Lamm equation, tuned for **density-gradient ultracentrifugation (DGU)** and **analytical ultracentrifugation (AUC)** of **polydisperse nanoparticle samples**.

It started life as a side project to sanity-check Si nanocrystal DGU experiments (Hobbie-style gradients) and grew into a general “what happens if I spin this?” tool. It is meant for planning runs, building intuition, and to know when a spin should be finished, not for publication-grade Lamm fitting.

Under the hood it uses:

- a finite-volume discretization of the radial Lamm equation  
- many hydrodynamic size bins at once  
- explicit time stepping with advection plus diffusion  
- a core-shell nanoparticle model sitting in a user-defined density and viscosity gradient  

Everything runs in the browser in TypeScript; no server, no install, just a webapp.

---

## What this tool does

High-level, AUC-sim:

- solves the radial Lamm equation for a dilute, non-interacting nanoparticle sample in a spinning rotor cell  
- represents polydispersity as a set of size bins; each bin $k$ has:
  - hydrodynamic radius $a_k$
  - effective core–shell density $\rho_\mathrm{eff}(a_k)$
  - local drift velocity $v_k(r)$
  - local diffusion coefficient $D_k(r)$
- supports both:
  - uniform fluids (single-solvent AUC)
  - density and viscosity gradients (DGU) via user-specified $\rho(r)$ and $\eta(r)$
- lets you define parametric size distributions:
  - lognormal
  - bimodal lognormal
  - discrete mixtures
- computes size-dependent hydrodynamics using:
  - core density $\rho_\mathrm{core}$
  - effective shell density $\rho_{\mathrm{shell,eff}}$
  - shell thickness $t_\mathrm{shell}$
  - local solvent viscosity $\eta(r)$
- uses realistic rotor geometry presets (for example, SW 41 Ti settings by default) with:
  - $r_{min}$, $r_{max}$ and number of radial cells $N$
  - rotor speed $\omega$ (rad/s) or rpm
  - temperature $T$ (K)
- runs in a **“real-time” mode** by default:
  - simulation time tracks wall-clock time
  - you can scale time with 1x, 10x, 100x, 1000x, 10000x factors
  - internally it takes many small stable steps per animation frame
- visualizes:
  - concentration versus radius for each size bin
  - a total concentration curve (white)
  - an optional “pellet” region at the bottom of the tube
  - a Mass inspector for per-bin diameters and mass fractions  

In short: AUC-sim is a multi-species finite-volume Lamm solver, tuned for nanoparticle DGU / AUC, that you can poke at interactively in a browser.

---

## What this tool does *not* do

AUC-sim is not SEDFIT, SEDPHAT, or any of the commercial AUC stacks. It deliberately does not try to be a full data-analysis environment.

In particular, it:

- does not fit experimental data or infer parameters from absorbance or scattering scans  
- does not model non-Newtonian behavior; if you are in polymer goo, this does not capture that  
- does not simulate detectors (no explicit absorbance, interference or fluorescence channel)  
- does not include particle–particle interactions or non-dilute effects  
- does not include aggregation, association or dissociation kinetics; bins do not convert into each other  
- does not include binding equilibria or complex formation  
- does not include rotor bending, radial temperature gradients or detailed rotor mechanics  
- does not handle strongly non-spherical particles beyond “effective radius” hacks  

All gradients and size distributions are user-specified and idealized. The code assumes:

- dilute samples  
- non-interacting size bins  
- a single solvent mixture per cell  

If you need quantitative fits to real data or regulatory-grade analysis, use a validated AUC package and treat this as a conceptual and pedagogical companion.

If you are making plots for a paper, start with SEDFIT or similar and use AUC-sim to sanity-check “if I spin X in gradient Y at rpm Z, does this band motion make sense?”

---

## How the physics is modeled (one-page version)

Each size bin $k$ obeys the radial Lamm equation

$$
\frac{\partial c_k}{\partial t}
= -\frac{1}{r}\,\frac{\partial}{\partial r}\!\left[ r\,j_k(r,t) \right]
$$

with flux

$$
j_k(r,t)
= -D_k(r)\,\frac{\partial c_k}{\partial r}
+ v_k(r)\,c_k(r,t).
$$

Here:

- $c_k(r,t)$ is the concentration of size bin $k$  
- $D_k(r)$ is the local diffusion coefficient for bin $k$  
- $v_k(r)$ is the local drift velocity for bin $k$  

### Core-shell nanoparticle model

Each bin represents a core-shell particle with:

- total radius $a_k$ (from the size distribution)  
- core radius
  $$
  a_\mathrm{core} = \max\!\bigl(a_k - t_\mathrm{shell},\,0\bigr)
  $$
- core volume
  $$
  V_\mathrm{core} = \frac{4}{3}\pi a_\mathrm{core}^3
  $$
- total volume
  $$
  V_\mathrm{tot} = \frac{4}{3}\pi a_k^3
  $$

Effective particle density:

$$
\rho_\mathrm{eff}(a_k)
= \frac{
  \rho_\mathrm{core}\,V_\mathrm{core}
  + \rho_{\mathrm{shell,eff}}\bigl(V_\mathrm{tot} - V_\mathrm{core}\bigr)
}{
  V_\mathrm{tot}
}.
$$

Given a solvent density profile $\rho_s(r)$ and viscosity profile $\eta(r)$, the buoyant density contrast is

$$
\Delta\rho(a_k,r)
= \rho_\mathrm{eff}(a_k) - \rho_s(r).
$$

Stokes friction (spherical, one radius per bin):

$$
f(a_k,r) = 6\pi\,\eta(r)\,a_k.
$$

From this we get:

Centrifugal drift velocity

$$
v_k(r)
= \frac{
  \Delta\rho(a_k,r)\,V_\mathrm{tot}\,\omega^2 r
}{
  f(a_k,r)
}.
$$

Diffusion (Stokes-Einstein)

$$
D_k(r)
= \frac{k_\mathrm{B} T}{f(a_k,r)}.
$$

No-flux boundary conditions at $r_{min}$ and $r_{max}$ enforce mass conservation for each bin.

### Numerical scheme (very short version)

Numerically, AUC-sim is intentionally simple and explicit:

- space: finite-volume in \(r\), with uniform cells and conservative variables $q_{k,i} = r_i\,c_{k,i}$ 
- fluxes: centered diffusion and upwind advection at cell faces  
- time: first-order explicit (forward Euler) update, with $\Delta t$ chosen to respect a combined diffusion/advection CFL condition  
  

For more detail, see `PHYSICS.md`, which spells out the finite-volume discretization.

---

## Using the simulator

### 1. Choose geometry and rotor conditions

1. Set the radial domain:
   - $r_{min}$, $r_{max}$ (m)  
   - number of radial cells $N$ (for example, 180 for an SW 41 Ti cell)

2. Set rotor conditions:
   - angular speed $\omega$ (rad/s) or rpm  
   - temperature $T$ (K)  

These control the grid, the centrifugal acceleration and the thermal diffusion scale.

### 2. Define a solvent gradient

In the Gradient (ρ, η) panel:

1. Pick a gradient type:
   - `uniform`: constant $\rho$ and $\eta$ (single-solvent AUC)  
   - `linear`: $\rho$ and $\eta$ vary linearly with $r$  
   - `power`: $\rho$ varies as a power law in $r$  
   - `two-step`: two-segment gradient with a knee at $r_\mathrm{mid}$  

2. Set the parameters used by that type. Usually this includes:
   - `rho_top`, `rho_bot` (kg/m³)  
   - `eta_top`, `eta_bot` (Pa·s)  
   - optionally `exponent p`, `r_mid`, `rho_mid`, `eta_mid`  

The app builds $\rho(r)$ and $\eta(r)$ from these and feeds them into $v_k(r)$ and $D_k(r)$ for every bin.

### 3. Choose a size distribution

In the Size distribution panel:

1. Select a distribution type:
   - `lognormal`: single lognormal in diameter  
   - `bimodal`: mixture of two lognormals  
   - `discrete`: user-specified discrete diameters with weights  

2. Fill in the fields relevant to that type. For example:
   - lognormal: `D50` (nm, total diameter), `g_sigma`, `n_bins`  
   - bimodal: `D50_1`, `g_sigma1`, `weight1`, `D50_2`, `g_sigma2`, `weight2`, `n_bins`  
   - discrete: `disc d1`, `disc w1`, `disc d2`, `disc w2`, etc; plus `n_bins` if needed  

The code converts these into size-bin centers $a_k$ and normalized mass fractions $w_k$.

### 4. Set material parameters

In the Material & rotor panel:

- `rho_core`: core density (for example, about 2330 kg/m³ for crystalline Si)  
- `rho_shell`: effective shell density (ligand plus co-solvent)  
- `t_shell`: shell thickness (nm)  

These, plus the gradient, define $\rho_\mathrm{eff}(a_k)$, $\Delta\rho(a_k,r)$ and therefore sedimentation behavior.

### 5. Run, inspect, tweak

- Use the play / pause control and time-scale selector to run the simulation and adjust speed (1× to 10000×).  
- The plot shows:
  - total concentration (white)
  - per-bin curves (colored)
  - an optional pellet at the bottom (toggleable)  
- The Mass inspector lists:
  - bin index
  - diameter
  - mass fraction  

  Clicking a row highlights that bin’s curve in the plot.

- The pellet checkbox controls whether the bottom fraction of the tube is included in the visible radial range. Hiding the pellet keeps a huge spike from blowing out the vertical scale.

---

## Limitations and caveats

When you interpret the output, keep these in mind:

- Idealized gradients: $\rho(r)$ and $\eta(r)$ are whatever functions you told the code to build; they are not fits to measured gradients unless you do that offline.  
- No detailed chemistry: ligand chemistry, solvent mix and surface physics are all compressed into $\rho_{\mathrm{shell,eff}}$ and $\eta(r)$.  
- No data fitting: this is a forward simulator, not an inverse problem solver.  
- No noise or detector model: output is a clean concentration profile, not your detector signal.  
- Resolution matters: too few radial cells or size bins, or a very aggressive $\Delta t$, can give numerical artifacts. The CFL estimate is conservative, not magic.

Despite that, AUC-sim is useful for:

- building intuition about how size, buoyant density and gradient shape affect band motion  
- designing gradients and run times before you burn rotor time  
- teaching the Lamm equation and density-gradient ultracentrifugation  

---

## Citing AUC-sim

If you use this in a paper, talk or thesis, please cite it so other people can find and reuse it. A suggested citation is:

> Petersen, R. “AUC-sim: interactive Lamm-equation simulator for density-gradient ultracentrifugation of nanoparticles.” (2025). GitHub repository. Available from: *replace_with_repo_URL*.

Replace `replace_with_repo_URL` with the actual repository URL (for example, the main GitHub link). If your journal supports software citations, you can also add a separate software entry with:

- repository URL  
- version tag or commit hash you used  

Citations help justify keeping this tool maintained.

---

## Keywords

Some search and indexing terms that describe this project:

- density-gradient ultracentrifugation (DGU)  
- analytical ultracentrifugation (AUC)  
- Lamm equation  
- finite-volume method  
- nanoparticle sedimentation  
- silicon nanocrystals (Si NCs)  
- colloidal quantum dots (CQDs)  
- perovskite nanocrystals  
- core–shell quantum dots  
- core–shell nanoparticle hydrodynamics  
- buoyant density distribution  
- radial solvent density profile  
- viscosity gradient  
- Beckman Coulter ultracentrifuge  
- Thermo Scientific ultracentrifuge  
- sedimentation–diffusion balance  
- isopycnic banding  
- polydisperse size distribution  
- lognormal particle size distribution  

If you extend this code to new systems (for example, SiC NCs, perovskites, rod-like particles), feel free to add more domain-specific keywords so people working on that chemistry can actually find it.