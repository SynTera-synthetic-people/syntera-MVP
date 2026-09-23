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
from app.services.place_gazetteer import country_city_pool
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
    assert {country for _, country in assignments} == {"Indonesia"}
    # A country with no curated pool is spread across its own largest cities
    # from the gazetteer. This used to produce city=None for every persona,
    # because a pool only existed for the eleven hand-written countries.
    cities = {city for city, _ in assignments}
    assert None not in cities
    assert cities <= set(country_city_pool("Indonesia"))


# ── Unresolvable geography: an error, never a substitution ───────────────────

@pytest.mark.parametrize(
    "entries",
    [
        ["Jabodetabek"],                      # a real metro acronym, in no gazetteer
        ["Nowherestan", "Placeville"],        # nothing recognisable at all
        ["Valencia"],                         # real, but Venezuela's and Spain's alike
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


def test_an_ambiguous_selection_names_the_countries_it_could_have_meant():
    """Refusing to guess is only half the job — the message has to tell the
    user what the choice actually is, or they cannot resolve it."""
    with pytest.raises(GeographyResolutionError) as excinfo:
        meta_for(["Valencia"])

    message = str(excinfo.value)
    assert "Venezuela" in message and "Spain" in message


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


# ── Free text: the RO written as prose, not picked from the picker ──────────
#
# An objective created through the Omi conversation has no picker tags at all,
# so its geography is whatever the summary says in words. That path recognised
# the same eleven countries and silently defaulted everything else to India —
# an objective that said "Indonesia" in so many words still produced Mumbai
# personas. Prose is not a picker though: it is full of capitalised words that
# are also real towns, so a name is believed only when it cannot be anything
# else. Both halves of that are pinned here.

@pytest.mark.parametrize(
    "expected, text",
    [
        # The country said outright.
        (["Indonesia"], "coffee habits of young professionals in Indonesia"),
        (["Kenya"], "mobile money adoption among small traders in Kenya"),
        (["Vietnam"], "skincare buyers in Vietnam"),
        # Multi-word country names.
        (["New Zealand", "South Africa"], "consumers in New Zealand and South Africa"),
        # Cities only, agreeing with each other.
        (["Indonesia"], "professionals in Jakarta, Surabaya and Bandung"),
        (["Vietnam"], "women in Hanoi and Ho Chi Minh City"),
        # A single city, big enough to be unmistakable on its own.
        (["Indonesia"], "consumers in Jakarta"),
        # A city that would be ambiguous alone, settled by the country beside it.
        (["Spain"], "shoppers in Valencia, Spain"),
    ],
)
def test_prose_resolves_the_country_it_names(expected, text):
    assert meta_for(None, free_text=text)["countries"] == expected


@pytest.mark.parametrize(
    "text",
    [
        # Every one of these contains a capitalised word that IS a real town:
        # Young (Uruguay, 16k), Best (Netherlands, 29k), Male (Maldives, 103k),
        # Mobile (USA, 183k), Deal and Reading (UK).
        "Young urban professionals seeking Best value",
        "Male shoppers using Mobile apps",
        "Reading habits of commuters looking for a good Deal",
        "coffee habits of Young professionals",
    ],
)
def test_prose_does_not_mistake_an_ordinary_word_for_a_place(text):
    """The default stands rather than a country being invented out of a
    capitalised adjective. This is the reason prose is not simply matched
    against the whole gazetteer."""
    assert meta_for(None, free_text=text)["countries"] == ["India"]


@pytest.mark.parametrize(
    "expected, text",
    [
        # Neither city is big enough to stand alone, but together they are not
        # a coincidence — this is how a real secondary market gets named.
        ("Kenya", "traders in Kisumu and Nakuru"),
        ("Poland", "shoppers in Gdansk and Krakow"),
        ("Indonesia", "buyers in Denpasar and Makassar"),
    ],
)
def test_two_modest_cities_together_establish_a_country(expected, text):
    assert meta_for(None, free_text=text)["countries"] == [expected]


@pytest.mark.parametrize(
    "text",
    [
        # Reading (318k) and Deal (31k) are both real English towns, so they
        # would vouch for each other into the UK without a size floor.
        "Reading habits of commuters looking for a good Deal",
        "March and Bury shoppers",
    ],
)
def test_two_ordinary_words_do_not_vouch_for_each_other(text):
    assert meta_for(None, free_text=text)["countries"] == ["India"]


def test_prose_reads_a_multi_word_place_as_one_place():
    """"Ho Chi Minh City" is one city, not that city plus "Ho Chi Minh"."""
    meta = meta_for(None, free_text="women in Hanoi and Ho Chi Minh City")

    assert meta["explicit_cities_by_country"] == {"Vietnam": ["Hanoi", "Ho Chi Minh City"]}


def test_prose_keeps_the_curated_reading_where_there_is_one():
    """The curated tables are matched first in prose too, so the countries
    that had a hand-written label keep it rather than acquiring an ISO one."""
    assert meta_for(None, free_text="retail across the United Arab Emirates")["countries"] == ["UAE"]
    assert meta_for(None, free_text="premium buyers across the USA")["countries"] == ["USA"]


def test_prose_and_picker_agree_on_the_same_geography():
    """The two paths into this function must not disagree about a market —
    the picker was fixed first and prose used to answer India for this."""
    picker = meta_for(["Jakarta", "Surabaya", "Bandung"])
    prose = meta_for(None, free_text="professionals in Jakarta, Surabaya and Bandung")

    assert picker["countries"] == prose["countries"] == ["Indonesia"]


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


# ── Cities picked without a country: the same answer for every country ───────
#
# The picker is a free-text box. Its tooltip asks for the country first, but
# nothing enforces that, and the reported incident was a selection of six
# Indonesian cities and no country at all. That used to resolve for the eleven
# countries someone had hand-listed and fail for the rest — "Mumbai, Pune"
# gave India, "Jakarta, Surabaya" gave an error. These cases pin the rule that
# replaced that: a real city names its own country, whichever country it is.

# The exact selection from the incident, verbatim, country never named.
REPORTED_CITIES_ONLY = ["Jakarta", "Surabaya", "Bandung", "Medan", "Denpasar", "Makassar"]


def test_the_reported_cities_only_selection_resolves_to_indonesia():
    meta = meta_for(REPORTED_CITIES_ONLY, free_text="a study of Indian consumers")

    assert meta["countries"] == ["Indonesia"]
    assert meta["explicit_cities_by_country"] == {"Indonesia": REPORTED_CITIES_ONLY}


def test_the_reported_cities_only_selection_generates_personas_in_those_cities():
    ro = {"explicit_geography": REPORTED_CITIES_ONLY, "geography": "Indian consumers"}
    assignments = _assign_cities_to_personas(ro, 6)

    assert {country for _, country in assignments} == {"Indonesia"}
    assert {city for city, _ in assignments} == set(REPORTED_CITIES_ONLY)


@pytest.mark.parametrize(
    "expected_country, cities",
    [
        ("Indonesia", ["Jakarta", "Surabaya", "Bandung"]),
        ("Kenya", ["Nairobi", "Mombasa", "Kisumu"]),
        ("Vietnam", ["Hanoi", "Haiphong"]),
        ("Nigeria", ["Lagos", "Abuja", "Kano"]),
        ("Poland", ["Warsaw", "Krakow"]),
        ("Peru", ["Lima", "Arequipa"]),
        ("Morocco", ["Casablanca", "Rabat"]),
        ("Bangladesh", ["Dhaka", "Chittagong"]),
        ("Philippines", ["Quezon City", "Davao"]),
        ("Egypt", ["Cairo", "Alexandria"]),
        # The country the old code defaulted to, and the one country whose
        # cities always worked — it must still behave like all the others.
        ("India", ["Mumbai", "Pune"]),
    ],
)
def test_cities_without_a_country_resolve_to_their_own_country(expected_country, cities):
    meta = meta_for(cities, free_text="consumer research")

    assert meta["countries"] == [expected_country]
    assert meta["explicit_cities_by_country"] == {expected_country: cities}


@pytest.mark.parametrize(
    "expected_country, region",
    [
        ("Indonesia", "Bali"),
        ("India", "Maharashtra"),
        ("Germany", "Baden-Württemberg"),
        ("Japan", "Hokkaido"),
        ("Brazil", "Bahia"),
    ],
)
def test_a_region_without_a_country_resolves_to_its_own_country(expected_country, region):
    """States and provinces carry a country just as cities do, and the user
    who picks one has named their market as clearly as if they picked a city."""
    meta = meta_for([region], free_text="consumer research")

    assert meta["countries"] == [expected_country]
    assert meta["explicit_cities_by_country"] == {expected_country: [region]}


@pytest.mark.parametrize(
    "expected_country, city",
    [("India", "Bombay"), ("Vietnam", "Saigon"), ("India", "Bengaluru")],
)
def test_the_name_people_actually_type_resolves(expected_country, city):
    """Researchers type the name they know, which is not always the name the
    city currently files under."""
    assert meta_for([city])["countries"] == [expected_country]


# ── Ambiguity: refuse, unless the selection itself settles it ────────────────

def test_an_ambiguous_city_is_placed_by_a_country_named_in_the_same_selection():
    """Valencia alone is a coin-flip between Spain and Venezuela. Next to the
    country the user also picked, it is not ambiguous at all."""
    meta = meta_for(["Spain", "Valencia"])

    assert meta["countries"] == ["Spain"]
    assert meta["explicit_cities_by_country"] == {"Spain": ["Valencia"]}


def test_an_ambiguous_city_is_placed_by_the_unambiguous_cities_beside_it():
    """A selection is one market. Madrid settles which Valencia was meant,
    whichever order the two were added in."""
    assert meta_for(["Madrid", "Valencia"])["explicit_cities_by_country"] == {
        "Spain": ["Madrid", "Valencia"]
    }
    assert meta_for(["Valencia", "Madrid"])["explicit_cities_by_country"] == {
        "Spain": ["Valencia", "Madrid"]
    }


def test_a_location_that_cannot_place_itself_is_never_silently_dropped():
    """Every tag the user added has to come back attached to something. An
    unplaceable one used to vanish whenever the country had been established
    by another location rather than by an explicit country tag, so the user
    got personas for a market they had narrowed and no sign it was ignored."""
    meta = meta_for(["Mumbai", "Jabodetabek", "Nowherestan"])

    assert meta["countries"] == ["India"]
    assert meta["explicit_cities_by_country"] == {
        "India": ["Mumbai", "Jabodetabek", "Nowherestan"]
    }


def test_an_explicit_country_still_outranks_a_later_citys_own_country():
    """The country the user typed governs everything after it; a country
    merely inferred from an earlier city does not."""
    assert meta_for(["Indonesia", "Delhi"])["explicit_cities_by_country"] == {
        "Indonesia": ["Delhi"]
    }
    assert meta_for(["Mumbai", "Berlin"])["explicit_cities_by_country"] == {
        "India": ["Mumbai"], "Germany": ["Berlin"],
    }


def test_a_dominant_reading_is_used_and_a_close_one_is_not():
    """Santiago is 4.8M in Chile and 1.2M in the Dominican Republic — one of
    those is what anybody means. Valencia's two are the same order of
    magnitude, so it is the user's call, not this module's."""
    assert meta_for(["Santiago"])["countries"] == ["Chile"]

    with pytest.raises(GeographyResolutionError):
        meta_for(["Valencia"])


# ── The curated tables still own the markets they were tuned for ────────────

def test_a_curated_pool_still_wins_over_the_gazetteer():
    """India's pool is hand-ordered and drives the Tier 1/Tier 2 split and the
    India-specific demographic guidance, so it must keep being the pool India
    gets — not the gazetteer's own idea of India's biggest cities."""
    ro = {"explicit_geography": ["India"], "geography": "x"}
    assignments = _assign_cities_to_personas(ro, 4)
    cities = {city for city, _ in assignments}

    assert cities <= set(COUNTRY_CITY_POOLS["India"])
    # The curated pool says Bangalore; the gazetteer says Bengaluru. Which one
    # comes out is the proof of which pool was used.
    assert "Bangalore" in COUNTRY_CITY_POOLS["India"]
    assert "Bengaluru" in country_city_pool("India")
    assert "Bengaluru" not in cities


@pytest.mark.parametrize("region, expected", [("Georgia", "USA"), ("Victoria", "Australia")])
def test_names_shared_by_a_country_and_a_region_keep_their_long_standing_reading(region, expected):
    """Georgia and Victoria are a US state and an Australian state here, and
    have been since before the gazetteer existed. Curated entries are checked
    first exactly so that adding world data cannot silently reinterpret them."""
    assert meta_for([region])["countries"] == [expected]
