"""Regenerate app/data/geonames_places.json — the open-world place gazetteer.

WHY: country recognition is open-world (app/data/iso3166_countries.json covers
all 249 ISO countries), but city/region recognition used to be a hand-written
list of ~11 countries. A user who picked "Jakarta, Surabaya, Bandung" — cities,
no country — could not be placed at all, while "Mumbai, Pune" could, purely
because India was one of the eleven. This dataset closes that gap with data
instead of with more hand-written entries.

Run (from backend/, network required — downloads ~3.4 MB):
    python scripts/generate_place_dataset.py

Source: GeoNames (https://www.geonames.org/), licensed CC BY 4.0.
  - cities15000.txt      every city with population > 15,000
  - admin1CodesASCII.txt first-level administrative divisions (states/provinces)
  - countryInfo.txt      ISO 3166-1 alpha-2 -> alpha-3, to join to our own
                         ISO dataset so both agree on a country's canonical name

Design notes, so a regeneration does not quietly change behaviour:
  - Names are stored normalized (see country_names.normalize_place) and map to
    COUNTRIES, not to individual cities: six Springfields in the USA are one
    "USA" candidate, not six. Ambiguity that matters is ambiguity between
    countries.
  - Each candidate carries a weight (population) so the runtime can tell a
    dominant match ("London" -> 8.9M in GB vs 422k in CA) from a genuine
    coin-flip ("Valencia" -> 814k ES vs 794k VE), and refuse to guess on the
    latter.
  - A region's weight is the summed population of the cities inside it, so
    regions rank against each other on the same scale as cities.
  - Sections of cities (feature code PPLX — "Brooklyn", "Queens") are excluded
    from the pools, which are meant to be cities a persona can live "in".
  - Alternate names are kept only for cities over 1M and only in plain ASCII,
    which buys the historic/common spellings a researcher actually types
    ("Bombay", "Saigon", "Bangalore") without importing every transliteration.
"""

from __future__ import annotations

import io
import json
import sys
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.country_names import normalize_place  # noqa: E402

GEONAMES_BASE = "https://download.geonames.org/export/dump/"
ISO_DATASET = BACKEND_ROOT / "app" / "data" / "iso3166_countries.json"
OUTPUT = BACKEND_ROOT / "app" / "data" / "geonames_places.json"

# Cities big enough that their common alternate spellings are worth carrying.
ALTERNATE_NAME_MIN_POPULATION = 1_000_000
# Cities per country in the generated assignment pool. The curated pools in
# digital_brain_pipeline run 3-28 entries; 12 sits inside that range and is
# more than any realistic persona batch needs.
POOL_SIZE = 12
# Candidate countries kept per name. Past a handful it is noise, and the
# runtime refuses to guess between the top two anyway.
MAX_CANDIDATES = 4


def fetch(filename: str) -> str:
    url = GEONAMES_BASE + filename
    print(f"  downloading {url}")
    with urllib.request.urlopen(url, timeout=180) as response:
        payload = response.read()
    if filename.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            payload = archive.read(filename.replace(".zip", ".txt"))
    return payload.decode("utf-8")


def iso3_to_canonical_name() -> dict[str, str]:
    """ISO alpha-3 -> the country name our own ISO dataset calls canonical.

    Joining on the alpha-3 code (which that dataset carries as an alias) means
    a city resolves to exactly the label is_country()/iso_country_name() hand
    back for the same country, so a user typing "Indonesia" and a city
    resolving to Indonesia are one country downstream, never two.
    """
    with ISO_DATASET.open(encoding="utf-8") as handle:
        records = json.load(handle)
    index: dict[str, str] = {}
    for record in records:
        for alias in record["aliases"]:
            if len(alias) == 3 and alias.isupper():
                index[alias] = record["name"]
    return index


def main() -> int:
    print("Regenerating place gazetteer")
    iso3_names = iso3_to_canonical_name()

    # alpha-2 -> canonical country name
    country_by_code: dict[str, str] = {}
    for line in fetch("countryInfo.txt").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        fields = line.split("\t")
        if len(fields) < 5:
            continue
        alpha2, alpha3 = fields[0].strip(), fields[1].strip()
        canonical = iso3_names.get(alpha3)
        if canonical:
            country_by_code[alpha2] = canonical

    # name -> country -> (weight, is_primary)
    cities: dict[str, dict[str, tuple[int, int]]] = {}
    regions: dict[str, dict[str, tuple[int, int]]] = {}
    pools: dict[str, list[tuple[int, str]]] = {}
    admin1_population: dict[str, int] = {}

    def add(
        index: dict[str, dict[str, tuple[int, int]]],
        name: str,
        country: str,
        weight: int,
        primary: int = 1,
    ) -> None:
        """Record that `country` has a place called `name`.

        `primary` separates a place's own name from a historic or foreign
        alternate for it. Without that distinction "Alexandria" reads as a
        toss-up between Egypt (its own name, 5.3M) and Iran (an alternate
        name carried by a 2.3M city), which is not a real ambiguity.
        """
        key = normalize_place(name)
        if not key or len(key) < 2:
            return
        bucket = index.setdefault(key, {})
        # Max, not sum: one big Springfield represents the USA better than the
        # arithmetic of six unrelated towns that happen to share a name.
        previous_weight, previous_primary = bucket.get(country, (0, 0))
        bucket[country] = (max(weight, previous_weight), max(primary, previous_primary))

    skipped_countries: set[str] = set()
    for line in fetch("cities15000.zip").splitlines():
        fields = line.split("\t")
        if len(fields) < 15:
            continue
        name, ascii_name, alternates = fields[1], fields[2], fields[3]
        feature_code, alpha2, admin1 = fields[7], fields[8], fields[10]
        try:
            population = int(fields[14])
        except ValueError:
            continue

        country = country_by_code.get(alpha2)
        if not country:
            skipped_countries.add(alpha2)
            continue

        add(cities, name, country, population)
        add(cities, ascii_name, country, population)
        if population >= ALTERNATE_NAME_MIN_POPULATION:
            for alternate in alternates.split(","):
                alternate = alternate.strip()
                if len(alternate) >= 4 and alternate.isascii() and alternate.replace(" ", "").isalpha():
                    add(cities, alternate, country, population, primary=0)

        if admin1:
            admin1_population[f"{alpha2}.{admin1}"] = (
                admin1_population.get(f"{alpha2}.{admin1}", 0) + population
            )

        # "Section of populated place" is a neighbourhood, not somewhere a
        # persona is described as living.
        # The pool feeds persona prompts, so it carries the city's real name
        # ("Thủ Đức"), not GeoNames' ASCII transliteration of it ("Thu GJuc").
        if feature_code != "PPLX":
            pools.setdefault(country, []).append((population, name or ascii_name))

    for line in fetch("admin1CodesASCII.txt").splitlines():
        fields = line.split("\t")
        if len(fields) < 3:
            continue
        code, name, ascii_name = fields[0], fields[1], fields[2]
        alpha2 = code.split(".")[0]
        country = country_by_code.get(alpha2)
        if not country:
            continue
        weight = admin1_population.get(code, 0)
        add(regions, name, country, weight)
        add(regions, ascii_name, country, weight)

    def rank(index: dict[str, dict[str, tuple[int, int]]]) -> dict[str, list[list]]:
        """A name's countries, its own-name claims first and biggest first."""
        ranked: dict[str, list[list]] = {}
        for key, by_country in index.items():
            ordered = sorted(
                by_country.items(), key=lambda kv: (-kv[1][1], -kv[1][0], kv[0])
            )
            ranked[key] = [
                [country, weight, primary]
                for country, (weight, primary) in ordered[:MAX_CANDIDATES]
            ]
        return ranked

    city_pools: dict[str, list[str]] = {}
    for country, entries in pools.items():
        seen: set[str] = set()
        ordered: list[str] = []
        for _, city in sorted(entries, key=lambda item: (-item[0], item[1])):
            if city.lower() in seen:
                continue
            seen.add(city.lower())
            ordered.append(city)
            if len(ordered) >= POOL_SIZE:
                break
        city_pools[country] = ordered

    dataset = {
        "_source": "GeoNames (https://www.geonames.org/) — cities15000, admin1CodesASCII, countryInfo",
        "_license": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
        "_generated_by": "scripts/generate_place_dataset.py",
        "_generated_on": date.today().isoformat(),
        "cities": rank(cities),
        "regions": rank(regions),
        "city_pools": dict(sorted(city_pools.items())),
    }

    OUTPUT.write_text(
        json.dumps(dataset, ensure_ascii=False, separators=(",", ":"), sort_keys=False),
        encoding="utf-8",
    )

    print(f"  cities:  {len(dataset['cities']):,} names")
    print(f"  regions: {len(dataset['regions']):,} names")
    print(f"  pools:   {len(dataset['city_pools']):,} countries")
    print(f"  written: {OUTPUT} ({OUTPUT.stat().st_size / 1_000_000:.2f} MB)")
    if skipped_countries:
        print(f"  note: no ISO match for codes {sorted(skipped_countries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
