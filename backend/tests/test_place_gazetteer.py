"""The open-world place gazetteer: what it knows, and what it refuses to say.

These are unit tests for the lookup itself. How the pipeline consumes it — a
picker selection becoming countries and their locations — is covered by
test_geography_targeting.py.

Nothing here asserts against a hand-written list of supported countries,
because having one was the bug. The cases below are spread across continents
precisely so that a fix which special-cased any single country would fail.
"""

from __future__ import annotations

import json

import pytest

from app.services.country_names import _DATASET_PATH as ISO_DATASET_PATH
from app.services.country_names import is_country
from app.services.place_gazetteer import (
    DOMINANCE_RATIO,
    _DATASET_PATH,
    _ranked_candidates,
    country_city_pool,
    place_country_candidates,
    resolve_place_country,
)


# ── Cities name their own country, wherever they are ────────────────────────

@pytest.mark.parametrize(
    "city, country",
    [
        # The cities from the reported incident.
        ("Jakarta", "Indonesia"),
        ("Surabaya", "Indonesia"),
        ("Denpasar", "Indonesia"),
        ("Makassar", "Indonesia"),
        # Countries that have a curated pool in the pipeline.
        ("Mumbai", "India"),
        ("Munich", "Germany"),
        ("Osaka", "Japan"),
        # Countries that have nothing hand-written anywhere.
        ("Nairobi", "Kenya"),
        ("Hanoi", "Vietnam"),
        ("Casablanca", "Morocco"),
        ("Lagos", "Nigeria"),
        ("Dhaka", "Bangladesh"),
        ("Arequipa", "Peru"),
        ("Gdansk", "Poland"),
        ("Medellin", "Colombia"),
        ("Tashkent", "Uzbekistan"),
    ],
)
def test_a_city_resolves_to_its_country(city, country):
    assert resolve_place_country(city) == country


@pytest.mark.parametrize(
    "region, country",
    [
        ("Bali", "Indonesia"),
        ("Maharashtra", "India"),
        ("California", "United States"),
        ("Baden-Württemberg", "Germany"),
        ("Hokkaido", "Japan"),
        ("Bahia", "Brazil"),
    ],
)
def test_a_region_resolves_to_its_country(region, country):
    assert resolve_place_country(region) == country


@pytest.mark.parametrize(
    "spelling, country",
    [
        # Accents and punctuation are folded by the shared normalizer.
        ("São Paulo", "Brazil"),
        ("Sao Paulo", "Brazil"),
        ("İstanbul", "Türkiye"),
        ("Istanbul", "Türkiye"),
        ("  jakarta  ", "Indonesia"),
        ("JAKARTA", "Indonesia"),
        # The name the researcher knows, rather than the current official one.
        ("Bombay", "India"),
        ("Saigon", "Vietnam"),
    ],
)
def test_names_are_matched_however_they_are_written(spelling, country):
    assert resolve_place_country(spelling) == country


# ── What it refuses to answer ───────────────────────────────────────────────

@pytest.mark.parametrize(
    "entry",
    ["", "   ", "Nowherestan", "Placeville", "Jabodetabek", "Somewhere In It", "?!", "x"],
)
def test_an_unknown_name_resolves_to_nothing(entry):
    """Silence, not a guess. The caller turns this into a question for the
    user; anything else puts personas in a country nobody picked."""
    assert resolve_place_country(entry) is None
    assert place_country_candidates(entry) == []


@pytest.mark.parametrize("entry", ["Valencia", "San Jose"])
def test_a_genuinely_shared_name_resolves_to_nothing_but_lists_its_options(entry):
    assert resolve_place_country(entry) is None
    candidates = place_country_candidates(entry)
    assert len(candidates) > 1
    assert all(is_country(country) for country in candidates)


def test_a_dominant_match_wins_and_a_close_one_does_not():
    """The rule in one test: same shape of input, opposite answers, decided
    only by how far apart the two candidates are."""
    (_, top, _), (_, runner_up, _) = _ranked_candidates("Santiago")[:2]
    assert top >= runner_up * DOMINANCE_RATIO
    assert resolve_place_country("Santiago") == "Chile"

    (_, top, _), (_, runner_up, _) = _ranked_candidates("Valencia")[:2]
    assert top < runner_up * DOMINANCE_RATIO
    assert resolve_place_country("Valencia") is None


def test_a_place_called_by_its_own_name_outranks_a_historic_alternate():
    """Alexandria is Egypt's own city and, separately, a name history also
    hung on a large Iranian one. Population alone would call that a tie."""
    assert resolve_place_country("Alexandria") == "Egypt"
    assert "Iran" in place_country_candidates("Alexandria")


def test_several_cities_of_one_name_in_one_country_are_not_an_ambiguity():
    """Six Springfields, all American — the question is which COUNTRY, and
    that has only ever had one answer."""
    assert place_country_candidates("Springfield") == ["United States"]
    assert resolve_place_country("Springfield") == "United States"


# ── Pools ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "country", ["Indonesia", "Kenya", "Vietnam", "Peru", "Morocco", "Poland", "Egypt"],
)
def test_every_country_has_a_pool_to_spread_personas_across(country):
    pool = country_city_pool(country)

    assert len(pool) >= 5
    # A pool is only useful if its cities point back at the country it is for.
    assert resolve_place_country(pool[0]) == country


@pytest.mark.parametrize(
    "spelling", ["United States", "USA", "United States of America"],
)
def test_a_pool_is_found_by_any_spelling_of_its_country(spelling):
    assert country_city_pool(spelling) == country_city_pool("United States")


def test_an_unknown_country_has_no_pool_rather_than_a_wrong_one():
    assert country_city_pool("Nowherestan") == []
    assert country_city_pool("") == []


# ── The dataset itself ──────────────────────────────────────────────────────

def test_dataset_countries_are_the_same_countries_the_iso_index_knows():
    """The gazetteer and the ISO index have to agree on a country's canonical
    name, or a city resolving to "Indonesia" and a user typing "Indonesia"
    would count as two different countries downstream.

    Checked against the ISO dataset's canonical names rather than by resolving
    each one, because a handful of those names are deliberately not resolvable
    from a bare alias: "Congo" is the canonical name of one country and the
    everyday name of two, so country_names drops the alias on purpose.
    """
    with ISO_DATASET_PATH.open(encoding="utf-8") as handle:
        canonical_names = {record["name"] for record in json.load(handle)}
    with _DATASET_PATH.open(encoding="utf-8") as handle:
        dataset = json.load(handle)

    countries = set(dataset["city_pools"])
    assert len(countries) > 200
    assert countries <= canonical_names

    for name in dataset["cities"]["jakarta"] + dataset["regions"]["bali"]:
        assert name[0] in canonical_names


def test_dataset_carries_its_provenance():
    """Regenerating it is part of maintaining it, so where it came from and
    what licence it carries travel with the data."""
    with _DATASET_PATH.open(encoding="utf-8") as handle:
        dataset = json.load(handle)

    assert "GeoNames" in dataset["_source"]
    assert "CC BY 4.0" in dataset["_license"]
    assert dataset["_generated_by"].endswith("generate_place_dataset.py")
