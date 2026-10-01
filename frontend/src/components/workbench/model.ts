/** What the processing workbench shows, built only from real run data (live status or a recorded run). */
import { PIPELINE_STEPS, type Brand, type LiveProgress, type ProductCopy, type StatusResponse } from "../../lib/api";
import { isReady } from "../../lib/product";

export interface BenchPhoto {
  /** 1-based position of the photo in the set. */
  index: number;
  /** The original photo, when it is available. */
  photo?: string;
  /** The same photo with its background removed (transparent). */
  cutout: string;
  /** True when the cutout has the exact framing of the photo, so one can be laid over the other. */
  overlay: boolean;
  /** The real per-photo score; null when this photo was not scored; undefined when scores were not recorded. */
  fidelity?: number | null;
}

export interface BenchModel {
  mode: "live" | "replay";
  /** Index of the step in progress; `PIPELINE_STEPS.length` once the run is finished. */
  step: number;
  failed: boolean;
  /** How many photos went in (the contact sheet has one slot per photo). */
  slots: number;
  /** Photos in the order they finished. */
  photos: BenchPhoto[];
  /** Aligned frames for the turntable, once the run has aligned them. */
  spin: string[];
  /** Photos the fidelity check set aside, and its threshold for this set. */
  dropped: number[];
  threshold?: number | null;
  /** The product's overall fidelity, once known. */
  overall?: { score?: number | null; checked?: number | null; frames: number };
  brand?: Brand;
  copy?: ProductCopy;
  /** Photos done / total, when the run reports it. */
  counter?: { done: number; total: number };
}

export const DONE = PIPELINE_STEPS.length;
export const STEP = Object.fromEntries(PIPELINE_STEPS.map((s, i) => [s, i])) as Record<(typeof PIPELINE_STEPS)[number], number>;

/** Everything a live run has shown so far. Polls only add to it, so nothing on screen goes backwards. */
export interface LiveAccumulator {
  seenLive: boolean;
  photos: BenchPhoto[];
  aligned: LiveProgress["aligned"];
  review?: LiveProgress["review"];
  brand?: Brand;
}

export const EMPTY_LIVE: LiveAccumulator = { seenLive: false, photos: [], aligned: [] };

export function accumulate(prev: LiveAccumulator, status: StatusResponse): LiveAccumulator {
  const live = status.live;
  if (!live) return prev;
  const photos = [...prev.photos];
  for (const p of live.previews ?? []) {
    const next: BenchPhoto = { index: p.index, photo: p.photo, cutout: p.cutout, overlay: true, fidelity: p.fidelity ?? null };
    const at = photos.findIndex((q) => q.index === p.index);
    if (at < 0) photos.push(next);
    else photos[at] = next;
  }
  return {
    seenLive: true,
    photos,
    aligned: live.aligned?.length ? live.aligned : prev.aligned,
    review: live.review ?? prev.review,
    brand: live.brand?.colors?.length ? live.brand : prev.brand,
  };
}

export function liveModel(status: StatusResponse, acc: LiveAccumulator): BenchModel {
  const ready = isReady(status);
  const dropped = acc.review?.dropped ?? [];
  return {
    mode: "live",
    step: ready ? DONE : Math.max(0, Math.min(status.stepIndex ?? 0, DONE - 1)),
    failed: status.status === "failed",
    slots: Math.max(status.photos?.total ?? 0, ...acc.photos.map((p) => p.index)),
    photos: acc.photos,
    spin: ready ? (status.thumbs ?? []) : acc.aligned.filter((a) => !dropped.includes(a.index)).map((a) => a.thumb),
    dropped,
    threshold: acc.review?.threshold,
    overall: ready ? { score: status.fidelityScore, checked: status.fidelityChecked, frames: status.frames?.length ?? 0 } : undefined,
    brand: ready ? status.brand : acc.brand,
    copy: ready ? status.copy : undefined,
    counter: status.photos,
  };
}

/** Index of a photo from its frame URL (`.../f07.webp`), or null. */
export function frameIndex(url: string): number | null {
  const match = /\/[ft](\d{1,3})\.webp(?:$|\?)/.exec(url);
  return match ? Number(match[1]) : null;
}
