import { RoundedBox, SpotLight } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Neo kinpaku product-stage interior — fully procedural, no external assets.
 * Palette: dark lacquer vendame, brass/gold metal, caramel leather,
 * low-contrast amber light. All geometry is a handful of primitives (<1k tris).
 *
 * Room layout math:
 *  - Floor plane 12x12 at y = -0.37 (model feet sit at y = -0.352, so the
 *    hem hovers ~2cm above the floor and the ContactShadows plane at -0.36
 *    still lands between floor and rug).
 *  - Back wall plane at z = -2.5, sized 12x4 to fill the furthest-camera
 *    (maxDistance 2.8, fov 30) frustum at eye level.
 *  - Practical strip light: emissive box at back-left (x -1.9, z -2.35),
 *    height 2.6 — tall/thin like a gallery light column.
 */

/** 2048px canvas-generated warm oak plank texture with grain streaks + gaps. */
function makeOakFloorTexture(): THREE.CanvasTexture {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Plank grid: 8 planks across the tile; each plank gets a stable hue/brightness.
  const plankCount = 8;
  const plankW = size / plankCount; // 256px
  const base = { h: 28, s: 32, l: 38 }; // warm oak ~#9a7a54 in hsl terms

  ctx.fillStyle = `hsl(${base.h} ${base.s}% ${base.l}%)`;
  ctx.fillRect(0, 0, size, size);

  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647; // deterministic LCG so the floor doesn't flicker
    return seed / 2147483647;
  };

  for (let p = 0; p < plankCount; p++) {
    const x0 = p * plankW;
    // Per-plank tone variation
    const l = base.l + (rand() - 0.5) * 10;
    const h = base.h + (rand() - 0.5) * 6;
    ctx.fillStyle = `hsl(${h} ${base.s}% ${l}%)`;
    ctx.fillRect(x0, 0, plankW, size);

    // Grain streaks: long thin vertical strokes, jittered alpha
    ctx.strokeStyle = 'hsla(24 30% 22% / 0.35)';
    for (let g = 0; g < 46; g++) {
      const gx = x0 + rand() * plankW;
      const y0 = rand() * size;
      const len = 120 + rand() * 600;
      ctx.lineWidth = 0.6 + rand() * 1.6;
      ctx.globalAlpha = 0.12 + rand() * 0.3;
      ctx.beginPath();
      ctx.moveTo(gx, y0);
      ctx.bezierCurveTo(gx + (rand() - 0.5) * 8, y0 + len * 0.33, gx + (rand() - 0.5) * 8, y0 + len * 0.66, gx, y0 + len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Occasional knot
    if (p % 3 === 0) {
      const kx = x0 + plankW * (0.3 + rand() * 0.4);
      const ky = rand() * size;
      const kr = 6 + rand() * 10;
      const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr);
      grad.addColorStop(0, 'hsla(22 32% 16% / 0.8)');
      grad.addColorStop(1, 'hsla(22 32% 16% / 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, kr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Plank gap: dark seam on the right edge of each plank
    ctx.fillStyle = 'hsla(20 30% 8% / 0.9)';
    ctx.fillRect(x0 + plankW - 3, 0, 3, size);

    // Board joints across planks (end-grain seams)
    const joints = 2 + Math.floor(rand() * 2);
    for (let j = 0; j < joints; j++) {
      ctx.fillRect(x0, ((j + 1) / (joints + 1)) * size, plankW - 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2); // 12m plane -> 6m oak tile, boards run along z
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Floor() {
  const tex = useMemo(() => makeOakFloorTexture(), []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.37, 0]} receiveShadow>
      <planeGeometry args={[12, 12]} />
      <meshStandardMaterial map={tex} roughness={0.6} metalness={0} />
    </mesh>
  );
}

/** Desaturated terracotta/rust rug — oklch(60% 0.08 40) ≈ #b5714d. */
function Rug() {
  return (
    <RoundedBox
      args={[2.6, 0.02, 1.8]}
      radius={0.008}
      smoothness={4}
      position={[0, -0.36, 0.1]} // 1cm above floor so it never z-fights
      receiveShadow
    >
      <meshStandardMaterial color="#b06a47" roughness={0.95} metalness={0} />
    </RoundedBox>
  );
}

/** Warm plaster back wall — oklch(18% 0.01 90) ≈ #2b2721. */
function BackWall() {
  return (
    <mesh position={[0, 1.63, -2.5]} receiveShadow>
      <planeGeometry args={[12, 4]} />
      <meshStandardMaterial color="#2b2721" roughness={0.92} metalness={0} />
    </mesh>
  );
}

/** Brass stool — oklch(84% 0.19 80.46) ≈ #f0b429 gold, kept small and off-axis. */
function BrassStool() {
  return (
    <group position={[0.95, -0.37, -0.55]} scale={0.8}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.025, 32]} />
        <meshStandardMaterial color="#e0a93c" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.05, 0.2, 24]} />
        <meshStandardMaterial color="#e0a93c" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Caramel leather ottoman — #a56a2f, low and off to the opposite side. */
function LeatherOttoman() {
  return (
    <RoundedBox
      args={[0.42, 0.18, 0.3]}
      radius={0.045}
      smoothness={4}
      position={[-1.05, -0.28, -0.35]}
      rotation-y={0.4}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#a56a2f" roughness={0.7} metalness={0} />
    </RoundedBox>
  );
}

/** Vertical warm practical strip at back-left + matching soft spotlight. */
function PracticalLight() {
  return (
    <group>
      <mesh position={[-1.9, 1.0, -2.35]}>
        <boxGeometry args={[0.06, 2.6, 0.06]} />
        <meshStandardMaterial
          color="#ffd9a0"
          emissive="#ffd9a0"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <SpotLight
        position={[-1.85, 1.1, -2.3]}
        target-position={[-0.2, 0, 0]}
        intensity={18}
        distance={7}
        angle={0.6}
        penumbra={1}
        color="#ffd9a0"
      />
    </group>
  );
}

export default function Interior() {
  return (
    <group>
      <Floor />
      <Rug />
      <BackWall />
      <BrassStool />
      <LeatherOttoman />
      <PracticalLight />
    </group>
  );
}
