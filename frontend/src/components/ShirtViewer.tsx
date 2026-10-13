import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import Interior from './Interior';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';

export type View = 'front' | 'back' | 'sleeveLeft' | 'sleeveRight';

export interface FlatItem {
  id: string | number;
  kind: 'image' | 'text';
  url?: string;
  text?: string;
  font?: string;
  size?: number; // px at 1024
  color?: string;
  x: number; // 0..1 center
  y: number; // 0..1 center
  scale: number; // relative, 1 = 0.2 view width
  rotationDeg: number;
  opacity?: number;
}

export interface Views {
  front: { items: FlatItem[] };
  back: { items: FlatItem[] };
  sleeveLeft: { items: FlatItem[] };
  sleeveRight: { items: FlatItem[] };
}

interface ShirtViewerProps {
  color?: string;
  /** Live flat-editor state for embedded prints */
  views?: Views;
  /** Wind flutter amount 0..1. Default 0.35. */
  wind?: number;
  /** Fabric swing multiplier. Default 1. */
  swingStrength?: number;
  /** Auto-rotate turntable. Default true. */
  autoRotate?: boolean;
  /** OrbitControls auto-rotate speed. Default 1.0. */
  autoRotateSpeed?: number;
  /** Extra classes merged into the container */
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

type ControlsLike = {
  getAzimuthalAngle(): number;
  getPolarAngle(): number;
  target: THREE.Vector3;
  update(): void;
};

/** Camera angular-velocity -> spring-damper fabric swing */
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

/** Create offscreen canvases and render views to textures */
function createPrintRenderer() {
  const canvasF = document.createElement('canvas');
  const canvasB = document.createElement('canvas');
  const canvasSL = document.createElement('canvas');
  const canvasSR = document.createElement('canvas');
  canvasF.width = canvasF.height = 1024;
  canvasB.width = canvasB.height = 1024;
  canvasSL.width = canvasSL.height = 512;
  canvasSR.width = canvasSR.height = 512;

  const ctxF = canvasF.getContext('2d');
  const ctxB = canvasB.getContext('2d');
  const ctxSL = canvasSL.getContext('2d');
  const ctxSR = canvasSR.getContext('2d');

  const texF = new THREE.CanvasTexture(canvasF);
  const texB = new THREE.CanvasTexture(canvasB);
  const texSL = new THREE.CanvasTexture(canvasSL);
  const texSR = new THREE.CanvasTexture(canvasSR);

  const textures = [texF, texB, texSL, texSR];
  textures.forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.ClampToEdge;
    t.generateMipmaps = false;
  });

  const render = (views?: Views) => {
    const viewsSafe = views || { front: { items: [] }, back: { items: [] }, sleeveLeft: { items: [] }, sleeveRight: { items: [] } };

    // Clear canvases (transparent)
    [ctxF, ctxB, ctxSL, ctxSR].forEach((ctx) => {
      if (!ctx) return;
      const c = ctx.canvas;
      ctx.clearRect(0, 0, c.width, c.height);
    });

    const drawItems = (ctx: CanvasRenderingContext2D | null, items: FlatItem[], isFront: boolean) => {
      if (!ctx) return;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      const viewWidth = 0.4 * W; // 1 = 0.2 view width relative? spec says 1 = 0.2 view width - scale relative
      items.forEach((item) => {
        ctx.save();
        const cx = item.x * W;
        const cy = item.y * H;
        ctx.translate(cx, cy);
        ctx.rotate(((item.rotationDeg ?? 0) * Math.PI) / 180);
        const scale = (item.scale ?? 1) * (viewWidth / 0.2); // interpret: relative 1 means 0.2 view width? spec: "scale (relative, 1 = 0.2 view width)"
        const s = scale * 0.2; // simpler: treat as factor relative to 20% width
        // Better interpretation: scale relative, 1 = 0.2 of view width at 1024 base
        const relScale = item.scale ?? 1;
        const boxW = (0.2 * W) * relScale;
        const boxH = boxW; // base square for contain-fit sizing
        ctx.globalAlpha = item.opacity ?? 1;
        if (item.kind === 'image' && item.url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          try {
            img.src = item.url;
            // draw if loaded; if not, skip broken silently
            if (img.complete && img.naturalWidth > 0) {
              const iw = img.naturalWidth;
              const ih = img.naturalHeight;
              const ratio = Math.min(boxW / iw, boxH / ih);
              const dw = iw * ratio;
              const dh = ih * ratio;
              ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
            }
          } catch {
            // skip silently
          }
        } else if (item.kind === 'text' && item.text) {
          const fontSize = item.size ?? 60;
          const fontFam = item.font || 'Inter';
          ctx.font = `600 ${fontSize}px ${fontFam}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = item.color || '#ffffff';
          ctx.fillText(item.text, 0, 0);
        }
        ctx.restore();
      });
    };

    drawItems(ctxF, viewsSafe.front.items, true);
    drawItems(ctxB, viewsSafe.back.items, false);
    drawItems(ctxSL, viewsSafe.sleeveLeft.items, false);
    drawItems(ctxSR, viewsSafe.sleeveRight.items, false);

    texF.needsUpdate = true;
    texB.needsUpdate = true;
    texSL.needsUpdate = true;
    texSR.needsUpdate = true;
  };

  const hasContent = (views?: Views) => {
    const v = views;
    if (!v) return [0, 0, 0, 0];
    return [
      v.front.items.length > 0 ? 1 : 0,
      v.back.items.length > 0 ? 1 : 0,
      v.sleeveLeft.items.length > 0 ? 1 : 0,
      v.sleeveRight.items.length > 0 ? 1 : 0,
    ];
  };

  return { canvasF, canvasB, canvasSL, canvasSR, texF, texB, texSL, texSR, render, hasContent };
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
    uPrintMap: { value: THREE.Texture[] };
    uPrintOn: { value: number[] };
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
      fragmentShader: string;
    }) => {
      shader.uniforms['uSwing'] = uniforms.uSwing;
      shader.uniforms['uTime'] = uniforms.uTime;
      shader.uniforms['uWind'] = uniforms.uWind;
      shader.uniforms['uPrintMap'] = uniforms.uPrintMap;
      shader.uniforms['uPrintOn'] = uniforms.uPrintOn;

      // Vertex: add swing
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

      // Fragment: projectors
      const projectorChunk = `
uniform sampler2D uPrintMap[4];
uniform float uPrintOn[4];
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// rex(v,[a,b]) = (v-a)/(b-a)
float rex(float v, float a, float b) {
  return (v - a) / (b - a);
}
vec2 clampEdge(vec2 uv) {
  return clamp(uv, 0.01, 0.99);
}
`;
      const before = '#include <common>';
      shader.fragmentShader = shader.fragmentShader.replace(before, before + projectorChunk);

      const mixChunk = `
vec4 printColor = vec4(0.0);
vec3 P = vWorldPosition;
vec3 N = normalize(vWorldNormal);
vec3 V = normalize(cameraPosition - P);

// front: axis +z; u = rex(x,[-0.276,0.274]), v = rex(y,[-0.352,0.261])
if (uPrintOn[0] > 0.5) {
  vec2 uvFront = vec2(rex(P.x, -0.276, 0.274), rex(P.y, -0.352, 0.261));
  if (uvFront.x >= 0.0 && uvFront.x <= 1.0 && uvFront.y >= 0.0 && uvFront.y <= 1.0) {
    float mask = 1.0;
    // feather edges via smoothstep 2%
    float fe = 0.02;
    mask *= smoothstep(0.0, fe, uvFront.x) * smoothstep(1.0, 1.0-fe, uvFront.x);
    mask *= smoothstep(0.0, fe, uvFront.y) * smoothstep(1.0, 1.0-fe, uvFront.y);
    // single-sided: dot(normal, projectorDirView) > 0.25; projector dir for front is +z in view space? approx using world +z
    mask *= smoothstep(0.25, 0.35, dot(N, vec3(0.0,0.0,1.0)));
    if (mask > 0.0) {
      vec4 c = texture2D(uPrintMap[0], clampEdge(uvFront));
      printColor = mix(printColor, c, c.a * mask);
    }
  }
}
// back: axis -z; u mirrored so right-on-fabric = uv.x=1-u
if (uPrintOn[1] > 0.5) {
  vec2 uvBack = vec2(rex(P.x, -0.276, 0.274), rex(P.y, -0.352, 0.261));
  uvBack.x = 1.0 - uvBack.x;
  if (uvBack.x >= 0.0 && uvBack.x <= 1.0 && uvBack.y >= 0.0 && uvBack.y <= 1.0) {
    float mask = 1.0;
    float fe = 0.02;
    mask *= smoothstep(0.0, fe, uvBack.x) * smoothstep(1.0, 1.0-fe, uvBack.x);
    mask *= smoothstep(0.0, fe, uvBack.y) * smoothstep(1.0, 1.0-fe, uvBack.y);
    mask *= smoothstep(0.25, 0.35, dot(N, vec3(0.0,0.0,-1.0)));
    if (mask > 0.0) {
      vec4 c = texture2D(uPrintMap[1], clampEdge(uvBack));
      printColor = mix(printColor, c, c.a * mask);
    }
  }
}
// sleeveLeft: axis -x; u = rex(z,[-0.125,0.144]), v = rex(y,[-0.05,0.26])
if (uPrintOn[2] > 0.5) {
  vec2 uvL = vec2(rex(P.z, -0.125, 0.144), rex(P.y, -0.05, 0.26));
  if (uvL.x >= 0.0 && uvL.x <= 1.0 && uvL.y >= 0.0 && uvL.y <= 1.0) {
    float mask = 1.0;
    float fe = 0.02;
    mask *= smoothstep(0.0, fe, uvL.x) * smoothstep(1.0, 1.0-fe, uvL.x);
    mask *= smoothstep(0.0, fe, uvL.y) * smoothstep(1.0, 1.0-fe, uvL.y);
    mask *= smoothstep(0.25, 0.35, dot(N, vec3(-1.0,0.0,0.0)));
    if (mask > 0.0) {
      vec4 c = texture2D(uPrintMap[2], clampEdge(uvL));
      printColor = mix(printColor, c, c.a * mask);
    }
  }
}
// sleeveRight: axis +x; u mirrored
if (uPrintOn[3] > 0.5) {
  vec2 uvR = vec2(rex(P.z, -0.125, 0.144), rex(P.y, -0.05, 0.26));
  uvR.x = 1.0 - uvR.x;
  if (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0) {
    float mask = 1.0;
    float fe = 0.02;
    mask *= smoothstep(0.0, fe, uvR.x) * smoothstep(1.0, 1.0-fe, uvR.x);
    mask *= smoothstep(0.0, fe, uvR.y) * smoothstep(1.0, 1.0-fe, uvR.y);
    mask *= smoothstep(0.25, 0.35, dot(N, vec3(1.0,0.0,0.0)));
    if (mask > 0.0) {
      vec4 c = texture2D(uPrintMap[3], clampEdge(uvR));
      printColor = mix(printColor, c, c.a * mask);
    }
  }
}
diffuseColor.rgb = mix(diffuseColor.rgb, printColor.rgb, printColor.a);
`;
      const diffuse = '#include <map_fragment>';
      shader.fragmentShader = shader.fragmentShader.replace(diffuse, mixChunk + diffuse);
    };
    mat.customProgramCacheKey = () => 'shirt-embedded-print-v1';
    return mat;
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

export default function ShirtViewer({
  color = '#e5e7eb',
  views,
  wind = 0.35,
  swingStrength = 1,
  autoRotate = true,
  autoRotateSpeed = 1.0,
  className = '',
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
          <Suspense fallback={null}>
            <ShirtMesh color={color} uniforms={uniforms} />
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
          <FitRig controlsRef={controlsRef} />
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

useGLTF.preload(MODEL_URL);
