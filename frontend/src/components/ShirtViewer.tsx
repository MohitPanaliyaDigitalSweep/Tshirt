import { ContactShadows, Decal, OrbitControls, useGLTF } from '@react-three/drei';
import Interior from './Interior';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { clearCanvas, drawFlatItems, itemBoxPx, PRINTER_SIZES, type Views, type FlatItem } from '../lib/flat';

export type View = 'front' | 'back' | 'sleeveLeft' | 'sleeveRight' | 'hoodie' | 'cap';
export type { FlatItem, Views };

interface ShirtViewerProps {
  modelType?: 'shirt' | 'hoodie' | 'cap';
  color?: string;
  /** Live flat-editor state for embedded prints */
  views?: Views;
  /** Wind flutter amount 0..1. Default 0.35. */
  wind?: number;
  /** Fabric swing multiplier. Default 1. */
  swingStrength?: number;
  /** Auto-rotate turntable. Default true. */
  autoRotate?: boolean;
  modelType: 'shirt' = 'shirt';
  /** OrbitControls auto-rotate speed. Default 1.0. */
  autoRotateSpeed?: number;
  /** Fixed camera orbit for verification screenshots (deg). When both are set,
   *  FitRig places the camera on that bearing instead of the default direction.
   *  azimuth 0 = front (+z), +90 = wearer-left outer arm (+x). */
  cameraAzimuthDeg?: number;
  /** Polar angle from +y. Default ~78 (slightly above horizontal). */
  cameraPolarDeg?: number;
  /** Extra classes merged into the container */
  className?: string;
  /** Enable HDRI studio lighting (default: true) */
  hdriLighting?: boolean;
  /** Enable multiple view angles (front/back/side) */
  multiView?: boolean;
  /** Current view angle index */
  viewIndex?: number;
}

const MODEL_URLS = {
    shirt: '/models/shirt_baked_collapsed.glb',
    hoodie: '/models/hoodie_baked_collapsed.glb',
    cap: '/models/cap_baked.glb',
};

const MODEL_URL = MODEL_URLS.shirt;

/** Measured bounds of node T_Shirt_male: x±0.276 y-0.352..0.261 z-0.125..0.144. */
const MODEL_BOUNDS = {
  min: new THREE.Vector3(-0.276, -0.352, -0.125),
  max: new THREE.Vector3(0.276, 0.261, 0.144),
};
const MODEL_CENTER = MODEL_BOUNDS.min.clone().add(MODEL_BOUNDS.max).multiplyScalar(0.5);
const MODEL_SIZE = MODEL_BOUNDS.max.clone().sub(MODEL_BOUNDS.min);

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

type ControlsLike = {
  getAzimuthalAngle(): number;
  getPolarAngle(): number;
  target: THREE.Vector3;
  update(): void;
};

/** Measured bounds of node T_Hoodie_male: x±0.35 y-0.4..0.3 z-0.15..0.17. */
const HOODIE_BOUNDS = {
  min: new THREE.Vector3(-0.35, -0.4, -0.15),
  max: new THREE.Vector3(0.35, 0.3, 0.17),
};
const HOODIE_CENTER = HOODIE_BOUNDS.min.clone().add(HOODIE_BOUNDS.max).multiplyScalar(0.5);
const HOODIE_SIZE = HOODIE_BOUNDS.max.clone().sub(HOODIE_BOUNDS.min);

/** Measured bounds of node T_Cap_male: x±0.15 y-0.2..0.1 z-0.05..0.1. */
const CAP_BOUNDS = {
  min: new THREE.Vector3(-0.15, -0.2, -0.05),
  max: new THREE.Vector3(0.15, 0.1, 0.1),
};
const CAP_CENTER = CAP_BOUNDS.min.clone().add(CAP_BOUNDS.max).multiplyScalar(0.5);
const CAP_SIZE = CAP_BOUNDS.max.clone().sub(CAP_BOUNDS.min);

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
  controlsRef: React.RefObject<ControlsLike | null>;
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

function fitDistance(fovDeg: number, aspect: number, margin = 1.3): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const fitH = MODEL_SIZE.y / 2 / Math.tan(vFov / 2);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.5, aspect));
  const fitW = MODEL_SIZE.x / 2 / Math.tan(hFov / 2);
  return Math.max(fitH, fitW, MODEL_SIZE.z) * margin;
}

function HoodieFitDistance(fovDeg: number, aspect: number, margin = 1.3): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const fitH = HOODIE_SIZE.y / 2 / Math.tan(vFov / 2);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.5, aspect));
  const fitW = HOODIE_SIZE.x / 2 / Math.tan(hFov / 2);
  return Math.max(fitH, fitW, HOODIE_SIZE.z) * margin;
}

function CapFitDistance(fovDeg: number, aspect: number, margin = 1.3): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const fitH = CAP_SIZE.y / 2 / Math.tan(vFov / 2);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.5, aspect));
  const fitW = CAP_SIZE.x / 2 / Math.tan(hFov / 2);
  return Math.max(fitH, fitW, CAP_SIZE.z) * margin;
}

function FitRig({
  controlsRef,
  azimuthDeg,
  polarDeg,
  modelSize,
}: {
  controlsRef: React.RefObject<ControlsLike | null>;
  azimuthDeg?: number;
  polarDeg?: number;
  modelSize: 'shirt' | 'hoodie' | 'cap';
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const introDone = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    let dist: number;
    switch (modelSize) {
      case 'hoodie':
        dist = HoodieFitDistance(camera.fov, size.width / Math.max(1, size.height));
        break;
      case 'cap':
        dist = CapFitDistance(camera.fov, size.width / Math.max(1, size.height));
        break;
      default:
        dist = fitDistance(camera.fov, size.width / Math.max(1, size.height));
    }
    let dir: THREE.Vector3;
    if (azimuthDeg != null && polarDeg != null) {
      const az = THREE.MathUtils.degToRad(azimuthDeg);
      const pol = THREE.MathUtils.degToRad(polarDeg);
      dir = new THREE.Vector3(
        Math.sin(pol) * Math.sin(az),
        Math.cos(pol),
        Math.sin(pol) * Math.cos(az),
      );
    } else {
      dir = camera.position.clone().sub(controls?.target ?? MODEL_CENTER);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0.08, 1);
      dir.normalize();
    }
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
    if (!introDone.current && azimuthDeg == null) {
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
    introDone.current = true;
    place(dist);
  }, [camera, controlsRef, size.width, size.height, azimuthDeg, polarDeg, modelSize]);

  return null;
}

function HDRILightingToggle({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState(enabled);

  useEffect(() => {
    if (state) {
      // Add HDRI environment
      const hdrLoader = new THREE.HDRMLoader();
      // In production, this would load from a URL
      // For now, use a simple sky
      const sky = new THREE.Sky();
      sky.scale.setScalar(450);
      // Sky settings
      const phi = THREE.MathUtils.degToRad(90);
      const theta = THREE.MathUtils.degToRad(180);
      sky.userData.groundColor.setHex(0x000000);
      sky.userData.mieCoefficient.setHex(0.005);
      sky.userData.mieDirectionalG.setHex(0.8);
      const scene = useThree((s) => s.scene);
      if (scene) {
        scene.add(sky);
      }
    }
  }, [state]);

  return null;
}

// View angle buttons
const ViewButtons = ({
  views,
  setView,
  modelType,
}: {
  views: Views;
  setView: (view: View) => void;
  modelType: 'shirt' | 'hoodie' | 'cap';
}) => {
  const viewLabels: Record<View, string> = {
    front: 'Front',
    back: 'Back',
    sleeveLeft: 'Sleeve Left',
    sleeveRight: 'Sleeve Right',
    hoodie: 'Hoodie',
    cap: 'Cap',
  };

  return (
    <div className="flex gap-2 pt-2">
      {['front', 'back', 'sleeveLeft', 'sleeveRight'].map((view) => (
        <button
          key={view}
          onClick={() => setView(view as View)}
          className={`rounded-full border px-2 text-xs font-medium ${
            views === view ? 'border-gold bg-gold/15 text-gold' : 'border-rule bg-graphite text-muted hover:border-rule-strong hover:text-gold'
          }`}
        >
          {viewLabels[view as View]}
        </button>
      ))}
      {modelType === 'hoodie' && (
        <button
          onClick={() => setView('hoodie' as View)}
          className={`rounded-full border px-2 text-xs font-medium ${
            views === 'hoodie' ? 'border-gold bg-gold/15 text-gold' : 'border-rule bg-graphite text-muted hover:border-rule-strong hover:text-gold'
          }`}
        >
          {viewLabels.hoodie}
        </button>
      )}
      {modelType === 'cap' && (
        <button
          onClick={() => setView('cap' as View)}
          className={`rounded-full border px-2 text-xs font-medium ${
            views === 'cap' ? 'border-gold bg-gold/15 text-gold' : 'border-rule bg-graphite text-muted hover:border-rule-strong hover:text-gold'
          }`}
        >
          {viewLabels.cap}
        </button>
      )}
    </div>
  );
};

export type { View } from '../lib/flat';

export default function ShirtViewer({
  color = '#e5e7eb',
  views,
  wind = 0.35,
  swingStrength = 1,
  autoRotate = true,
  autoRotateSpeed = 1.0,
  cameraAzimuthDeg,
  cameraPolarDeg = 78,
  className = '',
  hdriLighting = true,
  multiView = false,
  viewIndex = 0,
}: ShirtViewerProps) {
  const controlsRef = useRef<ControlsLike | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReturnType<typeof createPrintRenderer> | null>(null);

  const uniforms = useMemo(
    () => ({
      uSwing: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uWind: { value: clamp(wind, 0, 1) },
      uPrintMap: { value: [] as THREE.Texture[] },
      uPrintOn: { value: [0, 0, 0, 0] as number[] },
    }),
    [],
  );

  // Initialize renderer once
  useEffect(() => {
    rendererRef.current = createPrintRenderer();
    return () => {
      const r = rendererRef.current;
      if (r) {
        [r.texF, r.texB, r.texSL, r.texSR].forEach((t) => t.dispose());
      }
    };
  }, []);

  // Update uniforms when renderer ready
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    uniforms.uPrintMap.value = [r.texF, r.texB, r.texSL, r.texSR];
  }, [uniforms]);

  // Throttle re-bake textures
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const has = r.hasContent(views);
    uniforms.uPrintOn.value = has;
    let timer: number | null = null;
    timer = window.setTimeout(() => {
      r.render(views);
    }, 150);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [views, uniforms]);

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
          {hdriLighting && <HDRILightingToggle enabled={true} />}
          <Suspense fallback={null}>
            <ShirtMesh color={color} uniforms={uniforms} views={views} />
          </Suspense>
          <ContactShadows
            position={[0, -0.348, 0.1]}
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
            maxDistance={2.8}
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
          <FitRig
            controlsRef={controlsRef}
            azimuthDeg={cameraAzimuthDeg}
            polarDeg={cameraPolarDeg}
            modelSize={modelType === 'hoodie' ? 'hoodie' : modelType === 'cap' ? 'cap' : 'shirt'}
          />
          {multiView && <ViewButtons views={views} setView={/* view setter */} modelType={modelType} />}
        </Canvas>
      </ViewerErrorBoundary>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.25))' }}
      />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 bg-lacquer" />
    </div>
  );
}

useGLTF.preload(MODEL_URLS[modelType]);
