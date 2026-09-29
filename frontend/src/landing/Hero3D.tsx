/**
 * Real-time three.js hero: a lathe-turned piece on a wooden turntable that the visitor can
 * spin. It is an illustration of the "spin it" promise, not a customer's product: real stores
 * show the artisan's photos in the frame-based 360° viewer.
 *
 * The surface patterns reuse the same functions as the demo photo frames (lib/render.ts),
 * so the 3D vase, basket and bowl match the pieces in the example store.
 *
 * Loaded lazily (its own chunk, with three.js); see Hero.tsx for the fallback chain.
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BASKET, BOWL, VASE } from "../data/mock";
import { GEOMETRY, patternMix, radius, type PieceSpec, type Shape } from "../lib/render";

const SPECS: Record<Shape, PieceSpec> = { vase: VASE, bowl: BOWL, basket: BASKET };

/** Per-shape look: how glossy the surface is, how deep the relief and how large it sits on the wheel. */
const LOOK: Record<Shape, { roughness: number; clearcoat: number; bump: number; scale: number }> = {
  vase: { roughness: 0.46, clearcoat: 0.75, bump: 1.2, scale: 1 },
  basket: { roughness: 0.88, clearcoat: 0, bump: 3.2, scale: 1.12 },
  bowl: { roughness: 0.55, clearcoat: 0.35, bump: 0.8, scale: 1.3 },
};

const SAMPLES = 56; // points per wall of the lathe profile
const LIP = 5; // points on the rounded rim
const SEGMENTS = 128; // radial resolution
const SCALE = 2.6; // world units per canvas unit of lib/render.ts
const WALL = 0.055;
const POINTS = 1 + SAMPLES + LIP + SAMPLES + 2;
const OUTER_START = 1 + SAMPLES + LIP;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function height(shape: Shape) {
  const { top, bottom } = GEOMETRY[shape];
  return (bottom - top) * SCALE;
}

/** Lathe profile: floor → inner wall → rounded lip → outer wall → foot. Same point count for every shape, so shapes can morph. */
function profile(shape: Shape): Vector2[] {
  const h = height(shape);
  const floor = WALL * 1.6;
  const pts: Vector2[] = [new Vector2(0.0001, floor)];
  for (let k = 0; k < SAMPLES; k++) {
    const t = 1 - k / (SAMPLES - 1); // 1 = base, 0 = rim
    pts.push(new Vector2(Math.max(0.002, radius(shape, t) * SCALE - WALL), Math.max(floor, (1 - t) * h)));
  }
  const rim = radius(shape, 0) * SCALE;
  for (let k = 1; k <= LIP; k++) {
    const a = Math.PI - (k / (LIP + 1)) * Math.PI;
    pts.push(new Vector2(rim - WALL / 2 + (Math.cos(a) * WALL) / 2, h + Math.sin(a) * WALL * 0.7));
  }
  for (let k = 0; k < SAMPLES; k++) {
    const t = k / (SAMPLES - 1);
    pts.push(new Vector2(radius(shape, t) * SCALE, (1 - t) * h));
  }
  pts.push(new Vector2(radius(shape, 1) * SCALE * 0.92, 0));
  pts.push(new Vector2(0.0001, 0));
  return pts;
}

/** Same patterns as the demo frames; the wood grain is made seamless around the full turn. */
function mix(spec: PieceSpec, u: number, t: number): number {
  if (spec.pattern === "grain") return (0.5 + 0.5 * Math.sin(t * 80 + Math.sin(u * 2) * 3 + Math.sin(u) * 0.8)) * 0.7;
  return patternMix(spec.pattern, u, t);
}

/** Albedo + bump textures, painted along the lathe UVs (v follows the profile, u goes around). */
function paint(spec: PieceSpec, maxAnisotropy: number) {
  const W = 1024;
  const H = 1024;
  const color = document.createElement("canvas");
  const bump = document.createElement("canvas");
  color.width = bump.width = W;
  color.height = bump.height = H;
  const cImg = new ImageData(W, H);
  const bImg = new ImageData(W, H);
  const c = cImg.data;
  const b = bImg.data;
  const [br, bg, bb] = spec.base;
  const [ar, ag, ab] = spec.accent;

  for (let y = 0; y < H; y++) {
    const j = (1 - (y + 0.5) / H) * (POINTS - 1); // canvas rows are flipped relative to v
    const region = j <= SAMPLES ? "inner" : j < OUTER_START ? "lip" : j <= OUTER_START + SAMPLES - 1 ? "outer" : "foot";
    const t = region === "outer" ? clamp01((j - OUTER_START) / (SAMPLES - 1)) : clamp01(1 - (j - 1) / (SAMPLES - 1));
    const rings = Math.sin(t * 260);
    for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2;
      const i = (y * W + x) * 4;
      let k = 1;
      let m = 0;
      let relief = 128;
      if (region === "outer") {
        m = mix(spec, u, t);
        if (spec.pattern === "bands") {
          k = 1 - 0.035 * (0.5 + 0.5 * rings);
          relief = 128 + 26 * rings + (m > 0.5 ? 34 : 0);
        } else if (spec.pattern === "weave") {
          const cu = (u * 8) / Math.PI;
          const cv = t * 24;
          const gap = cu - Math.floor(cu) < 0.09 || cv - Math.floor(cv) < 0.09;
          relief = gap ? 30 : 150 + 90 * Math.sin((cv - Math.floor(cv)) * Math.PI);
          k = gap ? 0.8 : 0.9 + 0.1 * Math.sin((cv - Math.floor(cv)) * Math.PI);
        } else {
          relief = 128 + 60 * m;
        }
      } else if (region === "inner") {
        k = spec.pattern === "weave" ? 0.62 : 0.58;
        m = spec.pattern === "grain" ? mix(spec, u, t) : 0;
        relief = 128 + 20 * rings;
      } else if (region === "lip") {
        k = 0.95;
      } else {
        k = 0.7;
      }
      c[i] = Math.min(255, (br + (ar - br) * m) * k);
      c[i + 1] = Math.min(255, (bg + (ag - bg) * m) * k);
      c[i + 2] = Math.min(255, (bb + (ab - bb) * m) * k);
      c[i + 3] = 255;
      b[i] = b[i + 1] = b[i + 2] = relief;
      b[i + 3] = 255;
    }
  }
  color.getContext("2d")!.putImageData(cImg, 0, 0);
  bump.getContext("2d")!.putImageData(bImg, 0, 0);

  const map = new CanvasTexture(color);
  map.colorSpace = SRGBColorSpace;
  const bumpMap = new CanvasTexture(bump);
  for (const tex of [map, bumpMap]) {
    tex.wrapS = RepeatWrapping;
    tex.anisotropy = Math.min(8, maxAnisotropy);
  }
  return { map, bumpMap };
}

function woodTopTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const ring = 0.5 + 0.5 * Math.sin(r * 190 + Math.sin(a * 3) * 0.9 + Math.sin(a * 7) * 0.3);
      const k = 0.78 + 0.22 * ring;
      const i = (y * size + x) * 4;
      d[i] = 92 * k;
      d[i + 1] = 60 * k;
      d[i + 2] = 40 * k;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function softShadowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(20,13,9,0.75)");
  g.addColorStop(0.45, "rgba(20,13,9,0.35)");
  g.addColorStop(1, "rgba(20,13,9,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface Props {
  shape: Shape;
  reducedMotion: boolean;
  label: string;
  onAngle?: (degrees: number) => void;
  onReady?: () => void;
  onFail: () => void;
}

interface SceneApi {
  setShape: (shape: Shape) => void;
  nudge: (velocity: number) => void;
  pointerDown: (x: number) => void;
  pointerMove: (x: number, width: number) => void;
  pointerUp: () => void;
}

export default function Hero3D({ shape, reducedMotion, label, onAngle, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const callbacks = useRef({ onAngle, onReady, onFail });
  callbacks.current = { onAngle, onReady, onFail };
  const initialShape = useRef(shape);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      callbacks.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.75 : 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    const onLost = (e: Event) => {
      e.preventDefault();
      callbacks.current.onFail();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;

    const camera = new PerspectiveCamera(26, 1, 0.1, 50);

    // Lights: warm key from the front-left, terracotta rim from behind, low ambient.
    const key = new DirectionalLight("#ffe0c2", 2.4);
    key.position.set(-3, 5, 4);
    const rim = new DirectionalLight("#ff8f5c", 3.2);
    rim.position.set(4, 3, -4);
    const fill = new DirectionalLight("#9fb0ff", 0.35);
    fill.position.set(3, 1, 5);
    scene.add(key, rim, fill, new AmbientLight("#ffffff", 0.18));

    // Turntable: a wooden wheel with a darker edge.
    const wheelTop = woodTopTexture();
    const wheel = new Mesh(
      new CylinderGeometry(1.8, 1.86, 0.14, 96),
      [
        new MeshStandardMaterial({ color: "#2a1b12", roughness: 0.7 }),
        new MeshStandardMaterial({ map: wheelTop, roughness: 0.62 }),
        new MeshStandardMaterial({ color: "#2a1c14", roughness: 0.8 }),
      ],
    );
    wheel.position.y = -0.07;

    const shadowTex = softShadowTexture();
    const contact = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.003;
    const floorShadow = new Mesh(
      new PlaneGeometry(6.4, 6.4),
      new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 }),
    );
    floorShadow.rotation.x = -Math.PI / 2;
    floorShadow.position.y = -0.15;

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const materials = new Map<Shape, MeshPhysicalMaterial>();
    const materialFor = (s: Shape) => {
      let mat = materials.get(s);
      if (!mat) {
        const { map, bumpMap } = paint(SPECS[s], maxAniso);
        const look = LOOK[s];
        mat = new MeshPhysicalMaterial({
          map,
          bumpMap,
          bumpScale: look.bump,
          roughness: look.roughness,
          clearcoat: look.clearcoat,
          clearcoatRoughness: 0.3,
          side: DoubleSide,
        });
        materials.set(s, mat);
      }
      return mat;
    };

    let current: Shape = initialShape.current;
    let fromPts = profile(current);
    let toPts = fromPts;
    const geometry = new LatheGeometry(fromPts, SEGMENTS);
    const piece = new Mesh(geometry, materialFor(current));
    piece.scale.setScalar(LOOK[current].scale);
    const turntable = new Group();
    turntable.add(wheel, contact, piece);
    const stage = new Group();
    stage.add(turntable, floorShadow);
    scene.add(stage);

    // Morph state (0 → 1 while one shape turns into another on the wheel).
    let morph = 1;
    let morphTarget: Shape = current;
    let scaleNow = LOOK[current].scale;
    let scaleFrom = scaleNow;
    const applyProfile = (pts: Vector2[]) => {
      const temp = new LatheGeometry(pts, SEGMENTS);
      (geometry.getAttribute("position") as BufferAttribute).copy(temp.getAttribute("position") as BufferAttribute);
      (geometry.getAttribute("normal") as BufferAttribute).copy(temp.getAttribute("normal") as BufferAttribute);
      geometry.getAttribute("position").needsUpdate = true;
      geometry.getAttribute("normal").needsUpdate = true;
      geometry.computeBoundingSphere();
      temp.dispose();
    };

    // Spin state: drag with inertia, idle auto-rotation.
    const spin = { rot: -0.6, vel: 0, dragging: false, lastX: 0 };
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    let visible = true;
    let raf = 0;
    let last = performance.now();
    let shownDeg = -1;
    let readyFired = false;

    const resize = () => {
      const { width, height: h } = host.getBoundingClientRect();
      if (!width || !h) return;
      renderer.setSize(width, h, false);
      camera.aspect = width / h;
      // Pull back on tall (portrait) stages so the piece always fits.
      const fitFov = camera.aspect < 0.9 ? 30 : 26;
      camera.fov = fitFov;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);

    const onWindowPointer = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (!reducedMotion) window.addEventListener("pointermove", onWindowPointer, { passive: true });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(50, now - last);
      last = now;
      if (!visible || document.hidden) return;
      const f = dt / 16.67;

      if (!spin.dragging) {
        spin.rot += spin.vel * f;
        spin.vel *= Math.pow(0.95, f);
        if (!reducedMotion && Math.abs(spin.vel) < 0.004) spin.rot += 0.0045 * f;
      }

      if (morph < 1) {
        morph = Math.min(1, morph + dt / 900);
        const e = easeInOut(morph);
        applyProfile(fromPts.map((p, i) => new Vector2().lerpVectors(p, toPts[i], e)));
        if (current !== morphTarget && morph >= 0.5) {
          current = morphTarget;
          piece.material = materialFor(current);
        }
        scaleNow = scaleFrom + (LOOK[morphTarget].scale - scaleFrom) * e;
        // The clay "settles" on the wheel: a small squash in the middle of the morph.
        const squash = Math.sin(Math.PI * morph);
        piece.scale.set(scaleNow * (1 + 0.05 * squash), scaleNow * (1 - 0.07 * squash), scaleNow * (1 + 0.05 * squash));
      }

      // Scroll: the piece keeps turning and sinks away as the hero leaves the screen.
      const scroll = reducedMotion ? 0 : clamp01(window.scrollY / Math.max(1, window.innerHeight));
      pointer.sx += (pointer.x - pointer.sx) * 0.05;
      pointer.sy += (pointer.y - pointer.sy) * 0.05;

      turntable.rotation.y = spin.rot + scroll * Math.PI * 0.9;
      const baseR = radius(current, 1) * SCALE;
      contact.scale.setScalar(baseR * 3.1 * scaleNow);
      stage.scale.setScalar(1 - scroll * 0.12);
      stage.position.y = -scroll * 0.35;

      const h = height(morphTarget) * LOOK[morphTarget].scale;
      const targetY = Math.max(0.55, h * 0.46);
      camera.position.set(pointer.sx * 0.6, 2.1 + targetY * 0.35 - pointer.sy * 0.35, 8.2);
      camera.lookAt(0, targetY - 0.1, 0);

      renderer.render(scene, camera);
      if (!readyFired) {
        readyFired = true;
        callbacks.current.onReady?.();
      }

      const deg = Math.round(((((turntable.rotation.y * 180) / Math.PI) % 360) + 360) % 360) % 360;
      if (deg !== shownDeg) {
        shownDeg = deg;
        callbacks.current.onAngle?.(deg);
      }
    };
    raf = requestAnimationFrame(tick);

    apiRef.current = {
      setShape: (next) => {
        if (next === morphTarget) return;
        fromPts = morph < 1 ? fromPts.map((p, i) => new Vector2().lerpVectors(p, toPts[i], easeInOut(morph))) : toPts;
        toPts = profile(next);
        scaleFrom = scaleNow;
        morphTarget = next;
        morph = reducedMotion ? 0.999 : 0;
        if (reducedMotion) {
          current = next;
          piece.material = materialFor(next);
        }
        spin.vel += reducedMotion ? 0 : 0.12;
      },
      nudge: (v) => {
        spin.vel += v;
      },
      pointerDown: (x) => {
        spin.dragging = true;
        spin.lastX = x;
        spin.vel = 0;
      },
      pointerMove: (x, width) => {
        if (!spin.dragging) return;
        const dx = x - spin.lastX;
        spin.lastX = x;
        const delta = (dx / Math.max(200, width)) * Math.PI * 1.6;
        spin.rot += delta;
        spin.vel = delta * 0.6 + spin.vel * 0.4;
      },
      pointerUp: () => {
        spin.dragging = false;
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onWindowPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      apiRef.current = null;
      scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
      for (const mat of materials.values()) {
        mat.map?.dispose();
        mat.bumpMap?.dispose();
        mat.dispose();
      }
      wheelTop.dispose();
      shadowTex.dispose();
      env.dispose();
      pmrem.dispose();
      room.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [reducedMotion]);

  useEffect(() => {
    apiRef.current?.setShape(shape);
  }, [shape]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    apiRef.current?.pointerDown(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    apiRef.current?.pointerMove(e.clientX, e.currentTarget.getBoundingClientRect().width);
  };
  const onPointerUp = () => apiRef.current?.pointerUp();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    apiRef.current?.nudge(e.key === "ArrowRight" ? 0.08 : -0.08);
  };

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      tabIndex={0}
      className="absolute inset-0 cursor-grab touch-pan-y select-none rounded-full active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      data-hero="3d"
    />
  );
}
