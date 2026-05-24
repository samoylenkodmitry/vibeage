# Vibeage Cozy Coast Visual Upgrade Plan

**Goal:** make Vibeage’s world feel cozy, beautiful, browser-friendly, and much closer to the reference screenshot: pale sand, turquoise water, blue atmospheric haze, dark conifer forest silhouettes, warm sunlight, and a low MMO-style camera.

**Core decision:** keep Vibeage’s gameplay/networking systems, but stop depending on the existing procedural primitives as the final visual style. Use the existing terrain only as a movement/click collider where useful, and add a separate art layer made from sky, water, postprocessing, GLB assets, and eventually one authored hero scene.

---

## Codex readiness addendum, 2026-05-22

This section is the handoff prep for the next agent after the current roadmap work finishes. It closes the gaps that would otherwise cause a visual PR to sprawl or conflict with Claude's parallel work.

### Current repo state to assume before starting

- Work from `main`, but do **not** start the cozy-coast branch until Claude's current roadmap branch is merged or explicitly paused.
- At the time this addendum was written, the local repo had a Claude edit in `packages/content/miniBosses.ts`. Do not touch or stage that file for visual work unless it becomes part of the new task.
- The active `ROADMAP.md` has already been split down to a short active plan. The eight Codex architecture audit items are recorded as shipped in the roadmap, and the current active slice is onboarding polish. Cozy coast should be queued as the next product slice, not mixed into ongoing roadmap cleanup.
- The current rendering stack is already React Three Fiber + Three + Vite. This is an art-layer upgrade, not a renderer rewrite.

Before the first cozy-coast PR:

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c cozy-coast-visual-foundation
```

If `git status -sb` shows unrelated local edits, stop and ask which branch owns them. Do not stash or reset another agent's work.

### Verified dependency notes

The package versions visible from npm metadata on 2026-05-22 are compatible with the repo's current major stack:

```txt
repo currently has:
  react ^19.2.6
  react-dom ^19.2.6
  three ^0.184.0
  @react-three/fiber ^9.6.1

pnpm view showed:
  @react-three/drei 10.7.7
    peers: react ^19, react-dom ^19, three >=0.159, @react-three/fiber ^9.0.0

  @react-three/postprocessing 3.0.4
    peers: react ^19.0, three >=0.156.0, @react-three/fiber ^9.0.0

  postprocessing 6.39.1
    peers: three >=0.168.0 <0.185.0
```

Because the repo pins `three` with `^0.184.0`, it should stay below `0.185.0`, which matches `postprocessing`'s current peer range. Re-check with `pnpm view` immediately before implementation if weeks have passed.

Do not install packages in the shared working tree while Claude is mid-change. The install belongs in PR 1 on its own feature branch.

### Architectural corrections to the plan below

0. **No feature flags and no half-made merged work.**
   - Do not add `VITE_COZY_WORLD_ART`, `COZY_WORLD_ART_ENABLED`, or hidden alternate rendering paths.
   - Do not merge dependency-only, wrapper-only, or "foundation only" PRs that users cannot see in the default world.
   - Every PR must leave the default game visually better, buildable, tested, and not dependent on a future PR to look intentional.
   - Fallbacks are allowed for runtime safety, for example asset-load fallback geometry or low-quality water, but not as a hidden old/new product switch.
   - If a slice is not good enough to be default-on, keep it on the branch and do not merge it.

1. **Do not make the water and forest blindly follow the player forever.**
   - A focus-following water plane is useful for a quick screenshot, but it lies about geography and turns the whole world into coastline.
   - The better shape is an anchored hero scene registry:

   ```ts
   type WorldArtScene = {
     id: 'starter_cozy_coast';
     origin: { x: number; z: number };
     radius: number;
     rotationY: number;
     waterline: { x: number; z: number; width: number; length: number };
     enabledByDefault: boolean;
   };
   ```

   - Render cozy-coast art only when the player is inside or near that scene radius.

2. **Keep current `WorldEnvironment` as fallback until the new layer is proven.**
   - The repo already has day/night atmosphere and procedural foliage.
   - Keep reusable pieces while building locally, but do not merge a hidden switch between old and new product states.
   - The first merged cozy-coast PR should replace the default starter-area presentation with a complete visible slice.
   - Delete or bypass old starter-area primitive foliage where it clashes with the new art direction.

3. **Collider mode should be invisible without hiding the mesh.**
   - Do not use `visible={false}`.
   - Prefer a material that keeps raycasting available while not writing color:

   ```tsx
   <meshBasicMaterial
     colorWrite={false}
     depthWrite={false}
     transparent
     opacity={0}
   />
   ```

   - If Three/R3F behavior differs, verify with a click-to-move Playwright test before merging.

4. **Water must never steal movement clicks.**
   - `raycast={() => null}` or `raycast={() => undefined}` is required on water meshes.
   - Add a regression that clicking visually over water-adjacent terrain still emits movement to the ground target.

5. **Do not add server walkability in the visual slice.**
   - Water, sand, rocks, and trees are cosmetic until a shared terrain/walkability contract is designed.
   - If collision is desired later, it belongs in shared content/sim + server movement validation + client affordances together.

6. **Do not rely on external asset links at runtime.**
   - Download assets into `public/models/...` or `public/textures/...`.
   - Track license/source in an asset manifest committed with the assets.
   - Keep assets small enough for browser startup; optimize before merging large files.

7. **Do not treat clone-based GLB trees as production-complete.**
   - `Clone` is acceptable for a first visual slice.
   - The production follow-up must merge/instance repeated meshes or set a draw-call budget.

8. **Postprocessing is optional, not foundational.**
   - Sky, fog, water, ground color, and real trees should look acceptable without bloom.
   - Low quality and mobile should avoid the composer unless measured.

### Prepared PR queue

Use this queue after Claude's current roadmap work is merged. Each PR should be reviewable and should avoid gameplay rewrites.

#### PR 1: Complete cozy-coast starter slice

Owned files:

```txt
package.json
pnpm-lock.yaml
apps/client/src/WorldScene.tsx
apps/client/src/world-art/quality.ts
apps/client/src/world-art/CozyWorldArt.tsx
apps/client/src/world-art/CozyAtmosphere.tsx
apps/client/src/world-art/SimpleStylizedWater.tsx
apps/client/src/world-art/CozyShoreBand.tsx
apps/client/src/world-art/CozyStarterPines.tsx
apps/client/src/world-art/worldArtScenes.ts
apps/client/src/world-art/cozyScatter.ts
tests/worldArtQuality.spec.ts
tests/worldArtScenes.spec.ts
tests/e2e-vite/cozy-world-art.spec.ts
```

Work:

- Add `@react-three/drei`, `@react-three/postprocessing`, and `postprocessing`.
- Add `chooseWorldArtQuality()`.
- Add a default-on cozy starter scene: sky, warm sun, blue fog, simple water, pale shore band, and deterministic pine silhouettes.
- Anchor the scene near starter spawn with water on negative X; do not make the water follow the player globally.
- Use primitive/procedural pines only as a temporary **complete visual** for PR 1, not as hidden scaffolding. They should look intentional enough to ship until GLB trees replace them.
- Make water non-raycastable.
- Keep `WorldGround` visible/clickable unless collider mode is implemented in the same PR and covered by tests.
- Enable renderer shadows only if used and tested:

```tsx
<Canvas shadows={worldArtQuality !== 'low'} ...>
```

Acceptance:

```txt
pnpm run typecheck:client
pnpm run lint
pnpm run build
pnpm test -- tests/worldArtQuality.spec.ts tests/worldArtScenes.spec.ts
pnpm run test:e2e:vite -- tests/e2e-vite/cozy-world-art.spec.ts
```

Do not merge if the result is just a new sky or package install. PR 1 must produce a visible default starter-area scene with water, shore, haze, and tree silhouettes.

#### PR 2: Real assets and asset manifest

Owned files:

```txt
apps/client/src/world-art/assetRegistry.ts
apps/client/src/world-art/CozyPineForest.tsx
apps/client/src/world-art/cozyScatter.ts
apps/client/src/world-art/CozyWorldArt.tsx
public/models/trees/*.glb
public/models/props/*.glb
public/models/ASSET_MANIFEST.md
tests/worldArtAssets.spec.ts
tests/e2e-vite/cozy-world-art.spec.ts
```

Work:

- Add an asset registry with stable IDs and fallback primitive definitions.
- Add GLB pines/rocks/grass with license/source metadata.
- Replace PR 1's temporary procedural pines with real stylized GLB trees.
- Render deterministic anchored tree clusters near the cozy-coast scene.
- Keep the scene complete if an asset fails to load by using intentional fallback meshes.

Acceptance:

```txt
pnpm run typecheck:client
pnpm test -- tests/worldArtAssets.spec.ts
pnpm run build
pnpm run test:e2e:vite -- tests/e2e-vite/cozy-world-art.spec.ts
```

Do not merge raw huge assets without manifest and optimization notes.

#### PR 3: Terrain/collider polish as a complete upgrade

Owned files:

```txt
apps/client/src/WorldGround.tsx
apps/client/src/world-art/useTerrainTextures.ts
public/textures/sand_color.jpg
public/textures/sand_normal.jpg
public/textures/grass_color.jpg
public/textures/grass_normal.jpg
tests/worldGroundGeometry.spec.ts
tests/e2e-vite/cozy-world-art.spec.ts
```

Work:

- Add UVs to generated terrain geometry.
- Add `visualMode: 'normal' | 'textured' | 'collider'`.
- For `collider`, keep pointer behavior but avoid color/depth writes.
- For `textured`, keep vertex colors available so current biome colors still influence material.
- Use the new mode immediately in the cozy-coast scene so the merged game looks better, not merely more configurable.

Acceptance:

```txt
pnpm run typecheck:client
pnpm test -- tests/worldGroundGeometry.spec.ts
pnpm run test:e2e:vite -- tests/e2e-vite/cozy-world-art.spec.ts
```

Do not add terrain collision/walkability here.

#### PR 4: Authored cozy coast GLB

Owned files:

```txt
apps/client/src/world-art/CozyCoastScene.tsx
apps/client/src/world-art/worldArtScenes.ts
public/models/world/cozy-coast/cozy_coast_scene.glb
public/models/world/cozy-coast/README.md
public/models/ASSET_MANIFEST.md
tests/worldArtScenes.spec.ts
tests/e2e-vite/cozy-world-art.spec.ts
```

Work:

- Add the authored coast scene once the quick procedural version proves composition.
- Keep it anchored near the scene origin.
- Keep `WorldGround` underneath as collider.
- Ensure player/enemies/NPC labels still render above the authored geometry.

Acceptance:

```txt
pnpm run build
pnpm run test:e2e:vite -- tests/e2e-vite/cozy-world-art.spec.ts
```

Do not merge if the GLB creates a large unoptimized payload without a follow-up optimization command recorded.

#### PR 5: Visual smoke, budget, and production hardening

Owned files:

```txt
quality/performance-budgets.json
tests/e2e-vite/cozy-world-art.spec.ts
apps/client/src/world-art/*
ROADMAP.md or docs/ARCHITECTURE_DEBT.md only if this becomes active roadmap work
```

Work:

- Add screenshot/pixel smoke checks:
  - canvas is nonblank,
  - water color is visible,
  - sky/fog color is visible,
- tree silhouettes render,
  - HUD remains readable,
  - click-to-move still works.
- Document any mobile fallback.

Acceptance:

```txt
pnpm run check:client
pnpm run build
pnpm run test:e2e:vite
```

Run full `pnpm run check` before merge when the slice is ready for main.

### Ready-to-send agent handoff prompt

Use this prompt after Claude's current roadmap work is merged:

```txt
Read ~/Downloads/vibeage-cozy-coast-visual-upgrade-plan.md.

Implement PR 1 only: Complete cozy-coast starter slice.

Do not touch server gameplay, protocol, combat, mini-boss content, onboarding work, or existing roadmap cleanup. Add dependencies in package.json/pnpm-lock only on your feature branch. Add the world-art folder, quality selection, CozyWorldArt, CozyAtmosphere, SimpleStylizedWater, CozyShoreBand, CozyStarterPines, worldArtScenes, and cozyScatter. Wire the cozy starter scene into WorldScene as the default starter-area presentation, with no feature flag and no hidden old/new switch. PR 1 must visibly ship sky, fog, warm light, water, shore, and tree silhouettes. Do not add GLB assets, terrain UVs, collider mode, or authored coast GLB yet.

Before editing, run git status -sb and stop if unrelated local changes are present. After implementation run pnpm run typecheck:client, pnpm run lint, and pnpm run build. Open a PR with screenshots or describe why screenshots were not captured.
```

### Open decisions to make before PR 2

- Exact scene origin: keep starter at current spawn `(0, 0)` and place coast around it, or move visual hero scene to a nearby scenic area while preserving gameplay spawn?
- Is cozy coast the default starting area, or a named nearby destination?
- Should day/night continue over cozy coast, or should the first pass lock the hero scene to bright daytime?
- Which asset source is approved for first import: Quaternius, self-made Blender primitives, or generated/custom assets?
- What is the maximum acceptable initial asset payload for production on mobile?

Default recommendations:

```txt
scene origin: around starter spawn, with water on negative X
initial state: default-on bright daytime art pass
asset source: Quaternius or self-made GLB primitives with explicit manifest
mobile payload target: keep first art payload under 20 MB compressed
```

---

## 0. Honest target

### What will actually work in a browser

The highest-impact browser-safe path is:

```txt
1. Drei Sky + warm sun + close blue fog
2. Stylized water with mobile fallback
3. Subtle ACES/bloom/vignette postprocessing
4. Real stylized GLB pine trees, rocks, grass, logs, docks
5. Terrain UVs + sand/grass textures, or better: an authored GLB starter coast
6. Existing gameplay ground converted to transparent collider mode
```

This will not become AAA/WoW-quality from code alone. It can become **screenshotable indie MMO quality** quickly, and with an authored coast scene it can get very close to the cozy reference vibe.

### Expected visual quality by phase

| Phase | Visual result | Confidence |
|---|---:|---:|
| Sky + fog + lighting | world immediately feels less flat | high |
| Water | biggest “wow” moment, especially with animated highlights | high |
| Postprocessing | makes the scene feel rendered instead of debug-colored | medium/high |
| Real trees | removes the obvious prototype look | very high |
| Ground textures / authored terrain | makes the beach/forest feel intentional | very high |
| Authored cozy coast GLB | where screenshot-level beauty actually comes from | very high |

---

## 1. Current Vibeage visual situation

Relevant current repo facts:

- `WorldScene.tsx` is the correct integration point. It mounts the R3F `<Canvas>`, background/fog, `WorldEnvironment`, `WorldGround`, `WorldFeatures`, entities, VFX, and camera.
- `WorldGround.tsx` is already a chunked clickable terrain system. It generates geometry and uses pointer intersections for movement.
- Current ground geometry has positions and colors, but no UVs. That means a texture pass needs a small geometry change before `map` / `normalMap` will work well.
- `WorldEnvironment.tsx` already has procedural foliage, but the trees are made from primitive instanced cones, cylinders, spheres, and dodecahedrons. This is good for prototyping, but it will always look like programmer art.
- `package.json` already has `@react-three/fiber`, `three`, React, and Vite, so this is not an engine rewrite.

The plan below assumes we keep game state, camera rig, entity rendering, loot rendering, and movement. We replace/overlay the world art.

---

## 2. Recommended implementation order

Do this as complete vertical PRs instead of hidden scaffolding. Each merged PR must make the default starter-area world visibly better on its own.

```txt
PR 1: Complete starter coast slice
  - Add Drei + postprocessing packages
  - Add CozyWorldArt wrapper
  - Add Sky, fog, sun, hemisphere light
  - Add quality setting
  - Add simple anchored water, shore band, and pine silhouettes
  - Default-on in the starter area
  - No feature flag

PR 2: Real foliage and props
  - Add Quaternius GLB pines/rocks/grass
  - Add CozyPineForest with deterministic scatter
  - Replace temporary PR 1 tree silhouettes
  - Add asset manifest and fallback meshes

PR 3: Ground upgrade
  - Add terrain UVs
  - Add sand/grass texture material for quick pass
  - Add visualMode='collider' to WorldGround
  - Use the mode immediately in the starter coast, with click tests

PR 4: Authored hero coast
  - Add cozy_coast_scene.glb
  - Add dock, cliffs, tree wall, beach props
  - Keep WorldGround transparent/clickable under it

PR 5: Budget and smoke hardening
  - Screenshot/pixel smoke tests
  - Mobile quality budget
  - Asset payload review
```

If time is very tight, do this minimum:

```txt
Sky + water + shore + tree silhouettes + fog, default-on and tested
```

Those four are the largest perceptual wins.

---

## 3. Dependencies

Install the runtime packages:

```bash
pnpm add @react-three/drei @react-three/postprocessing postprocessing
```

Why `postprocessing` explicitly? Because code using `ToneMappingMode` imports it from `postprocessing`, and with pnpm you should not rely on transitive dependencies.

Optional tooling commands later:

```bash
pnpm dlx gltfjsx --help
pnpm dlx @gltf-transform/cli --help
```

Do not over-optimize before the scene is visibly good. First make it beautiful, then compress.

---

## 4. Asset sources

### Primary nature asset pack

Use Quaternius stylized assets first.

Recommended:

```txt
Quaternius Ultimate Stylized Nature Pack
Quaternius Stylized Nature MegaKit
```

Look for these asset types:

```txt
pine_01.glb
pine_02.glb
pine_03.glb
rock_01.glb
rock_02.glb
grass_clump_01.glb
bush_01.glb
driftwood_01.glb
dock_01.glb
log_01.glb
stump_01.glb
```

Use GLB/glTF when available. Avoid importing FBX into the browser directly unless you convert it to GLB first.

### Texture source

Use ambientCG for CC0 textures:

```txt
sand base/color texture
sand normal texture
grass base/color texture
grass normal texture
rock/dirt color texture
rock/dirt normal texture
```

Keep texture size modest:

```txt
512px for grass clumps and small props
1024px for terrain materials
2048px only for a large authored terrain scene if truly needed
```

---

## 5. File layout

Create this structure:

```txt
apps/client/src/world-art/
  CozyWorldArt.tsx
  CozyAtmosphere.tsx
  CozyPostProcessing.tsx
  SimpleStylizedWater.tsx
  ReflectiveWorldWater.tsx
  CozyPineForest.tsx
  CozyCoastScene.tsx
  cozyScatter.ts
  quality.ts

public/textures/
  waternormals.jpg
  sand_color.jpg
  sand_normal.jpg
  grass_color.jpg
  grass_normal.jpg

public/models/world/cozy-coast/
  cozy_coast_scene.glb

public/models/trees/
  pine_01.glb
  pine_02.glb
  pine_03.glb

public/models/props/
  rock_01.glb
  rock_02.glb
  driftwood_01.glb
  dock_01.glb
  grass_clump_01.glb
```

For Three’s reflective water, copy the water normals texture:

```bash
mkdir -p public/textures
cp node_modules/three/examples/textures/waternormals.jpg public/textures/waternormals.jpg
```

If that file path changes in a future Three version, use any seamless water normal map instead.

---

## 6. Add a quality setting

Create:

```tsx
// apps/client/src/world-art/quality.ts
export type WorldArtQuality = 'low' | 'medium' | 'high';

export function chooseWorldArtQuality(): WorldArtQuality {
  if (typeof window === 'undefined') {
    return 'medium';
  }

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };

  if (nav.connection?.saveData) {
    return 'low';
  }

  if (nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === '3g') {
    return 'low';
  }

  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) {
    return 'medium';
  }

  if (window.devicePixelRatio > 1.5) {
    return 'medium';
  }

  return 'high';
}
```

This is intentionally simple. Later, you can store a user-selected quality option in local storage.

---

## 7. Add the main art wrapper

Create:

```tsx
// apps/client/src/world-art/CozyWorldArt.tsx
import { Sky } from '@react-three/drei';

import { CozyAtmosphere } from './CozyAtmosphere';
import { CozyPostProcessing } from './CozyPostProcessing';
import { CozyPineForest } from './CozyPineForest';
import { ReflectiveWorldWater } from './ReflectiveWorldWater';
import { SimpleStylizedWater } from './SimpleStylizedWater';
import type { WorldArtQuality } from './quality';

type Focus = { x: number; y?: number; z: number };

type CozyWorldArtProps = {
  focus: Focus;
  quality: WorldArtQuality;
};

export function CozyWorldArt({ focus, quality }: CozyWorldArtProps) {
  const high = quality === 'high';
  const low = quality === 'low';

  return (
    <>
      <CozyAtmosphere focus={focus} quality={quality} />

      <Sky
        distance={4500}
        sunPosition={[400, 220, 280]}
        turbidity={6}
        rayleigh={2.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {high ? <ReflectiveWorldWater focus={focus} /> : <SimpleStylizedWater focus={focus} />}

      <CozyPineForest focus={focus} quality={quality} />

      {!low && <CozyPostProcessing quality={quality} />}
    </>
  );
}
```

This wrapper keeps all art upgrades in one place and makes it easy to turn the layer on/off.

---

## 8. Add atmosphere, fog, and lighting

Create:

```tsx
// apps/client/src/world-art/CozyAtmosphere.tsx
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { WorldArtQuality } from './quality';

type Focus = { x: number; y?: number; z: number };

type CozyAtmosphereProps = {
  focus: Focus;
  quality: WorldArtQuality;
};

export function CozyAtmosphere({ focus, quality }: CozyAtmosphereProps) {
  const { scene } = useThree();

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;

    scene.background = new THREE.Color('#78ccea');
    scene.fog = new THREE.Fog('#a9deea', quality === 'low' ? 180 : 120, quality === 'low' ? 760 : 950);

    return () => {
      scene.background = previousBackground;
      scene.fog = previousFog;
    };
  }, [quality, scene]);

  return (
    <>
      <hemisphereLight color="#c7f7ff" groundColor="#31563a" intensity={1.15} />

      <directionalLight
        position={[focus.x + 120, 180, focus.z + 90]}
        color="#fff0b8"
        intensity={2.1}
        castShadow={quality === 'high'}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
      />

      <ambientLight color="#8fcbd5" intensity={0.18} />
    </>
  );
}
```

Notes:

- The screenshot’s coziness depends heavily on blue atmospheric haze.
- Keep fog close. Distant trees should fade into blue.
- Warm sunlight on pale sand is important; avoid cold white sunlight.

---

## 9. Add subtle postprocessing

Create:

```tsx
// apps/client/src/world-art/CozyPostProcessing.tsx
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

import type { WorldArtQuality } from './quality';

type CozyPostProcessingProps = {
  quality: WorldArtQuality;
};

export function CozyPostProcessing({ quality }: CozyPostProcessingProps) {
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      <Bloom
        intensity={quality === 'high' ? 0.32 : 0.22}
        luminanceThreshold={0.82}
        luminanceSmoothing={0.25}
        mipmapBlur
      />

      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />

      <Vignette eskil={false} offset={0.22} darkness={0.32} />
    </EffectComposer>
  );
}
```

Important correction:

Do **not** blindly double-tone-map. Start with the `ToneMapping` effect above and do not also set `gl.toneMapping = THREE.ACESFilmicToneMapping` in the Canvas. If the image is too washed out, tune lights/material colors first, then experiment with renderer tone mapping.

---

## 10. Add water, with fallback

### 10.1 Low/medium stylized water

Create:

```tsx
// apps/client/src/world-art/SimpleStylizedWater.tsx
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type Focus = { x: number; z: number };

type SimpleStylizedWaterProps = {
  focus: Focus;
};

export function SimpleStylizedWater({ focus }: SimpleStylizedWaterProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#15516b') },
      uShallow: { value: new THREE.Color('#63e6d1') },
      uFoam: { value: new THREE.Color('#e6fff5') },
    }),
    [],
  );

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  return (
    <mesh
      position={[focus.x - 420, -0.18, focus.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={false}
      raycast={() => null}
    >
      <planeGeometry args={[900, 1400, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={waterVertexShader}
        fragmentShader={waterFragmentShader}
      />
    </mesh>
  );
}

const waterVertexShader = `
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vUv = uv;

    vec3 p = position;
    p.z += sin(position.x * 0.035 + uTime * 1.2) * 0.08;
    p.z += sin(position.y * 0.045 + uTime * 0.8) * 0.05;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const waterFragmentShader = `
  varying vec2 vUv;

  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;

  void main() {
    float depth = smoothstep(0.18, 0.72, vUv.x);
    float ripple = sin(vUv.y * 55.0 + uTime * 1.8) * 0.025;
    float smallRipple = sin((vUv.x + vUv.y) * 90.0 - uTime * 2.4) * 0.015;

    vec3 color = mix(uShallow, uDeep, clamp(depth + ripple + smallRipple, 0.0, 1.0));

    float foamLine = 1.0 - smoothstep(0.035, 0.08, abs(vUv.x - 0.18));
    color = mix(color, uFoam, foamLine * 0.35);

    gl_FragColor = vec4(color, 0.76);
  }
`;
```

This water is cheap and stylized. It may fit the reference better than physically reflective water on mobile.

### 10.2 High-quality reflective water

Create:

```tsx
// apps/client/src/world-art/ReflectiveWorldWater.tsx
import { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

type Focus = { x: number; z: number };

type ReflectiveWorldWaterProps = {
  focus: Focus;
};

export function ReflectiveWorldWater({ focus }: ReflectiveWorldWaterProps) {
  const normals = useLoader(THREE.TextureLoader, '/textures/waternormals.jpg');

  useEffect(() => {
    normals.wrapS = THREE.RepeatWrapping;
    normals.wrapT = THREE.RepeatWrapping;
  }, [normals]);

  const water = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(4200, 4200);

    const instance = new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0.4, 0.65, 0.3).normalize(),
      sunColor: 0xffe9b3,
      waterColor: 0x1a4a5e,
      distortionScale: 2.4,
      fog: true,
    });

    instance.rotation.x = -Math.PI / 2;
    instance.position.y = -0.3;
    instance.raycast = () => undefined;

    return instance;
  }, [normals]);

  useFrame((_, delta) => {
    water.position.x = focus.x - 460;
    water.position.z = focus.z;
    water.material.uniforms.time.value += delta * 0.55;
  });

  useEffect(() => {
    return () => {
      water.geometry.dispose();
      water.material.dispose();
    };
  }, [water]);

  return <primitive object={water} />;
}
```

Why use `<primitive>` instead of `<water>`?

- It avoids TypeScript JSX intrinsic-element friction.
- It avoids needing `extend({ Water })` and custom declarations.
- It is easier to make non-raycastable.

Important:

```tsx
instance.raycast = () => undefined;
```

Water should not steal click-to-move intersections from the terrain.

---

## 11. Add real pine forest assets

### 11.1 First-pass easy version using `Clone`

This is the easiest drop-in. It is not the most optimal, but it is good enough for a hero zone with tens of trees.

```tsx
// apps/client/src/world-art/CozyPineForest.tsx
import { Clone, useGLTF } from '@react-three/drei';
import { useMemo } from 'react';

import { makeCozyTreeScatter } from './cozyScatter';
import type { WorldArtQuality } from './quality';

type Focus = { x: number; z: number };

type CozyPineForestProps = {
  focus: Focus;
  quality: WorldArtQuality;
};

export function CozyPineForest({ focus, quality }: CozyPineForestProps) {
  const pineA = useGLTF('/models/trees/pine_01.glb');
  const pineB = useGLTF('/models/trees/pine_02.glb');
  const pineC = useGLTF('/models/trees/pine_03.glb');

  const trees = useMemo(() => makeCozyTreeScatter(quality), [quality]);
  const models = [pineA.scene, pineB.scene, pineC.scene];

  return (
    <group>
      {trees.map((tree) => (
        <Clone
          key={tree.id}
          object={models[tree.variant]}
          position={[focus.x + tree.x, tree.y, focus.z + tree.z]}
          rotation={[0, tree.rotationY, 0]}
          scale={tree.scale}
          castShadow={quality === 'high'}
          receiveShadow={false}
        />
      ))}
    </group>
  );
}

useGLTF.preload('/models/trees/pine_01.glb');
useGLTF.preload('/models/trees/pine_02.glb');
useGLTF.preload('/models/trees/pine_03.glb');
```

Create the scatter:

```tsx
// apps/client/src/world-art/cozyScatter.ts
import type { WorldArtQuality } from './quality';

type TreeTransform = {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  variant: 0 | 1 | 2;
};

function mulberry32(seed: number): () => number {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCozyTreeScatter(quality: WorldArtQuality): TreeTransform[] {
  const rand = mulberry32(1337);
  const count = quality === 'low' ? 36 : quality === 'medium' ? 72 : 120;
  const trees: TreeTransform[] = [];

  for (let i = 0; i < count; i += 1) {
    const band = rand();
    const x = 80 + band * 360 + rand() * 40;
    const z = -340 + rand() * 680;
    const scale = 1.3 + rand() * 1.25;

    trees.push({
      id: `pine-${i}`,
      x,
      y: 0,
      z,
      rotationY: rand() * Math.PI * 2,
      scale,
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
    });
  }

  return trees;
}
```

This assumes:

```txt
water/beach on the negative X side
forest wall on the positive X side
```

If the camera orientation changes, rotate the scatter layout rather than changing the whole art system.

### 11.2 Production version using instancing

Once the scene looks good, convert repeated tree meshes to instances.

Options:

```txt
1. Use gltfjsx --transform --instance
2. Use Drei Instances/Merged
3. Write your own InstancedMesh wrapper per mesh/material pair
```

Important: many GLB trees contain multiple meshes/materials. A single `THREE.InstancedMesh` only covers one geometry/material pair. For production, either use `gltfjsx --instance` or build one instanced mesh per part.

---

## 12. Add terrain UVs before texture maps

The current generated terrain needs UVs for map/normalMap. Add UVs in `createTerrainGeometry()`.

Inside `createTerrainGeometry(originX, originZ)` add:

```ts
const uvs = new Float32Array(vertexCount * 2);
```

Inside the vertex loop, after `worldX` and `worldZ` are known:

```ts
const uvBase = vertexIndex * 2;
uvs[uvBase] = worldX / 32;
uvs[uvBase + 1] = worldZ / 32;
```

Before `computeVertexNormals()`:

```ts
geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
```

Full patch shape:

```ts
function createTerrainGeometry(originX: number, originZ: number): THREE.BufferGeometry {
  const size = WORLD_SETTINGS.terrainChunkSize;
  const segments = WORLD_SETTINGS.terrainChunkSegments;
  const verticesPerSide = segments + 1;
  const vertexCount = verticesPerSide * verticesPerSide;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const color = new THREE.Color();
  const accentColor = new THREE.Color();

  for (let zIndex = 0; zIndex < verticesPerSide; zIndex += 1) {
    for (let xIndex = 0; xIndex < verticesPerSide; xIndex += 1) {
      const vertexIndex = zIndex * verticesPerSide + xIndex;
      const xOffset = (xIndex / segments) * size;
      const zOffset = (zIndex / segments) * size;
      const worldX = originX + xOffset;
      const worldZ = originZ + zOffset;
      const terrain = sampleTerrain(worldX, worldZ);

      const base = vertexIndex * 3;
      positions[base] = worldX;
      positions[base + 1] = terrain.height;
      positions[base + 2] = worldZ;

      const uvBase = vertexIndex * 2;
      uvs[uvBase] = worldX / 32;
      uvs[uvBase + 1] = worldZ / 32;

      color
        .set(terrain.groundColor)
        .lerp(accentColor.set(terrain.accentColor), heightTint(terrain.height));
      color.toArray(colors, base);
    }
  }

  // existing indices loop stays the same

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}
```

---

## 13. Quick terrain texture pass

After UVs exist, add a simple terrain texture material.

Create a hook:

```tsx
// apps/client/src/world-art/useTerrainTextures.ts
import { useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

export function useTerrainTextures() {
  const textures = useLoader(THREE.TextureLoader, [
    '/textures/sand_color.jpg',
    '/textures/sand_normal.jpg',
  ]);

  useEffect(() => {
    for (const texture of textures) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = texture === textures[0] ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    }
  }, [textures]);

  return {
    colorMap: textures[0],
    normalMap: textures[1],
  };
}
```

Then in `TerrainChunk`, use it only when visible:

```tsx
const terrainTextures = useTerrainTextures();

<meshStandardMaterial
  map={colliderOnly ? null : terrainTextures.colorMap}
  normalMap={colliderOnly ? null : terrainTextures.normalMap}
  vertexColors
  roughness={0.95}
  metalness={0.02}
  transparent={colliderOnly}
  opacity={colliderOnly ? 0 : 1}
  depthWrite={!colliderOnly}
/>
```

This is not a perfect biome blend. It is a cheap perceptual win.

For the final cozy coast, an authored GLB terrain scene will look better than procedural texture blending.

---

## 14. Make WorldGround usable as an invisible collider

Add a prop:

```ts
type GroundVisualMode = 'normal' | 'textured' | 'collider';

type WorldGroundProps = {
  focus: Vec3D;
  onMove: (target: VecXZ) => void;
  cameraControlsRef?: MutableRefObject<CameraControls | null>;
  touchClaimRef?: MutableRefObject<Set<number>>;
  visualMode?: GroundVisualMode;
};
```

Change the export:

```tsx
export function WorldGround({
  focus,
  onMove,
  cameraControlsRef,
  touchClaimRef,
  visualMode = 'normal',
}: WorldGroundProps) {
  // existing code
}
```

Thread it into chunks:

```tsx
<TerrainChunk
  key={`${chunk.x}:${chunk.z}`}
  originX={chunk.x}
  originZ={chunk.z}
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  onPointerUp={handlePointerUp}
  visualMode={visualMode}
/>
```

Update `TerrainChunk` props:

```tsx
type TerrainChunkProps = {
  originX: number;
  originZ: number;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  visualMode?: GroundVisualMode;
};
```

Then material logic:

```tsx
function TerrainChunk({
  originX,
  originZ,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  visualMode = 'normal',
}: TerrainChunkProps) {
  const geometry = useMemo(() => createTerrainGeometry(originX, originZ), [originX, originZ]);
  const colliderOnly = visualMode === 'collider';

  return (
    <mesh
      geometry={geometry}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      receiveShadow={!colliderOnly}
    >
      <meshStandardMaterial
        vertexColors
        roughness={0.98}
        metalness={0.02}
        transparent={colliderOnly}
        opacity={colliderOnly ? 0 : 1}
        depthWrite={!colliderOnly}
      />
    </mesh>
  );
}
```

Do **not** set `visible={false}`. Invisible meshes do not participate the same way you want for interaction. Transparent material with opacity 0 is the safer collider path.

---

## 15. Integrate into WorldScene

Change imports:

```tsx
import { useMemo, useRef, type MutableRefObject } from 'react';

import { CozyWorldArt } from './world-art/CozyWorldArt';
import { chooseWorldArtQuality } from './world-art/quality';
```

Inside `WorldScene`:

```tsx
const worldArtQuality = useMemo(() => chooseWorldArtQuality(), []);
```

Then replace the current visual block.

Initial quick pass:

```tsx
<Canvas
  camera={{ position: [0, 14, 20], fov: 52, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
  onCreated={({ gl }) => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, worldArtQuality === 'high' ? 2 : 1.5));
  }}
>
  <CozyWorldArt focus={focus} quality={worldArtQuality} />

  <WorldGround
    focus={focus}
    onMove={onMove}
    cameraControlsRef={cameraControlsRef}
    touchClaimRef={touchClaimRef}
    visualMode="textured"
  />

  {/* Keep these while testing, then hide them in the hero zone if they fight the art direction. */}
  <WorldFeatures focus={focus} />
  <ZoneLandmarks focus={focus} />

  {/* Existing players, enemies, NPCs, loot, VFX, camera stay here. */}
</Canvas>
```

Hero-zone pass:

```tsx
<Canvas
  camera={{ position: [0, 12, 18], fov: 50, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
  onCreated={({ gl }) => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, worldArtQuality === 'high' ? 2 : 1.5));
  }}
>
  <CozyWorldArt focus={focus} quality={worldArtQuality} />
  <CozyCoastScene />

  <WorldGround
    focus={focus}
    onMove={onMove}
    cameraControlsRef={cameraControlsRef}
    touchClaimRef={touchClaimRef}
    visualMode="collider"
  />

  {/* Existing players, enemies, NPCs, loot, VFX, camera stay here. */}
</Canvas>
```

Remove or avoid duplicating:

```tsx
<color attach="background" ... />
<fog attach="fog" ... />
<WorldEnvironment focus={focus} />
```

`CozyWorldArt` now owns atmosphere, sky, fog, lighting, water, and trees.

---

## 16. Add authored cozy coast scene

This is the step that turns “nice visual upgrade” into “beautiful place.”

Create a simple scene in Blender:

```txt
cozy_coast_scene.glb
  - pale sand beach foreground
  - shallow water edge / shoreline strip
  - grass transition band
  - pine-covered hill shapes
  - distant blue/green hill silhouettes
  - dock or broken pier on left waterline
  - rocks and shells on beach
  - driftwood/logs
  - 3–5 hand-placed hero trees
```

Export as GLB and place:

```txt
public/models/world/cozy-coast/cozy_coast_scene.glb
```

Create:

```tsx
// apps/client/src/world-art/CozyCoastScene.tsx
import { useGLTF } from '@react-three/drei';
import { useEffect } from 'react';
import * as THREE from 'three';

export function CozyCoastScene() {
  const gltf = useGLTF('/models/world/cozy-coast/cozy_coast_scene.glb');

  useEffect(() => {
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  return <primitive object={gltf.scene} />;
}

useGLTF.preload('/models/world/cozy-coast/cozy_coast_scene.glb');
```

Important art direction:

```txt
Do not make the whole world procedural first.
Make one starter area beautiful.
Then expand the style outward.
```

---

## 17. Camera tuning

The screenshot works because the camera is not too top-down. It sees horizon, waterline, and forest silhouettes.

Target:

```txt
FOV: 48–55
Camera height: lower than current if possible
Angle: enough horizon to see fog/tree wall
Player size on screen: medium-small, not huge
```

Try:

```tsx
camera={{ position: [0, 12, 18], fov: 50, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
```

Camera polish matters as much as assets. A beautiful scene can still look bad from a tactical top-down angle.

---

## 18. Mobile/browser performance budgets

Target budgets for the first cozy coast:

```txt
Initial art payload: 8–20 MB compressed
Visible triangles near camera: 100k–250k desktop, 50k–120k mobile
Draw calls: under 150 desktop, under 90 mobile
Realtime shadows: high only
Grass shadows: off
Water reflection: high only
Postprocessing: medium/high only
Texture size: 512–1024 mostly
Far forest: low-poly rows or billboard cards
```

Quality table:

| Feature | Low | Medium | High |
|---|---|---|---|
| Sky | yes | yes | yes |
| Fog | yes | yes | yes |
| Simple water | yes | yes | no |
| Reflective water | no | no | yes |
| Postprocessing | no | subtle | full subtle |
| Tree count | 36 | 72 | 120+ |
| Shadows | off/minimal | sun only maybe | sun shadows |
| Pixel ratio cap | 1.25 | 1.5 | 2 |

---

## 19. Asset optimization workflow

After the art direction works, optimize GLBs.

### gltfjsx

Use this for converting GLBs into R3F components:

```bash
pnpm dlx gltfjsx public/models/world/cozy-coast/cozy_coast_scene.glb \
  --transform \
  --types \
  --shadows
```

For heavily repeated assets, experiment with:

```bash
pnpm dlx gltfjsx public/models/trees/pine_01.glb \
  --transform \
  --types \
  --instance
```

### glTF Transform

Use this to compress/rescale textures:

```bash
pnpm dlx @gltf-transform/cli optimize \
  public/models/world/cozy-coast/cozy_coast_scene.glb \
  public/models/world/cozy-coast/cozy_coast_scene.optimized.glb \
  --texture-compress webp \
  --texture-size 1024
```

Use `.optimized.glb` in production after visual review.

---

## 20. Rollout strategy

No feature flags. No half-made merged states.

Roll out by branch discipline:

```txt
1. Work on a feature branch.
2. Keep the branch unmerged until the default starter area is visibly coherent.
3. Compare old/new screenshots locally or in PR attachments, not through a runtime switch.
4. Merge only when the default game is better, click-to-move still works, mobile fallback exists, and checks pass.
```

In `WorldScene`, the merged code should read as the product's actual presentation, not an experiment:

```tsx
<CozyWorldArt focus={focus} quality={worldArtQuality} />
<WorldGround ... />
```

Keep runtime fallback only for robustness:

```txt
- low-quality water instead of reflective water on weak devices
- fallback primitive tree if a GLB fails
- old procedural terrain outside the authored starter-coast radius
```

Do not keep a permanent old/new environment toggle in production code.

---

## 21. Acceptance criteria

### Visual acceptance

A screenshot from the starter area should show:

```txt
- pale beach foreground
- blue/turquoise water on one side
- warm sunlight
- close blue fog
- visible horizon / tree line
- real stylized pine silhouettes
- fewer obvious primitive cone/cylinder trees
- ground has material grain, not just flat color
```

### Technical acceptance

```txt
pnpm run dev works
pnpm run build works
pnpm run typecheck works
pnpm run lint works
click-to-move still works
water does not intercept clicks
mobile quality uses simple water and no heavy postprocessing
old world art can be toggled back for comparison
```

### Performance acceptance

```txt
Desktop: stable and screenshotable with high quality
Mobile/laptop: low/medium quality avoids reflective water and heavy composer
No giant uncompressed textures
No hundreds of individual draw-call tree clones in production
```

---

## 22. What not to do

Avoid these traps:

```txt
Do not try to make infinite procedural terrain beautiful first.
Do not spend weeks writing terrain noise before adding real assets.
Do not use 4K textures everywhere.
Do not turn on bloom too high.
Do not double-tone-map without testing.
Do not let water or visual props steal click-to-move raycasts.
Do not keep the primitive tree layer visible if it clashes with real GLB trees.
Do not import huge Unity packs directly without conversion/optimization.
```

---

## 23. Fastest “orders of magnitude nicer” checklist

Do this first:

```bash
pnpm add @react-three/drei @react-three/postprocessing postprocessing
```

Then:

```txt
1. Add CozyWorldArt wrapper
2. Add Drei Sky
3. Add blue fog + warm sun
4. Add SimpleStylizedWater
5. Add subtle postprocessing
6. Add Quaternius GLB pines with Clone
7. Add WorldGround visualMode='collider'
8. Add authored cozy_coast_scene.glb
```

This sequence changes the game from “procedural prototype” to “cozy stylized world.”

---

## 24. Agent handoff prompt

Use this exact prompt when assigning the first implementation PR after current roadmap work is merged:

```txt
Read /home/s/Downloads/vibeage-cozy-coast-visual-upgrade-plan.md.

Implement PR 1 only: Complete cozy-coast starter slice.

Constraints:

- Work from a fresh branch off latest main.
- Before editing, run git status -sb; stop if unrelated local changes are present.
- Do not touch server gameplay, protocol, combat, mini-boss content, onboarding work, persistence, or roadmap cleanup.
- No feature flags and no hidden old/new runtime switch.
- Do not merge a foundation-only change. The default starter-area scene must look visibly better in this PR.
- Add packages only on this feature branch:

  pnpm add @react-three/drei @react-three/postprocessing postprocessing

Scope:

  package.json
  pnpm-lock.yaml
  apps/client/src/WorldScene.tsx
  apps/client/src/world-art/quality.ts
  apps/client/src/world-art/CozyWorldArt.tsx
  apps/client/src/world-art/CozyAtmosphere.tsx
  apps/client/src/world-art/SimpleStylizedWater.tsx
  apps/client/src/world-art/CozyShoreBand.tsx
  apps/client/src/world-art/CozyStarterPines.tsx
  apps/client/src/world-art/worldArtScenes.ts
  apps/client/src/world-art/cozyScatter.ts
  tests/worldArtQuality.spec.ts
  tests/worldArtScenes.spec.ts
  tests/e2e-vite/cozy-world-art.spec.ts

Implement:

- chooseWorldArtQuality().
- CozyWorldArt wrapper.
- CozyAtmosphere.
- SimpleStylizedWater, non-raycastable.
- CozyShoreBand.
- CozyStarterPines or equivalent intentional starter-area tree silhouettes.
- worldArtScenes anchored near starter spawn, with water on negative X.
- Wire the cozy starter scene into WorldScene as the default starter-area presentation.

Do not implement yet:

- GLB assets.
- Terrain UVs.
- WorldGround collider mode.
- Authored coast scene.

Required checks:

  pnpm run typecheck:client
  pnpm run lint
  pnpm run build
  pnpm test -- tests/worldArtQuality.spec.ts tests/worldArtScenes.spec.ts
  pnpm run test:e2e:vite -- tests/e2e-vite/cozy-world-art.spec.ts

PR body should include:

- What files own the new visual layer.
- Confirmation that the starter-area default view includes sky/fog/warm light/water/shore/tree silhouettes.
- Confirmation that water does not intercept click-to-move.
- Checks run.
```

---

## 25. Asset manifest template

Copy one block per imported asset into `public/models/ASSET_MANIFEST.md` or the relevant committed asset manifest.

### Asset entry

```txt
asset id:
repo path:
source URL:
source pack/archive:
original filename:
author:
license:
license URL:
download date:
modified by:
optimization command:
original size:
optimized size:
runtime use:
attribution required:
notes:
```

### Example

```txt
asset id: pine_01
repo path: public/models/trees/pine_01.glb
source URL: https://example.invalid/source-pack
source pack/archive: Ultimate Stylized Nature Pack
original filename: Pine_01.glb
author: Example Author
license: CC0 / public-domain / permissive license name here
license URL: https://example.invalid/license
download date: 2026-05-22
modified by: gltf-transform optimize
optimization command: pnpm dlx @gltf-transform/cli optimize input.glb output.glb --texture-compress webp --texture-size 1024
original size: 0 MB
optimized size: 0 MB
runtime use: cozy coast tree cluster
attribution required: no / yes, exact text here
notes: Keep as first-pass placeholder until instancing pass.
```

### Pre-merge asset checks

```txt
- source is allowed for commercial/browser game use
- attribution requirement is recorded
- no editor/cache/source archive accidentally committed
- GLB opens locally
- texture dimensions are not excessive
- build succeeds
- visual fallback exists if asset fails to load
```

---

## 26. Source/reference notes

These references were used to shape the plan:

- Vibeage repo: https://github.com/samoylenkodmitry/vibeage
- Vibeage `WorldScene.tsx`: https://github.com/samoylenkodmitry/vibeage/blob/main/apps/client/src/WorldScene.tsx
- Vibeage `WorldGround.tsx`: https://github.com/samoylenkodmitry/vibeage/blob/main/apps/client/src/WorldGround.tsx
- Vibeage `WorldEnvironment.tsx`: https://github.com/samoylenkodmitry/vibeage/blob/main/apps/client/src/WorldEnvironment.tsx
- Drei docs: https://drei.docs.pmnd.rs/
- Drei `useGLTF`: https://drei.docs.pmnd.rs/loaders/gltf-use-gltf
- Three Water docs: https://threejs.org/docs/pages/Water.html
- React Postprocessing Bloom docs: https://react-postprocessing.docs.pmnd.rs/effects/bloom
- React Postprocessing ToneMapping docs: https://react-postprocessing.docs.pmnd.rs/effects/tone-mapping
- Quaternius Ultimate Stylized Nature Pack: https://quaternius.com/packs/ultimatestylizednature.html
- Quaternius Stylized Nature MegaKit: https://quaternius.itch.io/stylized-nature-megakit
- ambientCG license: https://docs.ambientcg.com/license/
- gltfjsx: https://github.com/pmndrs/gltfjsx
- glTF Transform: https://gltf-transform.dev/

---

## 27. Final recommendation

The best path is not “procedural terrain, but prettier.”

The best path is:

```txt
A small authored cozy coast art layer
+ real stylized assets
+ sky/fog/water/postprocessing
+ transparent gameplay collider underneath
```

That is easy to drop into the current project, works in the browser, and gives the biggest visual improvement per hour.
