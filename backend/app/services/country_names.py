"""Open-world country-name recognition, backed by the full ISO 3166-1 list.

WHY this exists: geography resolution used to recognise countries from a
closed, hand-maintained map of ~11 countries (COUNTRY_ALIASES in
digital_brain_pipeline). Anything outside it — a user selecting Indonesia,
Kenya, Vietnam, ... — was logged as "not recognized" and dropped, after which
the pipeline fell back to its default country. A user's explicit selection
silently became a different country.

The dataset (app/data/iso3166_countries.json) is generated from the ISO 3166-1
register and covers every country equally: it carries no cities, no per-country
rules, and no special cases, so nothing here has to change when a user picks a
country nobody picked before. Aliases that more than one country claims (a bare
"Korea", "Congo", "Virgin Islands") were dropped at generation time — resolving
one of those to a single country would be a guess, and guessing is precisely
what this module exists to prevent.

This module deliberately depends on nothing else in the app, so the modules
that own the city pools can import it without a cycle.
"""

from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path

_DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "iso3166_countries.json"


def normalize_place(value: str) -> str:
    """Lowercase + strip diacritics/punctuation noise so 'Sao Paulo' matches
    'São Paulo' and 'U.S.A.' matches 'USA'. Shared by every place lookup so
    they all agree on what "the same name" means."""
    folded = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    return " ".join(folded.replace(".", " ").lower().split())


@lru_cache(maxsize=1)
def _alias_index() -> dict[str, str]:
    """normalized alias -> ISO canonical country name."""
    with _DATASET_PATH.open(encoding="utf-8") as handle:
        records = json.load(handle)
    index: dict[str, str] = {}
    for record in records:
        for alias in record["aliases"]:
            index[normalize_place(alias)] = record["name"]
    return index


def iso_country_name(entry: str) -> str | None:
    """The ISO canonical name for `entry` if it names a country, else None.

    Used as an identity key (so "USA" and "United States of America" dedupe to
    one country), never as the label shown to the user — callers keep the
    user's own spelling for display.
    """
    if not entry:
        return None
    return _alias_index().get(normalize_place(entry))


def is_country(entry: str) -> bool:
    return iso_country_name(entry) is not None
