"""Geography targeting: the user's selected geography is the one that ships.

Regression suite for a bug where selecting Indonesia (Jakarta, Surabaya,
Bandung, ...) produced personas in Mumbai, Bangalore, Delhi and Pune. Two
faults combined: the picker let a whole pasted list become one run-on tag, and
the resolver recognised countries from a closed list of eleven, discarded
everything else, and then defaulted to India.

Every assertion here is written against inputs the implementation has no
special knowledge of. The parametrised cases deliberately include countries
with no city pool, no alias entry, and no mention anywhere in the codebase, so
a fix that hardcoded Indonesia (or any other country) would fail them.
"""

from __future__ import annotations

import pytest

from app.services.digital_brain_pipeline import (
    COUNTRY_CITY_POOLS,
    GeographyResolutionError,
    _assign_cities_to_personas,
    _extract_geography_meta,
)
from app.services.ro_extractor import split_geography_entries


def meta_for(entries: list[str] | None, free_text: str = "consumer research study") -> dict:
    """Resolve a picker selection the way the pipeline does, with RO free text
    present throughout so any fall-through to the old text-parsing path (and
    its default country) would show up in the result rather than being masked
    by an empty RO."""
    ro: dict = {"geography": free_text}
    if entries is not None:
        ro["explicit_geography"] = entries
    return _extract_geography_meta(ro)


# ── The reported bug ─────────────────────────────────────────────────────────

REPORTED_SELECTION = [
    "Indonesia",
    "Jakarta",
    "Greater Jakarta / Jabodetabek",
    "Surabaya",
    "Bandung",
    "Medan",
    "Makassar",
    "Bali",
]

# Exactly what reached the resolver in the incident: the whole selection
# flattened into one tag by the picker.
REPORTED_MALFORMED_TAG = (
    "Indonesia,Jakarta Greater Jakarta / Jabodetabek Surabaya Bandung Medan Makassar Bali"
)


def test_reported_selection_stays_in_indonesia():
    meta = meta_for(REPORTED_SELECTION)

    assert meta["countries"] == ["Indonesia"]
    assert meta["explicit_cities_by_country"] == {"Indonesia": REPORTED_SELECTION[1:]}


def test_reported_selection_never_falls_back_to_india():
    meta = meta_for(REPORTED_SELECTION, free_text="India is not part of this study")
    assignments = _assign_cities_to_personas(
        {"explicit_geography": REPORTED_SELECTION, "geography": "x"}, 4
    )

    assert "India" not in meta["countries"]
    assert {country for _, country in assignments} == {"Indonesia"}
    # The four cities the old behaviour invented, none of which was selected.
    assert not {city for city, _ in assignments} & {"Mumbai", "Bangalore", "Delhi", "Pune"}


def test_malformed_run_on_tag_still_resolves_to_the_selected_country():
    """Objectives saved before the picker was fixed hold the run-on tag. The
    country has to survive that, because those rows are what generate today."""
    entries = split_geography_entries([REPORTED_MALFORMED_TAG])

    assert entries[0] == "Indonesia"
    assert meta_for(entries)["countries"] == ["Indonesia"]


# ── Required scenarios, one implementation for all of them ───────────────────

@pytest.mark.parametrize(
    "country, locations",
    [
        # The reported country.
        ("Indonesia", ["Jakarta", "Bali", "Surabaya"]),
        # A country with a built-in city pool, selected by its own cities.
        ("Germany", ["Berlin", "Munich"]),
        # A country whose selections are states, not cities.
        ("United States", ["California", "New York"]),
        # The country the old code defaulted to — it must be honoured when it
        # is genuinely chosen, not just when it is guessed.
        ("India", ["Mumbai", "Bangalore", "Delhi", "Pune"]),
        # Countries with no pool, no alias, and no mention in the codebase.
        ("Kenya", ["Nairobi", "Mombasa", "Kisumu"]),
        ("Vietnam", ["Hanoi", "Ho Chi Minh City"]),
        ("Peru", ["Lima", "Arequipa"]),
        ("Morocco", ["Casablanca", "Rabat", "Marrakesh"]),
        # Non-ASCII and punctuated place names.
        ("Türkiye", ["İstanbul", "Ankara"]),
        ("Netherlands", ["Amsterdam", "'s-Hertogenbosch", "The Hague"]),
    ],
)
def test_country_and_locations_are_preserved_exactly(country, locations):
    meta = meta_for([country, *locations])

    assert meta["countries"] == [country]
    assert meta["explicit_cities_by_country"] == {country: locations}


@pytest.mark.parametrize(
    "country, locations",
    [
        ("Indonesia", ["Jakarta", "Bali", "Surabaya"]),
        ("Germany", ["Berlin", "Munich"]),
        ("United States", ["California", "New York"]),
        ("Kenya", ["Nairobi", "Mombasa"]),
    ],
)
def test_persona_assignments_only_ever_use_the_selected_locations(country, locations):
    ro = {"explicit_geography": [country, *locations], "geography": "consumer research"}

    # More personas than locations, so the strict path has to cycle the
    # selected locations rather than reach for a pool.
    assignments = _assign_cities_to_personas(ro, len(locations) + 3)

    assert {c for _, c in assignments} == {country}
    assert {city for city, _ in assignments} == set(locations)


def test_a_selected_country_with_no_locations_keeps_that_country():
    meta = meta_for(["Indonesia"])
    assignments = _assign_cities_to_personas(
        {"explicit_geography": ["Indonesia"], "geography": "x"}, 3
    )

    assert meta["countries"] == ["Indonesia"]
    # No pool exists for it and none is invented — the country still holds.
    assert {country for _, country in assignments} == {"Indonesia"}
    assert {city for city, _ in assignments} == {None}


# ── Unresolvable geography: an error, never a substitution ───────────────────

@pytest.mark.parametrize(
    "entries",
    [
        ["Jabodetabek"],                      # a real metro area, no country given
        ["Nowherestan", "Placeville"],        # nothing recognisable at all
        ["Jakarta", "Surabaya"],              # real cities, but no country to place them in
    ],
)
def test_unresolvable_selection_raises_instead_of_substituting(entries):
    with pytest.raises(GeographyResolutionError) as excinfo:
        meta_for(entries, free_text="a study of Indian consumers in Mumbai")

    message = str(excinfo.value)
    # The message names what could not be placed, so the user can fix it.
    assert entries[0] in message
    # And the RO's own text is not used as a licence to pick a country.
    assert "India" not in message


def test_blank_selection_is_treated_as_no_selection_not_as_an_error():
    """An all-blank picker is an empty picker; only a selection with real
    content in it can fail to resolve."""
    assert meta_for(["", "   "])["countries"] == ["India"]


# ── No geography supplied: existing default behaviour is untouched ───────────

def test_no_geography_supplied_keeps_the_existing_default():
    assert meta_for(None, free_text="")["countries"] == ["India"]
    assert meta_for(None, free_text="Tier 1 urban consumers")["countries"] == ["India"]


def test_free_text_geography_still_resolves_as_before():
    assert meta_for(None, free_text="premium buyers across the USA")["countries"] == ["USA"]
    assert meta_for(None, free_text="shoppers in Mumbai and Pune")["countries"] == ["India"]


# ── The rules that make it faithful to the user ──────────────────────────────

def test_an_explicitly_named_country_wins_over_a_locations_built_in_country():
    """Delhi is in this module's India pool. Selected under Indonesia it is a
    location in Indonesia, because the user said which country they meant."""
    meta = meta_for(["Indonesia", "Delhi"])

    assert meta["countries"] == ["Indonesia"]
    assert meta["explicit_cities_by_country"] == {"Indonesia": ["Delhi"]}


def test_multiple_countries_each_keep_their_own_locations():
    meta = meta_for(["Germany", "Berlin", "Indonesia", "Jakarta", "Bali"])

    assert meta["countries"] == ["Germany", "Indonesia"]
    assert meta["explicit_cities_by_country"] == {
        "Germany": ["Berlin"],
        "Indonesia": ["Jakarta", "Bali"],
    }


def test_one_country_spelled_several_ways_is_one_country():
    meta = meta_for(["United States of America", "USA", "New York"])

    assert meta["countries"] == ["United States of America"]
    assert meta["explicit_cities_by_country"] == {"United States of America": ["New York"]}


def test_cities_selected_without_a_country_still_resolve_as_before():
    """Pre-existing behaviour for selections this module already recognised:
    the city's own country is used when the user named no country."""
    meta = meta_for(["Mumbai", "Pune"])

    assert meta["countries"] == ["India"]
    assert meta["explicit_cities_by_country"] == {"India": ["Mumbai", "Pune"]}


def test_a_selected_country_keeps_its_built_in_pool_under_the_users_spelling():
    """"United States" is kept verbatim as the label, and still reaches the
    pool filed under this module's short label."""
    ro = {"explicit_geography": ["United States"], "geography": "x"}
    assignments = _assign_cities_to_personas(ro, 3)

    assert {country for _, country in assignments} == {"United States"}
    assert {city for city, _ in assignments} <= set(COUNTRY_CITY_POOLS["USA"])
    assert None not in {city for city, _ in assignments}


# ── Picker serialisation: one place per entry ────────────────────────────────

@pytest.mark.parametrize(
    "raw, expected",
    [
        # A pasted list, flattened to one tag by the input.
        (["Berlin\nMunich\nHamburg"], ["Berlin", "Munich", "Hamburg"]),
        # A typed list.
        (["California, New York, Texas"], ["California", "New York", "Texas"]),
        (["Nairobi; Mombasa"], ["Nairobi", "Mombasa"]),
        # Already-correct tags are left exactly alone.
        (["Jakarta", "Bali"], ["Jakarta", "Bali"]),
        # Separators that are part of a place name are NOT split on, or the
        # split would invent places the user never selected.
        (["Greater Jakarta / Jabodetabek"], ["Greater Jakarta / Jabodetabek"]),
        (["Baden-Württemberg"], ["Baden-Württemberg"]),
        # Blanks and stray whitespace drop out.
        (["  Lima  ", "", None, ",,"], ["Lima"]),
    ],
)
def test_split_geography_entries(raw, expected):
    assert split_geography_entries(raw) == expected


def test_split_preserves_selection_order():
    """Order carries meaning — the resolver reads a country and then the
    locations that follow it — so splitting must not reorder anything."""
    assert split_geography_entries(["Indonesia, Jakarta", "Bali\nSurabaya"]) == [
        "Indonesia", "Jakarta", "Bali", "Surabaya",
    ]


# ── No country gets special treatment ────────────────────────────────────────

@pytest.mark.parametrize(
    "country",
    ["Indonesia", "India", "Germany", "United States", "Kenya", "Vietnam",
     "Brazil", "Japan", "Nigeria", "Poland", "Chile", "Bangladesh"],
)
def test_every_country_resolves_through_the_same_path(country):
    """Same input shape, same code, same outcome — whether or not the country
    happens to have a city pool, an alias entry, or a mention anywhere else."""
    meta = meta_for([country, "Somewhere In It", "Another Place"])

    assert meta["countries"] == [country]
    assert meta["explicit_cities_by_country"] == {
        country: ["Somewhere In It", "Another Place"]
    }
