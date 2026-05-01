# Limitless Theory

A modern, web-based reimagining of [Josh Parnell's Limit Theory](https://github.com/JoshParnell/ltheory) — the famously ambitious open-world space simulation whose source was released after the project was discontinued.

This is **not a port** of the original C/Lua codebase. It is a from-scratch WebGL build (Three.js + Vite) that channels Limit Theory's design DNA into something you can launch in a browser and immediately fly around in.

## What we kept from the original

The original Limit Theory (2nd-gen, C + Lua) is organized around a few iconic ideas. Each of them shows up in this rebuild:

| Limit Theory                                   | Limitless Theory                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `Entities.System` + `RNG.Create(seed)`         | `World.generate()` + seeded `RNG` (mulberry32) in `src/core/rng.js`      |
| `System:spawnAsteroidField`, `:spawnStation`, `:spawnPlanet`, `:spawnShip` | All present in `src/world/world.js`                       |
| `Gen.ShipFighter` parametric ship generator    | `src/gen/ship.js` — hull, mirrored wings, engine pods, accent strips    |
| `Gen.Nebula` IFS skybox                        | `src/gen/nebula.js` — six-face fbm cubemap with hot star bloom           |
| `Game.Action` stack (Think → MoveTo / Attack / Mine / Escort) | `src/ai/actions.js`                                       |
| `Game.Item`, `Production`, `Material`, `Market`| `src/core/items.js` + per-station consumes/produces market in World      |
| `Game.Player` + faction owner + dispositions   | `src/core/factions.js`                                                   |
| Drag-based flight (`setDrag(0.75, 4.0)`)       | `src/systems/physics.js` exponential drag                                |
| `Pulse` projectiles + `Turret` fire            | `src/systems/weapons.js` bolt pool with leading aim                      |
| `Dust` parallax field                          | `src/systems/dust.js` — camera-tiled point cloud                         |
| Cyan-and-orange holo HUD                       | `src/ui/hud.js`                                                          |

## What we added that the original never shipped

- **Always-on minimap radar** with disposition coloring.
- **Polished trade UI** with consume/produce-driven price spreads.
- **Bloom postFX** (UnrealBloomPass) so engine glow, projectiles, and the star light up properly.
- **Multiple camera modes** (chase / cockpit / far) bound to `V`.
- **Boost-tied FOV easing** for a sense of speed.
- **Friendly wing of escorts** (small fleet) bound to your ship via the `Escort` action.
- **Quick-action upgrades** at stations: hull repair, shield refill, weapon upgrade.

## Controls

```
FLIGHT
  W / S            forward / reverse thrust
  A / D            strafe left / right
  Space / Ctrl     strafe up / down
  Q / E            roll
  Mouse            yaw / pitch (click canvas to capture)
  Shift            afterburner (boost)
  X                airbrake

COMBAT
  LMB              fire bolts (lead-aim if target locked)
  RMB / M          mining laser
  T                target nearest hostile
  Y                target nearest ore asteroid
  Tab              cycle ships
  R                clear target

NAV / META
  F                dock with nearest station / undock
  V                cycle camera mode
  M                large system map
  Esc              pause
```

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build & deploy

```bash
npm run build    # outputs static site to ./dist
npm run preview  # serves ./dist for a local check
```

The build is fully static — drop `dist/` into GitHub Pages, Netlify, Cloudflare Pages, or any static host.

## Project layout

```
src/
  core/         items, factions, rng, names
  gen/          procedural mesh & skybox generators
  world/        World + entity spawning
  systems/      input, physics, flight, weapons, dust, player actions
  ai/           action stack (Think / MoveTo / Attack / Mine / Escort / Wander)
  render/       postFX composer
  ui/           HUD + overlay panels (menu, pause, map, trade)
  styles/       CSS
```

## Credits

- Original *Limit Theory* by Josh Parnell — https://github.com/JoshParnell/ltheory
- Three.js — https://threejs.org
- This rebuild written for the web.
