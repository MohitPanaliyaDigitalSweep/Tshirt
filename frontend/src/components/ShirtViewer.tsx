import { ContactShadows, OrbitControls, useGLTF, useTexture } from '@react-three/drei';
import Interior from './Interior';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';

export type DecalZone = 'front' | 'back' | 'sleeve_left' | 'sleeve_right';

/** Fine-grained print anchors. Each maps to one raycast against the shirt mesh. */
export type DecalAnchorId =
  | 'front-center'
  | 'front-top-left'
  | 'front-top-right'
  | 'front-bottom'
  | 'back-center'
  | 'back-top'
  | 'sleeve-left'
  | 'sleeve-right';

export interface ShirtDecal {
  zone: DecalZone;
  url: string;
  /** Fine anchor; defaults to the zone's primary anchor when omitted (back-compat). */
  anchor?: DecalAnchorId;
  /** Decal size in world units. Clamped to 0.04..0.25. */
  scale?: number;
}

interface ShirtViewerProps {
  /** Active/selected zone (legacy). Kept for compat; all zones render. */
  zone?: DecalZone;
  color?: string;
  /** Legacy per-zone artwork URLs. Used when `decals` is omitted. */
  artworks?: Partial<Record<DecalZone, string[]>>;
  /** Preferred decal list: one entry per artwork, placed by anchor. */
  decals?: ShirtDecal[];
  /** Wind flutter amount 0..1. Default 0.35. */
  wind?: number;
  /** Fabric swing multiplier. Default 1. */
  swingStrength?: number;
  /** Auto-rotate turntable. Default true. */
  autoRotate?: boolean;
  /** OrbitControls auto-rotate speed. Default 1.0. */
  autoRotateSpeed?: number;
  /** Extra classes merged into the container (which carries its own default height). */
  className?: string;
}

const MODEL_URL = '/models/shirt_baked_collapsed.glb';

/** Measured bounds of node T_Shirt_male: x±0.276 y-0.352..0.261 z-0.125..0.144. */
const MODEL_BOUNDS = {
  min: new THREE.Vector3(-0.276, -0.352, -0.125),
  max: new THREE.Vector3(0.276, 0.261, 0.144),
};
const MODEL_CENTER = MODEL_BOUNDS.min.clone().add(MODEL_BOUNDS.max).multiplyScalar(0.5);
const MODEL_SIZE = MODEL_BOUNDS.max.clone().sub(MODEL_BOUNDS.min);

interface RayDef {
  origin: [number, number, number];
  dir: [number, number, number];
  fallback: { position: [number, number, number]; rotation: [number, number, number] };
}

/** One ray per anchor, cast from outside the mesh toward its center axis. */
const RAY_DEFS: Record<DecalAnchorId, RayDef> = {
  'front-center': { origin: [0, 0.05, 1], dir: [0, 0, -1], fallback: { position: [0, 0.04, 0.15], rotation: [0, 0, 0] } },
  'front-top-left': { origin: [-0.12, 0.16, 1], dir: [0, 0, -1], fallback: { position: [-0.11, 0.15, 0.13], rotation: [0, 0, 0] } },
  'front-top-right': { origin: [0.12, 0.16, 1], dir: [0, 0, -1], fallback: { position: [0.11, 0.15, 0.13], rotation: [0, 0, 0] } },
  'front-bottom': { origin: [0, -0.12, 1], dir: [0, 0, -1], fallback: { position: [0, -0.13, 0.14], rotation: [0, 0, 0] } },
  'back-center': { origin: [0, 0.05, -1], dir: [0, 0, 1], fallback: { position: [0, 0.04, -0.135], rotation: [0, Math.PI, 0] } },
  'back-top': { origin: [0, 0.16, -1], dir: [0, 0, 1], fallback: { position: [0, 0.15, -0.12], rotation: [0, Math.PI, 0] } },
  'sleeve-left': { origin: [-1, 0.1, 0.02], dir: [1, 0, 0], fallback: { position: [-0.245, 0.1, 0.02], rotation: [0, -Math.PI / 2, 0] } },
  'sleeve-right': { origin: [1, 0.1, 0.02], dir: [-1, 0, 0], fallback: { position: [0.245, 0.1, 0.02], rotation: [0, Math.PI / 2, 0] } },
};

export const ANCHOR_IDS: DecalAnchorId[] = [
  'front-center',
  'front-top-left',
  'front-top-right',
  'front-bottom',
  'back-center',
  'back-top',
  'sleeve-left',
  'sleeve-right',
];

/** Legacy 4-zone -> primary anchor (back-compat for old snapshots/assets). */
export const DEFAULT_ANCHOR_FOR_ZONE: Record<DecalZone, DecalAnchorId> = {
  front: 'front-center',
  back: 'back-center',
  sleeve_left: 'sleeve-left',
  sleeve_right: 'sleeve-right',
};

const ANCHOR_DEFAULT_SCALE: Record<DecalAnchorId, number> = {
  'front-center': 0.13,
  'front-top-left': 0.09,
  'front-top-right': 0.09,
  'front-bottom': 0.11,
  'back-center': 0.13,
  'back-top': 0.1,
  'sleeve-left': 0.075,
  'sleeve-right': 0.075,
};

export function clampDecalScale(s: number | undefined, fallback: number): number {
  const v = typeof s === 'number' && Number.isFinite(s) ? s : fallback;
  return Math.min(0.25, Math.max(0.04, v));
}

interface ResolvedAnchor {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** True when the ray hit the mesh; false = legacy coordinate fallback. */
  hit: boolean;
}

export type ResolvedAnchors = Record<DecalAnchorId, ResolvedAnchor>;

const Z_UP = new THREE.Vector3(0, 0, 1);

function fallbackAnchor(id: DecalAnchorId): ResolvedAnchor {
  const f = RAY_DEFS[id].fallback;
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(f.rotation[0], f.rotation[1], f.rotation[2]),
  );
  const n = Z_UP.clone().applyQuaternion(q);
  return { position: new THREE.Vector3(...f.position), normal: n, quaternion: q, hit: false };
}

/** Casts the 8 anchor rays once the model is loaded; falls back to legacy coords on a miss. */
function AnchorResolver({ onResolve }: { onResolve: (a: ResolvedAnchors) => void }) {
  const { nodes } = useGLTF(MODEL_URL) as unknown as { nodes: Record<string, THREE.Mesh> };
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const mesh = nodes?.['T_Shirt_male'] as THREE.Mesh | undefined;
    const out = {} as ResolvedAnchors;
    if (!mesh?.geometry) {
      for (const id of ANCHOR_IDS) out[id] = fallbackAnchor(id);
      onResolve(out);
      return;
    }
    mesh.updateWorldMatrix(true, false);
    const ray = new THREE.Raycaster();
    ray.far = 10;
    for (const id of ANCHOR_IDS) {
      const def = RAY_DEFS[id];
      ray.set(
        new THREE.Vector3(...def.origin),
        new THREE.Vector3(...def.dir).normalize(),
      );
      const hits = ray.intersectObject(mesh, false);
      const hit = hits[0];
      if (hit && hit.face) {
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        const position = hit.point.clone().addScaledVector(normal, 0.003);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(Z_UP, normal);
        out[id] = { position, normal, quaternion, hit: true };
      } else {
        out[id] = fallbackAnchor(id);
      }
    }
    onResolve(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function DecalTextures({ decals, anchors }: { decals: ShirtDecal[]; anchors: ResolvedAnchors | null }) {
  const urls = decals.map((d) => d.url);
  const textures = useTexture(urls) as THREE.Texture[];
  const list = Array.isArray(textures) ? textures : [textures];

  useEffect(() => {
    for (const t of list) {
      if (!t) continue;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
    }
  }, [list]);

  // Count per anchor so stacked decals offset outward slightly.
  const counts: Record<DecalAnchorId, number> = {
    'front-center': 0,
    'front-top-left': 0,
    'front-top-right': 0,
    'front-bottom': 0,
    'back-center': 0,
    'back-top': 0,
    'sleeve-left': 0,
    'sleeve-right': 0,
  };

  return (
    <group>
      {decals.map((d, i) => {
        const tex = list[i];
        if (!tex) return null;
        const anchorId = d.anchor ?? DEFAULT_ANCHOR_FOR_ZONE[d.zone];
        const a = anchors?.[anchorId] ?? fallbackAnchor(anchorId);
        const k = counts[anchorId]++;
        const pos = a.position.clone().addScaledVector(a.normal, k * 0.0018);
        const scale = clampDecalScale(d.scale, ANCHOR_DEFAULT_SCALE[anchorId]);
        return (
          <mesh key={`${anchorId}-${d.url}-${i}`} position={pos} quaternion={a.quaternion}>
            <planeGeometry args={[scale, scale]} />
            <meshBasicMaterial
              map={tex}
              transparent
              toneMapped={false}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function ShirtMesh({
  color,
  uniforms,
}: {
  color: string;
  uniforms: {
    uSwing: { value: THREE.Vector2 };
    uTime: { value: number };
    uWind: { value: number };
  };
}) {
  const { nodes } = useGLTF(MODEL_URL) as unknown as { nodes: Record<string, THREE.Mesh> };
  const geometry = nodes?.['T_Shirt_male']?.geometry;

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: 0.85,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#ffffff'),
    });
    mat.onBeforeCompile = (shader: {
      uniforms: Record<string, THREE.IUniform>;
      vertexShader: string;
    }) => {
      shader.uniforms['uSwing'] = uniforms.uSwing;
      shader.uniforms['uTime'] = uniforms.uTime;
      shader.uniforms['uWind'] = uniforms.uWind;
      shader.vertexShader =
        'uniform vec2 uSwing;\nuniform float uTime;\nuniform float uWind;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float swingW = pow(clamp((0.05 - position.y) / 0.45, 0.0, 1.0), 1.4);
          transformed.x += uSwing.x * swingW;
          transformed.z += uSwing.y * swingW;
          transformed.y -= length(uSwing) * 0.35 * swingW
            + sin(uTime * 14.0 + position.y * 22.0 + position.x * 15.0) * 0.006 * uWind * swingW
            + sin(uTime * 1.8 + position.x * 4.0) * 0.003 * swingW;`,
        );
    };
    mat.customProgramCacheKey = () => 'shirt-fabric-swing-v1';
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    material.color.set(color);
  }, [material, color]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

/** Camera angular-velocity -> spring-damper fabric swing (stiffness 60, damping 6, clamp 0.05). */
function SwingDriver({
  uniforms,
  controlsRef,
  wind,
  strength,
}: {
  uniforms: {
    uSwing: { value: THREE.Vector2 };
    uTime: { value: number };
    uWind: { value: number };
  };
  controlsRef: React.RefObject<{ getAzimuthalAngle(): number; getPolarAngle(): number } | null>;
  wind: number;
  strength: number;
}) {
  const state = useRef({
    init: false,
    prevAz: 0,
    prevPol: 0,
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
  });

  useFrame((_, dtRaw) => {
    const dt = clamp(dtRaw, 0.0005, 0.05);
    uniforms.uTime.value += dt;
    uniforms.uWind.value += (wind - uniforms.uWind.value) * Math.min(1, dt * 3);

    const s = state.current;
    const controls = controlsRef.current;
    let tx = 0;
    let ty = 0;
    if (controls) {
      const az = controls.getAzimuthalAngle();
      const pol = controls.getPolarAngle();
      if (!s.init) {
        s.prevAz = az;
        s.prevPol = pol;
        s.init = true;
      } else {
        let dAz = az - s.prevAz;
        if (dAz > Math.PI) dAz -= Math.PI * 2;
        else if (dAz < -Math.PI) dAz += Math.PI * 2;
        const dPol = pol - s.prevPol;
        const azVel = dAz / dt;
        const polVel = dPol / dt;
        tx = clamp(-azVel * 0.02, -0.05, 0.05) * strength;
        ty = clamp(-polVel * 0.02, -0.05, 0.05) * strength;
        s.prevAz = az;
        s.prevPol = pol;
      }
    }
    const k = 60;
    const c = 6;
    const ax = -k * (s.sx - tx) - c * s.vx;
    const ay = -k * (s.sy - ty) - c * s.vy;
    s.vx += ax * dt;
    s.vy += ay * dt;
    const lim = 0.05 * Math.max(0, strength);
    s.sx = clamp(s.sx + s.vx * dt, -lim, lim);
    s.sy = clamp(s.sy + s.vy * dt, -lim, lim);
    uniforms.uSwing.value.set(s.sx, s.sy);
  });
  return null;
}

/** Distance that fits the whole shirt (with margin) for the current viewport aspect. */
function fitDistance(fovDeg: number, aspect: number, margin = 1.3): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const fitH = MODEL_SIZE.y / 2 / Math.tan(vFov / 2);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.5, aspect));
  const fitW = MODEL_SIZE.x / 2 / Math.tan(hFov / 2);
  return Math.max(fitH, fitW, MODEL_SIZE.z) * margin;
}

type ControlsLike = {
  getAzimuthalAngle(): number;
  getPolarAngle(): number;
  target: THREE.Vector3;
  update(): void;
};

/** Fits the camera to the model bounds on mount/resize; GSAP dolly-in on first mount. */
function FitRig({ controlsRef }: { controlsRef: React.RefObject<ControlsLike | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const introDone = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    const dist = fitDistance(camera.fov, size.width / Math.max(1, size.height));
    const dir = camera.position.clone().sub(controls?.target ?? MODEL_CENTER);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.08, 1);
    dir.normalize();
    const place = (d: number) => {
      if (controls) {
        controls.target.copy(MODEL_CENTER);
        controls.update();
      }
      camera.position.copy(MODEL_CENTER).addScaledVector(dir, d);
      camera.near = Math.max(0.05, d - 2);
      camera.far = d + 10;
      camera.updateProjectionMatrix();
    };
    if (!introDone.current) {
      introDone.current = true;
      place(dist * 1.55);
      const tween = gsap.to(camera.position, {
        x: MODEL_CENTER.x + dir.x * dist,
        y: MODEL_CENTER.y + dir.y * dist,
        z: MODEL_CENTER.z + dir.z * dist,
        duration: 1.4,
        ease: 'power2.out',
      });
      return () => {
        tween.kill();
      };
    }
    place(dist);
  }, [camera, controlsRef, size.width, size.height]);

  return null;
}

class ViewerErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: unknown): { error: string } {
    return { error: e instanceof Error ? e.message : '3D viewer failed to load' };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-lacquer-deep p-6 text-center">
          <p className="max-w-xs text-sm text-vermilion">
            Couldn&apos;t load the 3D model. {this.state.error}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ShirtViewer({
  color = '#e5e7eb',
  artworks,
  decals,
  wind = 0.35,
  swingStrength = 1,
  autoRotate = true,
  autoRotateSpeed = 1.0,
  className = '',
}: ShirtViewerProps) {
  const controlsRef = useRef<ControlsLike | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<ResolvedAnchors | null>(null);

  const uniforms = useMemo(
    () => ({
      uSwing: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uWind: { value: clamp(wind, 0, 1) },
    }),
    // Shared uniform objects live for the component lifetime; wind syncs per-frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const effectiveDecals: ShirtDecal[] = useMemo(() => {
    if (decals) return decals.filter((d) => d && d.url);
    const out: ShirtDecal[] = [];
    if (artworks) {
      for (const z of Object.keys(artworks) as DecalZone[]) {
        for (const url of artworks[z] ?? []) {
          if (url) out.push({ zone: z, url });
        }
      }
    }
    return out;
  }, [decals, artworks]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const tween = gsap.to(el, {
      opacity: 0,
      duration: 0.9,
      delay: 0.15,
      ease: 'power1.out',
      onComplete: () => {
        el.style.display = 'none';
      },
    });
    return () => {
      tween.kill();
    };
  }, []);

  return (
    <div
      className={`relative min-h-[420px] w-full overflow-hidden rounded-[6px] border border-rule bg-gradient-to-b from-graphite to-lacquer-deep ${className || 'h-[62vh] md:h-[66vh] lg:min-h-[560px]'}`}
      style={{ touchAction: 'none' }}
    >
      <ViewerErrorBoundary>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 0.05, 1.7], fov: 30 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* Interior lighting: low warm ambient + key directional for the shirt.
              The practical strip/spot lives inside <Interior />. */}
          <ambientLight intensity={0.35} />
          <directionalLight
            position={[1.4, 1.8, 1.6]}
            intensity={1.6}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-1.6, 0.9, -1.6]} intensity={0.7} color="#f2e3c0" />
          <Interior />
          <Suspense fallback={null}>
            <ShirtMesh color={color} uniforms={uniforms} />
            <AnchorResolver onResolve={setAnchors} />
            {effectiveDecals.length > 0 ? <DecalTextures decals={effectiveDecals} anchors={anchors} /> : null}
          </Suspense>
          <ContactShadows
            position={[0, -0.348, 0.1]} // just above rug top (rug top = -0.35 + z 0.1 center)
            opacity={0.55}
            scale={2}
            blur={2.4}
            far={1.2}
            resolution={256}
            color="#0f172a"
          />
          <OrbitControls
            ref={controlsRef as never}
            makeDefault
            enablePan={false}
            enableDamping
            target={[MODEL_CENTER.x, MODEL_CENTER.y, MODEL_CENTER.z]}
            minDistance={0.6}
            maxDistance={2.8} // keep the room intimate; back wall at z=-2.5 stays in frame
            maxPolarAngle={1.65}
            autoRotate={autoRotate}
            autoRotateSpeed={autoRotateSpeed}
          />
          <SwingDriver
            uniforms={uniforms}
            controlsRef={controlsRef}
            wind={clamp(wind, 0, 1)}
            strength={Number.isFinite(swingStrength) ? Math.max(0, swingStrength) : 1}
          />
          <FitRig controlsRef={controlsRef} />
        </Canvas>
      </ViewerErrorBoundary>
      {anchors ? null : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-label="Loading 3D model">
          <div className="flex flex-col items-center gap-3">
            <div className="h-28 w-40 animate-pulse rounded-[6px] bg-graphite2/70" />
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Loading 3D model…</p>
          </div>
        </div>
      )}
      {/* Post-style vignette without a postprocessing lib: pure CSS radial gradient. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.25))' }}
      />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 bg-lacquer" />
    </div>
  );
}

useGLTF.preload(MODEL_URL);
