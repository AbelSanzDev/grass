# Reactive Grass

A standalone, high-fidelity **Three.js** demo that renders a dynamic grass field with real-time deformation effects. The project is intentionally self-contained (`HTML + JS + assets`) so it can be run, shared, and extracted independently from any larger game codebase.

![Reactive Grass demo screenshot](public/grass_image.png)

## Overview

Reactive Grass simulates environmental response to movement and gameplay-like events:

- Player movement bends and flattens blades in real time
- Dash impulses generate directional disturbance waves
- Footsteps leave fading track impressions
- Scorch/death marks darken and compress affected areas
- Optional crowd crush mode applies multi-point compression

The demo includes an integrated control panel for live parameter tuning (quality, floor size, movement speed, crush radius, and crush strength), making it useful for both visual experimentation and shader behavior validation.

## Feature Highlights

- **Four quality presets** (`low`, `medium`, `high`, `premium`) up to 12,000 blades
- **Custom shader pipeline** for animated wind, interaction response, and lighting
- **Interactive test actions** for footsteps, dash, scorch marks, and reset/clear tools
- **Autopilot and manual control modes** for reproducible and exploratory testing
- **Runtime status telemetry** (quality, blade count, player position, FPS)
- **Isolated package design** with no coupling to external game modules

## Tech Stack

- [Three.js](https://threejs.org/) (loaded via import map / CDN)
- Vanilla JavaScript (ES modules)
- WebGL shader customization using `ShaderMaterial` and `onBeforeCompile`

## Project Structure

```text
grass/
├── app.js               # Scene bootstrapping, UI wiring, controls, simulation loop
├── reactiveGrass.js     # Grass system creation, shaders, update and effect APIs
├── index.html           # Canvas, control panel UI, styles, and module entrypoint
└── public/
    └── grass_image.png  # Project preview image used in this README
```

## Getting Started

### Prerequisites

- A modern browser with WebGL support
- A local static server (recommended for module loading and consistent behavior)

### Run Locally

From the project directory (`grass/`), start any static server. Example:

```bash
python3 -m http.server 4173
```

Then open:

[`http://localhost:4173`](http://localhost:4173)

## Controls

### Camera and Navigation

- Mouse drag: orbit camera
- Mouse wheel / trackpad: zoom
- Ground click: reposition player marker

### Movement

- `W`, `A`, `S`, `D`: manual movement (when autopilot is disabled)
- `Shift`: trigger dash impulse

### Quality Shortcuts

- `1`: low
- `2`: medium
- `3`: high
- `4`: premium

## Runtime Panel

The right-side panel exposes all primary simulation controls:

- **Quality**: switches blade density and rebuilds the patch
- **Floor Size**: adjusts patch footprint and rebuilds geometry
- **Move Speed**: affects manual motion and autopilot pacing
- **Crush Range / Crush Amount**: controls deformation radius and intensity
- **Tests**: manually trigger footstep, dash, scorch, clear marks, and reset player
- **Mode Toggles**: autopilot and crowd crush behavior

## Architecture Notes

### `app.js` Responsibilities

- Initializes scene, camera, renderer, lights, and orbit controls
- Builds and rebuilds grass system from active UI configuration
- Handles user input (keyboard, pointer, UI)
- Updates probe/player state and passes it to the grass runtime each frame
- Maintains debug marker visuals and status telemetry

### `reactiveGrass.js` Responsibilities

- Creates and manages the grass instance (`createReactiveGrass`)
- Builds:
  - Ground mesh with shader-injected interaction shading
  - Instanced blade mesh with custom vertex/fragment deformation logic
  - Instanced footprint system with fade lifecycle
- Exposes effect and control APIs for gameplay-style events
- Handles lifecycle cleanup and resource disposal

## Public API Surface

The grass runtime exposes a concise API intended for integration:

- `createReactiveGrass(options)`
- `attachReactiveGrass(instance, parent)`
- `updateReactiveGrass(instance, dt)`
- `disposeReactiveGrass(instance)`
- `setReactiveGrassPlayerState(instance, playerPos, playerVel)`
- `addGrassFootstep(instance, x, z, intensity)`
- `addGrassDashImpulse(instance, x, z, dirX, dirZ)`
- `addGrassDeathMark(instance, x, z)`
- `clearGrassDeathMarks(instance)`
- `setGrassCrushPoints(instance, positions)`
- `clearGrassCrushPoints(instance)`
- `setGrassCrushConfig(instance, config)`
- `getGrassCrushConfig(instance)`

## Performance Guidance

- Start with `medium` or `high` for balanced visual quality and framerate
- Use `premium` for desktop GPUs when validating final visual fidelity
- If FPS drops:
  - reduce quality preset
  - decrease floor size
  - disable crowd crush during stress testing

## Troubleshooting

- **Blank screen / module load issues**: run through a local server, not `file://`
- **Low framerate**: reduce quality or floor size
- **Input feels inactive**: ensure autopilot is disabled for manual movement

## License

No license file is currently defined in this repository. Add one (for example, MIT) before public distribution.

