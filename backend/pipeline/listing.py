"""Bilingual product listing: the prompt and, more importantly, the checks on what comes back.

The product promise is fidelity to the real piece, so the listing may only describe what is visible
or what the artisan wrote. The model is instructed accordingly, and its answer is checked against
patterns of claims it must not invent (materials, techniques, origin, measurements).
"""
import re
import unicodedata

SYSTEM_LISTING = """You write product listings for an online store of handmade crafts, in English and Spanish.
You are shown photos of one piece, plus optional notes written by the artisan.
Return JSON only, exactly:
{"en": {"name": "...", "description": "..."}, "es": {"name": "...", "description": "..."}}
Rules:
- Describe only what is clearly visible in the photos (shape, colors, pattern, finish, proportions in relative terms) and what the artisan's notes say.
- Do NOT state or guess materials, techniques, origin, age, maker, brand, dimensions, weight or capacity, and do not use words such as handmade, artisan, hand-thrown or authentic, unless that exact information appears in the notes.
- If the artisan gave a name, keep it in the name of the language it was written in and give a natural equivalent in the other language.
- name: 2 to 5 words. description: 1 to 3 short sentences, at most 320 characters, no hype, no invented claims.
- The Spanish must read naturally, not as a literal translation."""

MAX_NAME = 80
MAX_DESCRIPTION = 400

_MATERIALS = (
    "ceramic|clay|terracotta|porcelain|stoneware|earthenware|wood|wooden|walnut|oak|pine|bamboo|wicker|rattan|"
    "straw|leather|wool|alpaca|cotton|linen|silk|silver|gold|copper|brass|bronze|iron|steel|glass|stone|marble|"
    "cerámica|ceramica|barro|arcilla|terracota|porcelana|gres|madera|nogal|roble|bambú|bambu|mimbre|junco|paja|"
    "cuero|piel|lana|algodón|algodon|lino|seda|plata|oro|cobre|latón|laton|bronce|hierro|acero|vidrio|piedra|mármol|marmol"
)
_CLAIMS = (
    "handmade|hand-made|hand made|hand-thrown|hand-carved|hand-woven|hand-painted|artisan|artisanal|authentic|"
    "traditional|vintage|antique|heirloom|"
    "hecho a mano|hecha a mano|artesanal|artesano|artesana|auténtic[oa]|autentic[oa]|tradicional|antigu[oa]"
)
_ORIGIN = "peru|peruvian|perú|peruano|peruana|mexic\\w+|andean|andino|andina|inca|african\\w*|asian?|japanese|japonés|japones\\w*"
_MEASURE = r"\b\d+(?:[.,]\d+)?\s?(?:cm|mm|m|kg|g|ml|l|in|inch|inches|oz|lb|cm²|cm3)\b"

_FORBIDDEN = re.compile(rf"\b(?:{_MATERIALS}|{_CLAIMS}|{_ORIGIN})\b", re.IGNORECASE)
_MEASUREMENT = re.compile(_MEASURE, re.IGNORECASE)


class ListingError(Exception):
    """The model's answer broke the rules. `args[0]` is a list of human-readable problems."""


def _fold(text: str) -> str:
    return unicodedata.normalize("NFC", text).casefold()


# English/Spanish equivalents: if the artisan wrote one, its translation is not an invented claim.
_EQUIVALENTS = [
    {"ceramic", "ceramica", "cerámica"},
    {"clay", "barro", "arcilla"},
    {"terracotta", "terracota"},
    {"porcelain", "porcelana"},
    {"stoneware", "gres"},
    {"wood", "wooden", "madera"},
    {"walnut", "nogal"},
    {"oak", "roble"},
    {"bamboo", "bambú", "bambu"},
    {"wicker", "rattan", "mimbre", "junco"},
    {"straw", "paja"},
    {"leather", "cuero", "piel"},
    {"wool", "alpaca", "lana"},
    {"cotton", "algodón", "algodon"},
    {"linen", "lino"},
    {"silk", "seda"},
    {"silver", "plata"},
    {"gold", "oro"},
    {"copper", "cobre"},
    {"brass", "latón", "laton"},
    {"bronze", "bronce"},
    {"iron", "hierro"},
    {"steel", "acero"},
    {"glass", "vidrio"},
    {"stone", "piedra"},
    {"marble", "mármol", "marmol"},
    {"handmade", "hand-made", "hand made", "hecho a mano", "hecha a mano", "artesanal"},
    {"artisan", "artisanal", "artesano", "artesana"},
    {"traditional", "tradicional"},
    {"vintage", "antique", "antigua", "antiguo"},
    {"authentic", "auténtico", "auténtica", "autentico", "autentica"},
    {"peru", "peruvian", "perú", "peruano", "peruana"},
]


def _supported(word: str, facts: str) -> bool:
    folded = _fold(word)
    if folded in facts:
        return True
    return any(folded in group and any(other in facts for other in group) for group in _EQUIVALENTS)


def find_violations(text: str, notes: str) -> list[str]:
    """Claims in `text` that the artisan did not make (in either language). Words in the notes are allowed."""
    facts = _fold(notes or "")
    problems = []
    for match in _FORBIDDEN.finditer(text):
        word = match.group(0)
        if not _supported(word, facts):
            problems.append(f"'{word}'")
    for match in _MEASUREMENT.finditer(text):
        if _fold(match.group(0)) not in facts:
            problems.append(f"'{match.group(0)}'")
    return sorted(set(problems))


def clean(text) -> str:
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize("NFC", text)
    text = "".join(ch for ch in text if ch in "\n\t " or not unicodedata.category(ch).startswith("C"))
    return re.sub(r"\s+", " ", text).strip()


def validate_copy(data: dict, notes: str) -> dict:
    """Return the cleaned {en, es} copy, or raise ListingError describing what to fix."""
    problems: list[str] = []
    result: dict = {}
    for lang in ("en", "es"):
        block = data.get(lang) if isinstance(data, dict) else None
        if not isinstance(block, dict):
            raise ListingError([f"missing '{lang}' object"])
        name, description = clean(block.get("name")), clean(block.get("description"))
        if not name or not description:
            problems.append(f"{lang}: name and description are required")
        if len(name) > MAX_NAME or len(description) > MAX_DESCRIPTION:
            problems.append(f"{lang}: too long")
        bad = find_violations(f"{name}. {description}", notes)
        if bad:
            problems.append(f"{lang}: unsupported claims {', '.join(bad)}")
        result[lang] = {"name": name, "description": description}
    if problems:
        raise ListingError(problems)
    return result


def fallback_copy(name_hint: str, notes: str, store_name: str) -> dict:
    """A safe listing made only of what the artisan wrote, used if the model cannot follow the rules."""
    en_name = clean(name_hint) or f"Piece by {store_name}"
    es_name = clean(name_hint) or f"Pieza de {store_name}"
    description = clean(notes)[:MAX_DESCRIPTION]
    return {"en": {"name": en_name, "description": description}, "es": {"name": es_name, "description": description}}


def repair_hint(problems: list[str]) -> str:
    return (
        "Your previous answer broke the rules: "
        + "; ".join(problems)
        + ". Rewrite it without those claims, describing only what is visible. Return JSON only."
    )
