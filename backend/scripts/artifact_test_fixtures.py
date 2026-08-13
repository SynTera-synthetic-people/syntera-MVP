"""Shared mock data for the artifact pipeline test scripts.

Not test code itself — just the mock personas and sample-ad-image generator
reused across scripts/test_artifact_pipeline.py and
scripts/test_artifact_pipeline_edge_cases.py.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MOCK_PERSONAS = [
    {
        "name": "Priya Nair",
        "age_range": "28-34",
        "occupation": "Marketing manager",
        "personality": "Skeptical of hype, values authenticity and data-backed claims",
        "brand_sensitivity": "Low; cares more about product substance than brand name",
        "values": "Sustainability, transparency",
    },
    {
        "name": "Jake Thompson",
        "age_range": "19-24",
        "occupation": "College student",
        "personality": "Impulsive, easily bored, drawn to humor and fast pacing",
        "brand_sensitivity": "High; follows trends and influencer endorsements",
        "values": "Novelty, social status",
    },
    {
        "name": "Margaret Ellis",
        "age_range": "55-64",
        "occupation": "Retired teacher",
        "personality": "Cautious, prefers clear explanations, distrusts flashy claims",
        "brand_sensitivity": "Medium; loyal to brands she has used for years",
        "values": "Reliability, family",
    },
]


def build_sample_ad_image(path: Path) -> None:
    """Writes a synthetic 'Voltra' sneaker ad image to `path`."""
    img = Image.new("RGB", (1024, 576), color=(20, 20, 30))
    draw = ImageDraw.Draw(img)

    draw.rectangle([0, 0, 1024, 576], fill=(15, 15, 25))
    draw.ellipse([700, 60, 980, 340], fill=(255, 196, 0))
    draw.rectangle([60, 380, 620, 470], fill=(255, 255, 255))

    try:
        font_big = ImageFont.truetype("arialbd.ttf", 54)
        font_small = ImageFont.truetype("arial.ttf", 28)
    except OSError:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    draw.text((60, 60), "VOLTRA", fill=(255, 196, 0), font=font_big)
    draw.text((60, 140), "BUILT FOR YOUR\nEVERYDAY HUSTLE", fill=(255, 255, 255), font=font_small)
    draw.text((80, 400), "SHOP NOW $89", fill=(15, 15, 25), font=font_small)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
