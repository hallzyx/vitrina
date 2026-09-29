/**
 * Decides whether the landing can afford the real-time three.js hero.
 * Runs before three.js is downloaded, so weak devices never pay for it.
 *
 * Overrides for testing and demos: `?lite` forces the photo-frame fallback, `?3d` forces WebGL.
 */
export type HeroMode = "3d" | "frames";

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function pickHeroMode(): HeroMode {
  if (typeof window === "undefined") return "frames";
  const params = new URLSearchParams(window.location.search);
  if (params.has("lite")) return "frames";
  const forced = params.has("3d");

  const nav = navigator as NavigatorHints;
  if (!forced) {
    if (nav.connection?.saveData) return "frames";
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 2) return "frames";
    if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 3) return "frames";
  }

  try {
    const canvas = document.createElement("canvas");
    // A software rasterizer counts as "weak": it would drain the battery for a decorative scene.
    const gl = (canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: !forced }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: !forced })) as WebGLRenderingContext | null;
    if (!gl) return "frames";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return "3d";
  } catch {
    return "frames";
  }
}
