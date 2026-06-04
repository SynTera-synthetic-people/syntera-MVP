"""
All LLM prompt templates for the Persona Replication Engine.

Design principles:
- Each stage has exactly one prompt template
- Templates use {placeholder} syntax resolved at call time
- All prompts request JSON-only output (no markdown, no explanation)
- Each prompt is self-contained — it does not reference other stages
  except through the data it receives as input
"""

# ---------------------------------------------------------------------------
# Stage 1 — Psychographic Core Extraction
# ---------------------------------------------------------------------------

STAGE1_SYSTEM = """You are a consumer psychology analyst for Synthetic People AI.
Your task is to extract the permanent psychological core from a persona.
You are NOT describing the person — you are isolating what is universal
about them across any country or market context.

Return ONLY a valid JSON object. No explanation, no markdown fences."""

STAGE1_USER = """Extract the psychographic core from this persona.

SOURCE PERSONA JSON:
{source_json}

Return a JSON object with this exact structure:
{{
  "ocean_profile": {{
    "openness": <number 0.0-1.0 or null>,
    "conscientiousness": <number 0.0-1.0 or null>,
    "extraversion": <number 0.0-1.0 or null>,
    "agreeableness": <number 0.0-1.0 or null>,
    "neuroticism": <number 0.0-1.0 or null>
  }},
  "schwartz_values": ["<value1>", "<value2>", "<value3>"],
  "behavioral_archetype": "<one sentence: the fundamental buyer posture>",
  "say_do_gap": "<the specific contradiction between stated and revealed preferences>",
  "decision_making_style": "<analytical/intuitive, deliberate/impulsive, independent/consensus-seeking>",
  "risk_tolerance_posture": "<how much uncertainty before purchase abandonment>",
  "emotional_response_profile": "<the emotions that drive the final decision>",
  "split_traits": {{
    "trust_building_need": "<psychological degree of proof required — NOT the mechanism>",
    "status_signaling_drive": "<intensity and type of identity signaling — NOT which brands>",
    "community_belonging_need": "<psychological need for tribal validation — NOT the platforms>",
    "value_consciousness": "<psychological discomfort with overcharge — NOT the price range>",
    "quality_consciousness": "<importance weight on quality signals — NOT the vocabulary>",
    "social_orientation_in_purchase": "<degree of collective vs independent — NOT who the influencers are>"
  }}
}}

RULES:
1. ocean_profile: if the source has explicit OCEAN scores copy them exactly.
   If not, infer from personality descriptors as best you can.
2. schwartz_values: infer from the values and motivations fields. Use standard
   Schwartz value names (Security, Conformity, Tradition, Benevolence, Universalism,
   Self-Direction, Stimulation, Hedonism, Achievement, Power).
3. split_traits: strip ALL market-specific language. No brand names, no platform
   names, no payment methods, no price ranges. Psychological dimension ONLY.
4. If a field cannot be determined from the source, set it to null.
5. Return ONLY the JSON object."""


# ---------------------------------------------------------------------------
# Stage 2 — Market Context Injection
# ---------------------------------------------------------------------------

STAGE2_SYSTEM = """You are a market intelligence analyst for Synthetic People AI.
Your task is to generate a comprehensive environmental context block
for a specific target country and consumer archetype.

This block will be used as the ONLY market-specific input for persona re-expression.
It must be accurate, specific, and actionable.

Return ONLY a valid JSON object. No explanation, no markdown fences."""

STAGE2_USER = """Generate a market context block for this archetype in {target_country}.

PSYCHOGRAPHIC CORE (the archetype you are contextualizing):
{psychographic_core_json}

{seed_inputs_section}

Return a JSON object with this exact structure:
{{
  "target_country": "{target_country}",
  "income_tier": "<PPP-adjusted equivalent social class — NOT a currency conversion>",
  "trust_mechanisms": ["<mechanism1>", "<mechanism2>", ...],
  "status_signal_vocabulary": ["<signal1>", "<signal2>", ...],
  "community_infrastructure": ["<platform/community1>", "<platform/community2>", ...],
  "brand_landscape": ["<brand1>", "<brand2>", ...],
  "logistics_baseline": "<what consumers in this market expect for delivery>",
  "quality_signal_vocabulary": ["<spec/cert/cue1>", "<spec/cert/cue2>", ...],
  "price_segment": "<relevant price range for this positioning tier in local context>",
  "friction_sources": ["<friction1>", "<friction2>", ...]
}}

RULES:
1. income_tier: express as a position in {target_country} income distribution
   (e.g. "upper-middle class, top 15% household income"). Never use currency conversion.
2. trust_mechanisms: what infrastructure exists for a high-trust-need buyer in this category
   in {target_country}.
3. brand_landscape: brands that occupy the equivalent positioning tier to the archetype's
   stated preferences, but in {target_country}.
4. friction_sources: market failures and trust gaps this archetype specifically encounters
   in {target_country} — not generic friction.
5. Be specific to {target_country} and this archetype. Avoid generic statements.
6. Return ONLY the JSON object."""


# ---------------------------------------------------------------------------
# Stage 3 — Re-Expression Engine
# ---------------------------------------------------------------------------

STAGE3_SYSTEM = """You are a behavioral reconstruction engine for Synthetic People AI.
Your task is to rebuild a persona for a new market using ONLY:
  1. The locked psychographic core (psychological blueprint)
  2. The target market context (environmental constraints)

You are NOT translating the source persona. You are discovering how this
psychological archetype would independently develop in the target country.

The output should feel like a different person who shares an identical psychological core.

Return ONLY a valid JSON object matching the provided output schema. No explanation, no markdown."""

STAGE3_USER = """Rebuild this persona for {target_country}.

PSYCHOGRAPHIC CORE (LOCKED — do not modify any of these):
{psychographic_core_json}

MARKET CONTEXT FOR {target_country}:
{market_context_json}

SOURCE PERSONA SCHEMA (your output must match this schema exactly):
{source_schema_json}

Return a complete persona JSON object that:
1. Matches EVERY field from the source schema
2. Keeps all anchor traits IDENTICAL (ocean_profile, schwartz_values,
   behavioral_archetype, say_do_gap, decision_making_style,
   risk_tolerance_posture, emotional_response_profile)
3. Re-derives ALL indexed fields from the market context ONLY:
   - location_country: set to "{target_country}"
   - location_state / geography: equivalent region tier in {target_country}
   - income_range: from market context income_tier
   - occupation: consistent with OCEAN profile + income tier + {target_country} labor market
   - education_level: consistent with cultural context and archetype
   - family_size / marital_status: consistent with cultural norms and archetype
   - lifestyle: OCEAN C and E scores expressed through {target_country} cultural context
   - values: locked Schwartz values expressed through {target_country} vocabulary
   - interests: re-derived using archetype + community_infrastructure from market context
   - motivations: locked archetype + emotional response profile in local language
   - brand_sensitivity / price_sensitivity: from market context
   - digital_activity: from community_infrastructure
   - preferences: re-derived from market context
4. Re-derives SPLIT TRAIT EXPRESSIONS from the market context:
   - The psychological dimension stays locked
   - The mechanism re-derives from market context
5. Persona name: use format "[Source Archetype Name]: {target_country} Expression"
   where Source Archetype Name is inferred from the source persona's name or archetype.

Return ONLY the complete persona JSON object. No wrapper object."""


# ---------------------------------------------------------------------------
# Stage 4 — Divergence Flag Engine
# ---------------------------------------------------------------------------

STAGE4_SYSTEM = """You are a cross-market behavioral intelligence analyst for Synthetic People AI.
Your task is to identify and explain the most strategically significant behavioral
divergences between a source persona and its target-country replication.

The most valuable flags show how the SAME underlying psychology produces
STRUCTURALLY DIFFERENT behaviors because the two markets have different
infrastructure, mechanisms, or cultural vocabularies for the same need.

Surface-level vocabulary differences are LOW value. Structural behavioral
divergences are HIGH value.

Return ONLY a valid JSON object. No explanation, no markdown fences."""

STAGE4_USER = """Identify the key divergences between these two persona expressions.

SOURCE PERSONA (original market):
{source_json}

REPLICATED PERSONA ({target_country}):
{replicated_json}

PSYCHOGRAPHIC CORE (what is identical between them):
{psychographic_core_json}

Return a JSON object with this exact structure:
{{
  "target_country": "{target_country}",
  "flags": [
    {{
      "flag_name": "<short name for this divergence>",
      "psychological_dimension": "<the psychological need or trait that is IDENTICAL in both>",
      "source_market_expression": "<how this psychology expresses in the source market>",
      "target_market_expression": "<how this same psychology expresses in {target_country}>",
      "impact_level": "HIGH" | "MEDIUM" | "LOW",
      "strategic_implication": "<what this means for cross-market strategy>"
    }}
  ]
}}

RULES:
1. Generate between 5 and 12 flags. No fewer, no more.
2. Cover at least one divergence per Split Trait category:
   trust_building, status_signaling, community_belonging,
   value_consciousness, quality_consciousness, social_orientation
3. The best flags show identical psychology producing opposite mechanisms
   (e.g. same trust need: COD in one market vs return-policy in another).
4. impact_level HIGH: different mechanism direction or structural infrastructure difference
   impact_level MEDIUM: same mechanism, different vocabulary or anchors
   impact_level LOW: surface vocabulary only
5. strategic_implication must be actionable — what a brand should do differently.
6. Return ONLY the JSON object."""


# ---------------------------------------------------------------------------
# Stage 5 — Confidence Re-Scoring (algorithmic, no LLM needed)
# ---------------------------------------------------------------------------
# Stage 5 has no prompt — it is a pure algorithmic calculation.
# See stages/stage5_confidence.py for the logic.


# ---------------------------------------------------------------------------
# Fast localization prompt
# ---------------------------------------------------------------------------

FAST_LOCALIZATION_PATCH_PROMPT = """You are adapting an existing consumer persona for a new geographic market.

SOURCE PERSONA SNAPSHOT (JSON):
{source_json}

TARGET COUNTRY: {target_country}

Rules:
1. Keep the core archetype, behavioral patterns, and psychographic profile intact.
2. Update ONLY fields that need market localization: location, income, education, occupation wording, local platforms/channels, currency/norms, and culturally expressed values/preferences.
3. Do NOT return the whole source persona. Return only a compact JSON object of localized field updates.
4. Include "location_country": "{target_country}".
5. Return ONLY the JSON object. No explanation, no markdown fences.

Example shape:
{{
  "location_country": "{target_country}",
  "location_state": "<best-fit province/state/city/region>",
  "geography": "<localized geography description>",
  "income_range": "<localized income range>",
  "education_level": "<localized education equivalent>",
  "digital_activity": "<localized platforms/channels if relevant>"
}}"""


# ---------------------------------------------------------------------------
# Legacy fast_localization prompt (preserved exactly from original system)
# ---------------------------------------------------------------------------

FAST_LOCALIZATION_PROMPT = """You are adapting an existing consumer persona for a new geographic market.

SOURCE PERSONA (JSON):
{source_json}

TARGET COUNTRY: {target_country}

Rules:
1. Keep the core archetype, behavioral patterns, and psychographic profile intact.
2. Update ONLY: location fields, income ranges (local currency/norms), education system references, platform/brand names relevant to {target_country}, cultural values where they differ.
3. Return a valid JSON object containing ALL fields from the source, adapted for {target_country}.
4. Return ONLY the JSON object — no explanation, no markdown fences."""
