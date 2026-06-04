"""
Persona Replication Engine — package root.

Two modes are exposed:
  fast_localization       — lightweight geo-adaptation (existing behavior, gpt-4o-mini)
  deep_psychographic      — 5-stage psychographic reconstruction pipeline

Entry point: engine.replicate()
"""

from .engine import replicate  # noqa: F401
