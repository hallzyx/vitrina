"""Image helpers: decoding, sharpness, cutout geometry and frame layout. No AWS calls in here."""
import io
import statistics

import numpy as np
from PIL import Image, ImageOps

from core import PipelineError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
FRAME_SIZE = 1024
THUMB_SIZE = 320
PREVIEW_SIZE = 480


def open_image(data: bytes) -> Image.Image:
    """Decode by content (never trust the file name or declared type) and normalize orientation."""
    try:
        image = Image.open(io.BytesIO(data))
        fmt = image.format
        image.load()
    except Exception:  # noqa: BLE001 - any decoder failure means "not a usable image"
        raise PipelineError("invalid_image", "The file is not a readable image.") from None
    if fmt not in ALLOWED_FORMATS:
        raise PipelineError("invalid_image", f"Unsupported image format: {fmt}.")
    return ImageOps.exif_transpose(image).convert("RGB")


def limit_size(image: Image.Image, longest: int) -> Image.Image:
    w, h = image.size
    scale = longest / max(w, h)
    if scale >= 1:
        return image
    return image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def sharpness(image: Image.Image) -> float:
    """Variance of the Laplacian on a 512 px grayscale copy (higher is sharper)."""
    gray = np.asarray(limit_size(image, 512).convert("L"), dtype=np.float32)
    lap = -4 * gray[1:-1, 1:-1] + gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:]
    return float(lap.var())


def bbox_from_alpha(alpha: np.ndarray, threshold: float = 0.5):
    """(x0, y0, x1, y1) of the pixels above the threshold, or None if there are none."""
    mask = alpha > threshold
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def to_jpeg(image: Image.Image, longest: int = 768, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    limit_size(image.convert("RGB"), longest).save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def on_gray(rgba: Image.Image, gray: int = 205) -> Image.Image:
    base = Image.new("RGBA", rgba.size, (gray, gray, gray, 255))
    base.alpha_composite(rgba.convert("RGBA"))
    return base.convert("RGB")


def expand_box(box, size, margin: float = 0.04):
    """Grow a bbox by a margin (fraction of its larger side) and clamp it to the image."""
    x0, y0, x1, y1 = box
    pad = round(max(x1 - x0, y1 - y0) * margin)
    return max(0, x0 - pad), max(0, y0 - pad), min(size[0], x1 + pad), min(size[1], y1 + pad)


def align_layout(boxes, size: int = FRAME_SIZE, fill: float = 0.84) -> dict:
    """Decide one scale and one placement per frame so the piece does not pulse or wander.

    `boxes` are (x0, y0, x1, y1) of the piece in each photo. All frames share a scale chosen so the
    largest one fills `fill` of the canvas. If the camera was steady (a tripod or a turntable) the
    piece keeps one fixed axis and floor line; if it was hand-held, each frame is centered on its own
    position, lightly smoothed with its neighbors to calm the jitter.
    """
    n = len(boxes)
    widths = [b[2] - b[0] for b in boxes]
    heights = [b[3] - b[1] for b in boxes]
    centers = [(b[0] + b[2]) / 2 for b in boxes]
    bases = [float(b[3]) for b in boxes]
    scale = size * fill / max(max(w, h) for w, h in zip(widths, heights))

    steady = (
        np.std(centers) <= 0.12 * statistics.median(widths) and np.std(bases) <= 0.12 * statistics.median(heights)
    )
    if steady:
        axis_x = [statistics.median(centers)] * n
        axis_y = [statistics.median(bases)] * n
    elif n >= 3:
        axis_x = [(centers[i - 1] + centers[i] + centers[(i + 1) % n]) / 3 for i in range(n)]
        axis_y = [(bases[i - 1] + bases[i] + bases[(i + 1) % n]) / 3 for i in range(n)]
    else:
        axis_x, axis_y = centers, bases

    # A hand-held camera drifts closer and farther, so the piece looks bigger in some photos. Bring each
    # frame's height to the set's median, scaling about its floor line, when it is off by more than 1.5%.
    # Pure resizing: no pixel is invented. With a steady camera only a small spread (up to 12%) is treated as
    # distance wobble; larger changes in height are the piece's own geometry (a raised trunk, a wide basket
    # seen from above) and must not be flattened.
    factors = [1.0] * n
    if not steady or max(heights) / max(min(heights), 1) <= 1.12:
        target = statistics.median(heights)
        for i, h in enumerate(heights):
            ratio = target / max(h, 1)
            if abs(ratio - 1) > 0.015:
                factors[i] = min(1.25, max(0.8, ratio))

    def relative(s: float):
        """Top-left of each piece relative to the shared axis and floor line, and the union of all frames."""
        rel = [((x0 - axis_x[i]) * s * factors[i], (y0 - axis_y[i]) * s * factors[i]) for i, (x0, y0, _, _) in enumerate(boxes)]
        left = min(x for x, _ in rel)
        right = max(x + w * s * f for (x, _), w, f in zip(rel, widths, factors))
        top = min(y for _, y in rel)
        bottom = max(y + h * s * f for (_, y), h, f in zip(rel, heights, factors))
        return rel, left, right, top, bottom

    # Perspective can push a frame below the shared floor line (a nearer foot sits lower in the image),
    # so shrink everything, if needed, until the union of all frames keeps a margin inside the canvas.
    rel, left, right, top, bottom = relative(scale)
    shrink = min(1.0, size * 0.94 / (right - left), size * 0.94 / (bottom - top))
    if shrink < 1.0:
        scale *= shrink
        rel, left, right, top, bottom = relative(scale)
    shift_x, shift_y = size / 2 - (left + right) / 2, size / 2 - (top + bottom) / 2
    placements = [(round(x + shift_x), round(y + shift_y)) for x, y in rel]
    return {
        "scale": scale,
        "scales": [scale * f for f in factors],
        "mode": "steady" if steady else "handheld",
        "placements": placements,
    }


def render_frame(cutout: Image.Image, box, scale: float, position, size: int = FRAME_SIZE) -> Image.Image:
    """Place the cropped, scaled cutout on a transparent square canvas."""
    piece = cutout.crop(box)
    piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(piece, dest=(max(0, position[0]), max(0, position[1])))
    return canvas


def preview_pair(photo: Image.Image, cutout: Image.Image, longest: int = PREVIEW_SIZE) -> tuple[bytes, bytes]:
    """Small WebP copies of a photo and of its cutout (transparent background), at the same size."""
    small = limit_size(photo, longest)
    return webp_bytes(small, 74), webp_bytes(cutout.resize(small.size, Image.LANCZOS), 80)


def webp_bytes(image: Image.Image, quality: int = 88) -> bytes:
    buf = io.BytesIO()
    image.save(buf, "WEBP", quality=quality, method=4)
    return buf.getvalue()
