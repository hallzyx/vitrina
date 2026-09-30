"""Brand palette from the piece's own pixels (k-means), plus the prompt for a name and tone suggestion."""
import colorsys
import re

import numpy as np

TONES = ("warm", "minimal", "rustic", "playful")

SYSTEM_BRAND = """You suggest a small brand identity for an online store that sells handmade crafts.
You are shown photos of one piece. Base everything only on how the piece LOOKS.
Return JSON only, exactly: {"displayName": "...", "tone": "..."}
Rules:
- displayName: 1 to 3 words, evocative and pronounceable in English and Spanish. Do not use real business names, real places, or claims about origin or materials.
- tone: one of warm, minimal, rustic, playful."""


# A store name must not hint at a material the artisan never stated, even as a stem ("Woody", "Clayworks").
_MATERIAL_STEMS = re.compile(
    r"\b(?:wood|clay|stone|iron|steel|glass|leather|wool|cotton|silk|silver|gold|copper|brass|bronze|ceram|terracot|"
    r"porcelain|wick|rattan|straw|bamboo|madera|barro|arcill|piedra|hierro|acero|vidrio|cuero|algod|plata|cobre|"
    r"bronce|cerám|porcelan|mimbre)\w*",
    re.IGNORECASE,
)


def hints_at_material(name: str) -> bool:
    return bool(_MATERIAL_STEMS.search(name))


def kmeans(pixels: np.ndarray, k: int = 4, iterations: int = 10, seed: int = 7):
    """Tiny k-means on RGB pixels. Returns (centers, counts)."""
    rng = np.random.default_rng(seed)
    points = pixels.astype(np.float32)
    if len(points) > 20000:
        points = points[rng.choice(len(points), 20000, replace=False)]
    order = np.argsort(points.sum(axis=1))
    centers = points[order[np.linspace(0, len(points) - 1, k).astype(int)]].copy()
    labels = np.zeros(len(points), dtype=int)
    for _ in range(iterations):
        distances = ((points[:, None, :] - centers[None]) ** 2).sum(-1)
        labels = distances.argmin(1)
        for j in range(k):
            members = labels == j
            if members.any():
                centers[j] = points[members].mean(0)
    return centers, np.bincount(labels, minlength=k)


def _hex(rgb) -> str:
    r, g, b = (int(max(0, min(255, round(float(v))))) for v in rgb)
    return f"#{r:02x}{g:02x}{b:02x}"


def _mix(a, b, t: float):
    return np.asarray(a, dtype=np.float32) * (1 - t) + np.asarray(b, dtype=np.float32) * t


def palette_from_pixels(pixels: np.ndarray) -> list[str]:
    """Four colors in the order the UI expects: primary, soft background, accent, dark text."""
    centers, counts = kmeans(pixels)
    ranked = [centers[i] for i in np.argsort(-counts)]

    def vividness(c):
        _, s, v = colorsys.rgb_to_hsv(*(np.asarray(c) / 255))
        return s * v

    primary = max(ranked[:3], key=vividness)
    soft = _mix(primary, (255, 255, 255), 0.68)
    accent = next((c for c in ranked if np.linalg.norm(c - primary) > 40), ranked[-1])
    dark = _mix(primary, (20, 16, 14), 0.78)
    return [_hex(primary), _hex(soft), _hex(accent), _hex(dark)]
