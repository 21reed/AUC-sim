# Repository Guidelines

## Goal
Build a browser-based ultracentrifugation (AUC) visualization using a single-species 1D Lamm-equation solver. Physics correctness is the priority; UI is secondary.

## Project Structure & Module Organization
- `src/`: TypeScript source.
  - `main.ts`: boots the canvas UI and animation loop.
  - `lamm.ts`: finite-volume Lamm solver and parameter conversions.
  - Tests live next to code (e.g. `lamm.test.ts`).
  - `style.css`: layout.
- `public/`: static assets served by Vite.
- `PHYSICS.md`: PDE, discretization, boundary conditions, stability notes, references.
- `ACCEPTANCE.md`: numeric invariants; tolerances; test descriptions.
- `package.json`, `tsconfig.json`: tooling and compiler options.

## Build, Test, and Development Commands
- `npm run dev`: start Vite dev server.
- `npm run build`: type-check then bundle.
- `npm run preview`: serve built bundle.
- `npm test`: run Vitest; must be green.

## Physics Guardrails
These are non-negotiable.

### Units
- Internal calculations use SI only:
  - `r` meters; `t` seconds
  - `D` m^2/s
  - `s` seconds (UI may accept Svedberg; convert: 1 S = 1e-13 s)
  - `ω` rad/s (UI may accept rpm; convert)
- Never mix nm and m; conversions must be explicit and tested.

### Conservative form and invariants
- Treat the solver as a conservation law in the variable `q = r c`; evolve via fluxes; recover `c = q/r`.
- No-flux boundaries mean `j=0` at `r_min` and `r_max`; do not replace with `∂c/∂r=0` unless explicitly proven equivalent for the discretization.
- Mass must be conserved: `M = ∫ r c dr`; numerical drift must stay within stated tolerances.

### Positivity
- Do not “clamp negatives to zero” as a generic fix; it breaks conservation.
- Preferred behavior if negativity appears: reduce `dt`; reject and retry the step; or use a positivity-preserving flux strategy.
- If any fixup is ever used, it must not materially change `M`; document it in `PHYSICS.md` and add a regression test.

### Stability
- Respect `estimateStableDt` / CFL guidance; smaller `dt` is safer than “it seems fine”.
- Any change to timestep logic or fluxes requires updating `PHYSICS.md` and adding/adjusting tests.

## Coding Style & Naming Conventions
- TypeScript; ES modules; keep exports explicitly typed.
- Keep numerics readable; prefer small pure functions for fluxes, conversions, invariants.
- Naming: descriptive camelCase; PascalCase for types.

## Testing Guidelines
- Framework: Vitest; tests live near code.
- Tests must run offline; deterministic; no network; no random without a fixed seed.
- Minimum required tests (keep them strict; don’t water them down):
  - Mass conservation under no-flux boundaries.
  - Non-negativity within tiny epsilon.
  - Zero-flux steady-state profile stays approximately steady.
  - Limiting cases: diffusion-only (`s=0`) and advection-only (`D=0`) behave sensibly.

## Commit & PR Guidelines
- Commits: concise imperative subjects; checkpoint before risky edits.
- Never weaken tests to make them pass; fix the bug or tighten `dt` logic.
- Avoid drive-by refactors; keep diffs reviewable.

## Dependencies and Security
- Avoid adding dependencies unless clearly justified; prefer standard library + existing stack.
- If adding a dep, note why; pin it; add a minimal test that uses it.
- Do not use `sudo` for npm workflows; fix permissions and paths instead.

## Codex Workflow Rules
- After edits: run `npm test`; then `npm run build` if touching public APIs or UI.
- If a physics change is proposed: write it into `PHYSICS.md` first; then implement.
- When unsure, ask; don’t guess. Afaict wrong-but-plausible numerics are the main failure mode here.