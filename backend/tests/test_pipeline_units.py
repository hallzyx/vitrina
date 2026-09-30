import io

import numpy as np
import pytest
from PIL import Image, ImageFilter

import imaging
import listing
from ai import parse_json
from brand import palette_from_pixels
from core import PipelineError


def jpeg(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, "JPEG")
    return buf.getvalue()


def test_open_image_decodes_by_content_and_rejects_the_rest():
    assert imaging.open_image(jpeg(Image.new("RGB", (64, 64), "red"))).size == (64, 64)
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, "GIF")
    for bad in (b"not an image at all", buf.getvalue()):
        with pytest.raises(PipelineError) as err:
            imaging.open_image(bad)
        assert err.value.code == "invalid_image"


def test_sharpness_separates_crisp_from_blurry():
    rng = np.random.default_rng(1)
    crisp = Image.fromarray((rng.random((256, 256, 3)) * 255).astype(np.uint8))
    assert imaging.sharpness(crisp) > 20 * imaging.sharpness(crisp.filter(ImageFilter.GaussianBlur(6)))


def test_bbox_from_alpha():
    alpha = np.zeros((100, 120), dtype=np.float32)
    alpha[20:60, 30:90] = 1
    assert imaging.bbox_from_alpha(alpha) == (30, 20, 90, 60)
    assert imaging.bbox_from_alpha(np.zeros((10, 10), dtype=np.float32)) is None


def test_cosine():
    assert imaging.cosine(np.array([1.0, 0.0]), np.array([1.0, 0.0])) == pytest.approx(1.0)
    assert imaging.cosine(np.array([1.0, 0.0]), np.array([0.0, 1.0])) == pytest.approx(0.0, abs=1e-6)


def test_align_layout_keeps_one_scale_and_one_floor_for_a_steady_camera():
    # A piece turning on a turntable: its silhouette width changes, its floor line and axis do not.
    boxes = [(400 - w // 2, 200, 400 + w // 2, 700) for w in (300, 340, 380, 340, 300, 340)]
    layout = imaging.align_layout(boxes)
    assert layout["mode"] == "steady"
    bottoms = {y + round((b[3] - b[1]) * layout["scale"]) for (x, y), b in zip(layout["placements"], boxes)}
    assert max(bottoms) - min(bottoms) <= 1
    for (x, y), b in zip(layout["placements"], boxes):
        assert 0 <= x and x + (b[2] - b[0]) * layout["scale"] <= imaging.FRAME_SIZE
        assert 0 <= y and y + (b[3] - b[1]) * layout["scale"] <= imaging.FRAME_SIZE


def test_align_layout_never_lets_a_frame_leave_the_canvas():
    """A nearer foot sits lower in the image: bases that vary must not push frames off the canvas."""
    boxes = [(300, 100 + 20 * (i % 4), 700, 820 + 90 * ((i * 7) % 5) // 2) for i in range(12)]
    layout = imaging.align_layout(boxes)
    size, scale = imaging.FRAME_SIZE, layout["scale"]
    margin = size * 0.02
    for (x, y), (x0, y0, x1, y1) in zip(layout["placements"], boxes):
        assert x >= margin and y >= margin
        assert x + (x1 - x0) * scale <= size - margin and y + (y1 - y0) * scale <= size - margin


def test_align_layout_recenters_frames_from_a_handheld_camera():
    boxes = [(100 + 150 * (i % 2), 150 + 80 * (i % 3), 300 + 150 * (i % 2), 550 + 80 * (i % 3)) for i in range(8)]
    layout = imaging.align_layout(boxes)
    assert layout["mode"] == "handheld"
    assert len(layout["placements"]) == len(boxes)


def test_palette_follows_the_dominant_vivid_color():
    red = np.tile(np.array([[190, 50, 40]], dtype=np.uint8), (900, 1))
    beige = np.tile(np.array([[220, 200, 170]], dtype=np.uint8), (300, 1))
    colors = palette_from_pixels(np.concatenate([red, beige]))
    assert len(colors) == 4 and all(c.startswith("#") and len(c) == 7 for c in colors)
    r, g, b = (int(colors[0][i : i + 2], 16) for i in (1, 3, 5))
    assert r > g and r > b  # the primary color is the red one


def test_brand_names_must_not_hint_at_materials_even_as_a_stem():
    from brand import hints_at_material

    assert all(hints_at_material(n) for n in ("Woody Charm", "Clayworks", "Stonehearth", "Casa de Barro", "Maderas del Sur"))
    assert not any(hints_at_material(n) for n in ("Warm Ember", "Casa Sol", "Quiet Hands", "Rincón Sereno"))


def test_parse_json_tolerates_fences_and_chatter():
    assert parse_json('Sure!\n```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(ValueError):
        parse_json("no json here")


GOOD = {
    "en": {"name": "Blue floral vase", "description": "A tall vase with a soft blue floral pattern and a flared rim."},
    "es": {"name": "Jarrón floral azul", "description": "Un jarrón alto con un suave dibujo floral azul y el borde abierto."},
}


def test_listing_accepts_a_description_that_only_describes_what_is_visible():
    assert listing.validate_copy(GOOD, "")["en"]["name"] == "Blue floral vase"


@pytest.mark.parametrize(
    "bad",
    ["Handmade ceramic vase", "A 25 cm tall vase", "Peruvian pottery", "Un jarrón de cerámica", "Hecho a mano con barro", "made of wood"],
)
def test_listing_rejects_invented_materials_origin_and_measurements(bad):
    data = {**GOOD, "en": {"name": "Vase", "description": bad}}
    with pytest.raises(listing.ListingError):
        listing.validate_copy(data, "")


def test_listing_allows_claims_the_artisan_made():
    data = {**GOOD, "en": {"name": "Ceramic vase", "description": "A 25 cm handmade ceramic vase."}}
    assert listing.validate_copy(data, "Handmade ceramic vase, 25 cm tall")["en"]["name"] == "Ceramic vase"
    with pytest.raises(listing.ListingError):  # "clay" is a different material than the "ceramic" the artisan wrote
        listing.validate_copy({**GOOD, "en": {"name": "Clay vase", "description": "A vase."}}, "Handmade ceramic vase")


def test_listing_treats_a_translation_of_the_artisans_own_word_as_supported():
    data = {"en": {"name": "Terracotta vessel", "description": "A rounded vessel."}, "es": {"name": "Vasija de terracota", "description": "Una vasija redondeada."}}
    assert listing.validate_copy(data, "Terracotta vessel")["es"]["name"] == "Vasija de terracota"
    with pytest.raises(listing.ListingError):  # but not a different material
        listing.validate_copy({**data, "es": {"name": "Vasija de madera", "description": "Una vasija."}}, "Terracotta vessel")


def test_listing_requires_both_languages_and_limits_length():
    with pytest.raises(listing.ListingError):
        listing.validate_copy({"en": GOOD["en"]}, "")
    with pytest.raises(listing.ListingError):
        listing.validate_copy({**GOOD, "es": {"name": "x", "description": "y" * 500}}, "")


def test_listing_fallback_uses_only_what_the_artisan_wrote():
    copy = listing.fallback_copy("", "Notas del artesano", "Casa")
    assert copy["en"]["name"] == "Piece by Casa" and copy["es"]["description"] == "Notas del artesano"
