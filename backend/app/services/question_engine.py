from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.utils.id_generator import generate_id


# ---------------------------------------------------------------------------
# Type alias registry
# ---------------------------------------------------------------------------

QUESTION_TYPE_ALIASES: Dict[str, str] = {
    # ── Single Select ──────────────────────────────────────────────────────
    "single select": "single_select",
    "single_select": "single_select",
    "single-choice": "single_select",
    "single_choice": "single_select",
    "mcq": "single_select",
    # ── Multi Select ───────────────────────────────────────────────────────
    "multiple choice": "multi_select",
    "multi select": "multi_select",
    "multi_select": "multi_select",
    "multiple_select": "multi_select",
    "checkbox": "multi_select",
    "checkboxes": "multi_select",
    # ── Dropdown ───────────────────────────────────────────────────────────
    "dropdown": "dropdown",
    "drop down": "dropdown",
    "drop-down": "dropdown",
    "select": "dropdown",
    # ── This or That ───────────────────────────────────────────────────────
    "this or that": "this_or_that",
    "this_or_that": "this_or_that",
    "a/b": "this_or_that",
    "ab": "this_or_that",
    "binary": "this_or_that",
    # ── Text (short open-end) ──────────────────────────────────────────────
    "text": "text",
    "open": "text",
    "open-ended": "text",
    "open_ended": "text",
    "short_text": "text",
    "short text": "text",
    # ── Essay (long open-end) ──────────────────────────────────────────────
    "essay": "essay",
    "long_text": "essay",
    "long text": "essay",
    "paragraph": "essay",
    # ── Number ─────────────────────────────────────────────────────────────
    "number": "number",
    "numeric": "number",
    "integer": "number",
    "float": "number",
    "decimal": "number",
    "number (integer and float)": "number",
    # ── Autosum ────────────────────────────────────────────────────────────
    "autosum": "autosum",
    "auto sum": "autosum",
    "auto-sum": "autosum",
    "constant sum": "constant_sum",
    "constant_sum": "constant_sum",
    # ── Date Picker ────────────────────────────────────────────────────────
    "date": "date_picker",
    "date picker": "date_picker",
    "date_picker": "date_picker",
    "datepicker": "date_picker",
    # ── Auto Suggest ───────────────────────────────────────────────────────
    "auto suggest": "auto_suggest",
    "auto_suggest": "auto_suggest",
    "autosuggest": "auto_suggest",
    "suggest": "auto_suggest",
    # ── Rating Scale ───────────────────────────────────────────────────────
    "rating": "rating_scale",
    "rating scale": "rating_scale",
    "rating_scale": "rating_scale",
    "likert": "rating_scale",
    "likert_5": "rating_scale",
    "likert_7": "rating_scale",
    # ── Button Rating ──────────────────────────────────────────────────────
    "button rating": "button_rating",
    "button_rating": "button_rating",
    "buttonrating": "button_rating",
    # ── Star Rating ────────────────────────────────────────────────────────
    "star rating": "star_rating",
    "star_rating": "star_rating",
    "starrating": "star_rating",
    "star": "star_rating",
    # ── Card Rating ────────────────────────────────────────────────────────
    "card rating": "card_rating",
    "card_rating": "card_rating",
    # ── Slider Rating (distinct from plain slider) ─────────────────────────
    "slider rating": "slider_rating",
    "slider_rating": "slider_rating",
    # ── Slider ─────────────────────────────────────────────────────────────
    "slider": "slider",
    # ── Rank Sort ──────────────────────────────────────────────────────────
    "ranking": "ranking",
    "rank_order": "ranking",
    "rank order": "ranking",
    "rank sort": "ranking",
    "rank_sort": "ranking",
    # ── Card Sort ──────────────────────────────────────────────────────────
    "card sort": "card_sort",
    "card_sort": "card_sort",
    "cardsort": "card_sort",
    # ── MaxDiff ────────────────────────────────────────────────────────────
    "maxdiff": "maxdiff",
    "max diff": "maxdiff",
    "max_diff": "maxdiff",
    "maximum difference": "maxdiff",
    # ── Grid ───────────────────────────────────────────────────────────────
    "single select grid": "grid_single_select",
    "single_select_grid": "grid_single_select",
    "grid_single_select": "grid_single_select",
    "multi select grid": "grid_multi_select",
    "multi_select_grid": "grid_multi_select",
    "grid_multi_select": "grid_multi_select",
    "matrix": "matrix_rating",
    "matrix_rating": "matrix_rating",
    # ── Image Map ──────────────────────────────────────────────────────────
    "image map": "image_map",
    "image_map": "image_map",
    "imagemap": "image_map",
    "hotspot": "image_map",
    # ── Page Turner ────────────────────────────────────────────────────────
    "page turner": "page_turner",
    "page_turner": "page_turner",
    "pageturner": "page_turner",
    # ── Video Player (uploaded file) ───────────────────────────────────────
    "video player": "video_player",
    "video_player": "video_player",
    "videoplayer": "video_player",
    # ── Video Player (YouTube / Vimeo URL) ─────────────────────────────────
    "video player (youtube / vimeo)": "video_player_url",
    "video_player_url": "video_player_url",
    "youtube": "video_player_url",
    "vimeo": "video_player_url",
    "video url": "video_player_url",
    # ── File / Media Upload (stimulus authored by researcher) ──────────────
    "media": "media_prompt",
    "media_prompt": "media_prompt",
    "file upload": "file_upload",
    "file_upload": "file_upload",
    # ── Participant Upload ──────────────────────────────────────────────────
    "video": "video_upload",
    "video_upload": "video_upload",
    "image": "image_upload",
    "photo": "image_upload",
    "image_upload": "image_upload",
    "image upload": "image_upload",
    # ── Language ───────────────────────────────────────────────────────────
    "language": "language",
    "language select": "language",
    "language_select": "language",
    # ── Logic elements ─────────────────────────────────────────────────────
    "loop": "loop",
    "quota": "quota",
    "skip": "skip",
    "skip logic": "skip",
    "skip_logic": "skip",
    "terminate": "terminate",
    "disqualify": "terminate",
    "screen out": "terminate",
    # ── Reusable answer lists ──────────────────────────────────────────────
    "reusable answer lists": "reusable_answer_lists",
    "reusable_answer_lists": "reusable_answer_lists",
    "answer list": "reusable_answer_lists",
    # ── Structural elements ────────────────────────────────────────────────
    "section": "section",
    "note": "note",
    "exec": "exec",
    "import data": "import_data",
    "import_data": "import_data",
}

# ---------------------------------------------------------------------------
# Type classification sets
# ---------------------------------------------------------------------------

OPTION_BASED_TYPES = {
    "single_select",
    "multi_select",
    "dropdown",
    "this_or_that",
    "rating_scale",
    "button_rating",
    "ranking",
    "card_sort",
    "maxdiff",
    "grid_single_select",
    "grid_multi_select",
    "matrix_rating",
    "constant_sum",
    "language",
    "reusable_answer_lists",
}

UPLOAD_TYPES = {
    "file_upload",
    "video_upload",
    "image_upload",
}

STIMULUS_TYPES = {
    "media_prompt",
    "image_map",
    "page_turner",
    "video_player",
    "video_player_url",
}

STRUCTURAL_TYPES = {
    "section",
    "note",
    "exec",
    "import_data",
    "loop",
    "quota",
    "skip",
    "terminate",
}

# ---------------------------------------------------------------------------
# Full question type catalog
# ---------------------------------------------------------------------------

QUESTION_TYPE_CATALOG: Dict[str, Dict[str, Any]] = {
    # ── Selection ─────────────────────────────────────────────────────────
    "single_select": {
        "label": "Single Select",
        "category": "selection",
        "requires_options": True,
        "result_shape": "single_option",
        "instruction_hint": "Select one",
    },
    "multi_select": {
        "label": "Multi Select",
        "category": "selection",
        "requires_options": True,
        "result_shape": "option_array",
        "instruction_hint": "Select all that apply",
    },
    "dropdown": {
        "label": "Dropdown",
        "category": "selection",
        "requires_options": True,
        "result_shape": "single_option",
        "instruction_hint": "Select one",
    },
    "this_or_that": {
        "label": "This or That",
        "category": "selection",
        "requires_options": True,
        "result_shape": "single_option",
        "instruction_hint": "Please select the option you prefer between the two shown below",
    },
    # ── Open-Ended ────────────────────────────────────────────────────────
    "text": {
        "label": "Text",
        "category": "open_ended",
        "requires_options": False,
        "result_shape": "text",
        "instruction_hint": "Please be as precise as possible",
    },
    "essay": {
        "label": "Essay",
        "category": "open_ended",
        "requires_options": False,
        "result_shape": "text",
        "instruction_hint": "Please be as detailed as possible",
    },
    "number": {
        "label": "Number",
        "category": "open_ended",
        "requires_options": False,
        "result_shape": "number",
        "instruction_hint": "Please enter a numeric value only",
        "config_fields": ["number_type", "min", "max", "unit"],
    },
    "autosum": {
        "label": "Autosum",
        "category": "open_ended",
        "requires_options": True,
        "result_shape": "row_number_map",
        "instruction_hint": "",
    },
    "date_picker": {
        "label": "Date Picker",
        "category": "open_ended",
        "requires_options": False,
        "result_shape": "date",
        "instruction_hint": "Select date",
    },
    "auto_suggest": {
        "label": "Auto Suggest",
        "category": "open_ended",
        "requires_options": False,
        "result_shape": "text",
        "instruction_hint": "Be specific",
        "config_fields": ["source_file_url", "source_file_name"],
    },
    # ── Rating / Ranking / Sort ───────────────────────────────────────────
    "rating_scale": {
        "label": "Rating Scale",
        "category": "rating",
        "requires_options": False,
        "result_shape": "row_number_map",
        "instruction_hint": "Please keep it open",
        "config_fields": ["rows", "columns", "scale_min", "scale_max"],
    },
    "button_rating": {
        "label": "Button Rating",
        "category": "rating",
        "requires_options": True,
        "result_shape": "single_option",
        "instruction_hint": "Select One",
    },
    "star_rating": {
        "label": "Star Rating",
        "category": "rating",
        "requires_options": False,
        "result_shape": "row_number_map",
        "instruction_hint": "Select One",
        "config_fields": ["rows", "max_stars", "star_tooltip"],
    },
    "card_rating": {
        "label": "Card Rating",
        "category": "rating",
        "requires_options": True,
        "result_shape": "ordered_option_array",
        "instruction_hint": "Rate the following products by dragging cards",
        "config_fields": ["cards", "buttons"],
    },
    "slider_rating": {
        "label": "Slider Rating",
        "category": "rating",
        "requires_options": False,
        "result_shape": "slider_map",
        "instruction_hint": "Slide to rate your satisfaction",
        "config_fields": ["sliders", "points"],
    },
    "slider": {
        "label": "Slider",
        "category": "rating",
        "requires_options": False,
        "result_shape": "number",
        "instruction_hint": "Slide to rate your satisfaction",
        "config_fields": ["sliders"],
    },
    "ranking": {
        "label": "Rank Sort",
        "category": "ranking",
        "requires_options": True,
        "result_shape": "ordered_option_array",
        "instruction_hint": "Rank the following brands in order of preference",
        "config_fields": ["rank_labels", "rankable_items"],
    },
    "card_sort": {
        "label": "Card Sort",
        "category": "ranking",
        "requires_options": True,
        "result_shape": "card_bucket_map",
        "instruction_hint": "Single Select",
        "config_fields": ["cards", "buckets"],
    },
    "maxdiff": {
        "label": "MaxDiff",
        "category": "ranking",
        "requires_options": True,
        "result_shape": "maxdiff_result",
        "instruction_hint": "Select the MOST and LEAST important feature",
        "config_fields": ["attributes", "columns"],
    },
    # ── Grid ─────────────────────────────────────────────────────────────
    "grid_single_select": {
        "label": "Single Select Grid",
        "category": "grid",
        "requires_options": True,
        "result_shape": "row_option_map",
        "instruction_hint": "Select one per row",
    },
    "grid_multi_select": {
        "label": "Multi Select Grid",
        "category": "grid",
        "requires_options": True,
        "result_shape": "row_option_array_map",
        "instruction_hint": "Select all that apply per row",
    },
    "matrix_rating": {
        "label": "Matrix Rating",
        "category": "grid",
        "requires_options": False,
        "result_shape": "row_number_map",
        "instruction_hint": "",
    },
    "constant_sum": {
        "label": "Constant Sum",
        "category": "grid",
        "requires_options": True,
        "result_shape": "option_number_map",
        "instruction_hint": "",
    },
    # ── Stimulus ─────────────────────────────────────────────────────────
    "image_map": {
        "label": "Image Map",
        "category": "stimulus",
        "requires_options": False,
        "result_shape": "coordinate",
        "instruction_hint": "Click on the part of the image you like most",
        "config_fields": ["image_url", "markers"],
    },
    "page_turner": {
        "label": "Page Turner",
        "category": "stimulus",
        "requires_options": False,
        "result_shape": "acknowledgement",
        "instruction_hint": "Click on the part of the image you like most",
        "config_fields": ["pages"],
    },
    "video_player": {
        "label": "Video Player",
        "category": "stimulus",
        "requires_options": False,
        "result_shape": "acknowledgement",
        "instruction_hint": "Watch the video and answer questions",
        "config_fields": ["video_url", "video_filename"],
    },
    "video_player_url": {
        "label": "Video Player (YouTube / Vimeo)",
        "category": "stimulus",
        "requires_options": False,
        "result_shape": "acknowledgement",
        "instruction_hint": "Watch the video and answer questions",
        "config_fields": ["name", "url"],
    },
    "media_prompt": {
        "label": "Media Prompt",
        "category": "stimulus",
        "requires_options": False,
        "result_shape": "acknowledgement",
    },
    # ── Participant Uploads ───────────────────────────────────────────────
    "file_upload": {
        "label": "File Upload",
        "category": "upload",
        "requires_options": False,
        "result_shape": "asset",
    },
    "video_upload": {
        "label": "Video Upload",
        "category": "upload",
        "requires_options": False,
        "result_shape": "asset",
    },
    "image_upload": {
        "label": "Image Upload",
        "category": "upload",
        "requires_options": False,
        "result_shape": "asset",
        "instruction_hint": "Please upload a photo of your recent purchase",
    },
    # ── Language ─────────────────────────────────────────────────────────
    "language": {
        "label": "Language",
        "category": "selection",
        "requires_options": True,
        "result_shape": "single_option",
        "instruction_hint": "Please select your preferred language",
        "config_fields": ["languages"],
    },
    # ── Logic Elements ───────────────────────────────────────────────────
    "loop": {
        "label": "Loop",
        "category": "logic",
        "requires_options": False,
        "result_shape": "loop",
        "instruction_hint": "Repeated question block instruction",
        "config_fields": ["loop_source", "pipe_variables", "looped_elements"],
    },
    "quota": {
        "label": "Quota",
        "category": "logic",
        "requires_options": False,
        "result_shape": "quota",
        "instruction_hint": "This survey has reached the required number of responses",
        "config_fields": ["max_participants", "quota_cells"],
    },
    "skip": {
        "label": "Skip",
        "category": "logic",
        "requires_options": False,
        "result_shape": "navigation",
        "instruction_hint": "Automatic navigation based on answer",
        "config_fields": ["destination"],
    },
    "terminate": {
        "label": "Terminate",
        "category": "logic",
        "requires_options": False,
        "result_shape": "terminal",
        "instruction_hint": "",
    },
    "reusable_answer_lists": {
        "label": "Reusable Answer Lists",
        "category": "logic",
        "requires_options": True,
        "result_shape": "option_array",
        "instruction_hint": "",
    },
    # ── Structural Elements ───────────────────────────────────────────────
    "section": {
        "label": "Section",
        "category": "structural",
        "requires_options": False,
        "result_shape": "structural",
        "config_fields": ["section_name"],
    },
    "note": {
        "label": "Note",
        "category": "structural",
        "requires_options": False,
        "result_shape": "structural",
        "instruction_hint": "Please answer honestly",
        "config_fields": ["note_text"],
    },
    "exec": {
        "label": "Exec",
        "category": "structural",
        "requires_options": False,
        "result_shape": "structural",
        "instruction_hint": "System execution, no visible text",
    },
    "import_data": {
        "label": "Import Data",
        "category": "structural",
        "requires_options": False,
        "result_shape": "structural",
        "instruction_hint": "Background data loaded silently",
        "config_fields": ["data_file_url"],
    },
}


# ---------------------------------------------------------------------------
# Type normalizer
# ---------------------------------------------------------------------------

def normalize_question_type(
    raw: Optional[str],
    options: Optional[Iterable[Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> str:
    cfg = config or {}
    candidate = raw or cfg.get("question_type") or cfg.get("type") or cfg.get("input_type")
    if candidate:
        key = str(candidate).strip().lower().replace("-", " ")
        return QUESTION_TYPE_ALIASES.get(key, key.replace(" ", "_"))

    max_select = cfg.get("max_select")
    try:
        if max_select is not None and int(max_select) > 1:
            return "multi_select"
    except (TypeError, ValueError):
        pass

    return "single_select" if options else "text"


# ---------------------------------------------------------------------------
# Option schema normalizer
# ---------------------------------------------------------------------------

def _coerce_tags(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [v.strip() for v in value.split(",") if v.strip()]
    return []


def normalize_option_schema(
    options: Optional[Iterable[Any]],
) -> Tuple[List[str], List[Dict[str, Any]]]:
    labels: List[str] = []
    schema: List[Dict[str, Any]] = []

    for index, opt in enumerate(options or [], start=1):
        if isinstance(opt, dict):
            text = str(
                opt.get("text") or opt.get("label") or opt.get("option") or opt.get("value") or ""
            ).strip()
            if not text:
                continue
            option_id = str(opt.get("option_id") or opt.get("id") or f"opt{index}")
            value = opt.get("value", option_id)
            item: Dict[str, Any] = {
                "option_id": option_id,
                "text": text,
                "value": value,
                "tags": _coerce_tags(opt.get("tags")),
            }
            metadata = {
                k: v
                for k, v in opt.items()
                if k not in {"id", "option_id", "text", "label", "option", "value", "tags"}
            }
            if metadata:
                item["metadata"] = metadata
        else:
            text = str(opt).strip()
            if not text:
                continue
            item = {
                "option_id": f"opt{index}",
                "text": text,
                "value": f"opt{index}",
                "tags": [],
            }

        labels.append(item["text"])
        schema.append(item)

    return labels, schema


# ---------------------------------------------------------------------------
# Default config builder
# ---------------------------------------------------------------------------

def _default_config(
    question_type: str,
    labels: List[str],
    option_schema: List[Dict[str, Any]],
) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {
        "version": 1,
        "options": option_schema,
        "validation": {"required": True},
    }

    if question_type == "single_select":
        cfg.update({"min_select": 1, "max_select": 1})

    elif question_type in {"multi_select", "reusable_answer_lists"}:
        cfg.update({"min_select": 1, "max_select": max(1, len(labels))})

    elif question_type == "dropdown":
        cfg.update({"min_select": 1, "max_select": 1, "searchable": False})

    elif question_type == "this_or_that":
        cfg.update({
            "min_select": 1,
            "max_select": 1,
            "left_legend": labels[0] if len(labels) > 0 else "Option A",
            "right_legend": labels[1] if len(labels) > 1 else "Option B",
        })

    elif question_type == "essay":
        cfg.update({"max_length": 5000})

    elif question_type == "number":
        cfg.update({"number_type": "float", "min": None, "max": None, "unit": ""})

    elif question_type == "autosum":
        cfg.update({"rows": option_schema, "columns": [], "total": 100})

    elif question_type == "date_picker":
        cfg.update({"date_format": "YYYY-MM-DD", "min_date": None, "max_date": None})

    elif question_type == "auto_suggest":
        cfg.update({"source_file_url": None, "source_file_name": None, "max_suggestions": 5})

    elif question_type == "rating_scale":
        cfg.update({
            "rows": [],
            "columns": option_schema,
            "scale": {
                "min": 1,
                "max": len(labels) if labels else 5,
                "step": 1,
                "labels": labels,
            },
        })

    elif question_type == "button_rating":
        cfg.update({"rows": option_schema, "min_select": 1, "max_select": 1})

    elif question_type == "star_rating":
        cfg.update({"rows": [], "max_stars": 5, "star_tooltip": ""})

    elif question_type == "card_rating":
        cfg.update({"cards": option_schema, "buttons": []})

    elif question_type == "slider_rating":
        cfg.update({
            "sliders": option_schema,
            "points": [],
            "scale": {"min": 0, "max": 100, "step": 1},
        })

    elif question_type == "slider":
        cfg.update({"sliders": option_schema or [], "scale": {"min": 0, "max": 100, "step": 1}})

    elif question_type == "ranking":
        cfg.update({
            "rank_labels": [],
            "rankable_items": option_schema,
            "min_rank": 1,
            "max_rank": len(labels),
        })

    elif question_type == "card_sort":
        cfg.update({"cards": option_schema, "buckets": []})

    elif question_type == "maxdiff":
        cfg.update({"attributes": option_schema, "columns": []})

    elif question_type in {"grid_single_select", "grid_multi_select", "matrix_rating"}:
        cfg.setdefault("rows", [])
        cfg.setdefault("columns", option_schema)

    elif question_type == "constant_sum":
        cfg.update({"total": 100})

    elif question_type == "image_map":
        cfg.update({"image_url": None, "markers": []})

    elif question_type == "page_turner":
        cfg.update({"pages": []})

    elif question_type == "video_player":
        cfg.update({"video_url": None, "video_filename": None})

    elif question_type == "video_player_url":
        cfg.update({"name": "", "url": ""})

    elif question_type in UPLOAD_TYPES:
        cfg.update({"allowed_file_types": [], "max_file_size_mb": 25})

    elif question_type == "language":
        cfg.update({"languages": option_schema or []})

    elif question_type == "loop":
        cfg.update({"loop_source": None, "pipe_variables": [], "looped_elements": []})

    elif question_type == "quota":
        cfg.update({"max_participants": None, "quota_cells": []})

    elif question_type == "skip":
        cfg.update({"destination": None, "condition": None})

    elif question_type == "note":
        cfg.update({"note_text": ""})

    elif question_type == "section":
        cfg.update({"section_name": ""})

    elif question_type == "import_data":
        cfg.update({"data_file_url": None})

    return cfg


# ---------------------------------------------------------------------------
# Main payload builder
# ---------------------------------------------------------------------------

def build_question_payload(
    *,
    text: str,
    options: Optional[Iterable[Any]] = None,
    question_type: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    question_key: Optional[str] = None,
    order_index: Optional[int] = None,
) -> Dict[str, Any]:
    cfg = deepcopy(config or {})
    raw_options = options if options is not None else cfg.get("options", [])
    labels, option_schema = normalize_option_schema(raw_options)
    qtype = normalize_question_type(question_type, labels, cfg)

    merged = _default_config(qtype, labels, option_schema)
    merged.update(cfg)
    if option_schema:
        merged["options"] = option_schema
    elif "options" not in merged:
        merged["options"] = []
    merged["question_type"] = qtype

    errors = validate_question_config(qtype, text, labels, merged)
    if errors:
        raise ValueError("; ".join(errors))

    return {
        "question_key": question_key or cfg.get("question_key") or generate_id(),
        "question_type": qtype,
        "text": text,
        "options": labels,
        "config": merged,
        "order_index": int(order_index or cfg.get("order_index") or 0),
    }


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

def validate_question_config(
    question_type: str,
    text: str,
    labels: List[str],
    config: Dict[str, Any],
) -> List[str]:
    errors: List[str] = []

    if question_type not in STRUCTURAL_TYPES and not str(text or "").strip():
        errors.append("Question text is required")

    if (
        question_type in OPTION_BASED_TYPES
        and question_type not in {"rating_scale", "matrix_rating", "autosum", "language"}
        and not labels
    ):
        if question_type in {"grid_single_select", "grid_multi_select"} and config.get("columns"):
            pass
        else:
            errors.append(f"{question_type} requires at least one option")

    if question_type == "single_select":
        if int(config.get("max_select") or 1) != 1:
            errors.append("single_select max_select must be 1")

    if question_type == "multi_select":
        min_select = int(config.get("min_select") or 0)
        max_select = int(config.get("max_select") or len(labels) or 0)
        if min_select < 0 or max_select < min_select:
            errors.append("multi_select requires max_select >= min_select")

    if question_type in {"grid_single_select", "grid_multi_select", "matrix_rating"}:
        rows = config.get("rows") or []
        columns = config.get("columns") or config.get("options") or []
        if not isinstance(rows, list):
            errors.append(f"{question_type} rows must be a list")
        if not isinstance(columns, list):
            errors.append(f"{question_type} columns must be a list")

    if question_type in UPLOAD_TYPES:
        max_mb = config.get("max_file_size_mb")
        if max_mb is not None:
            try:
                if float(max_mb) <= 0:
                    errors.append("max_file_size_mb must be positive")
            except (TypeError, ValueError):
                errors.append("max_file_size_mb must be numeric")

    if question_type == "number":
        min_v = config.get("min")
        max_v = config.get("max")
        if min_v is not None and max_v is not None:
            try:
                if float(min_v) > float(max_v):
                    errors.append("number min must be <= max")
            except (TypeError, ValueError):
                pass

    if question_type == "video_player_url":
        url = config.get("url") or ""
        if url and not str(url).startswith(("http://", "https://")):
            errors.append("video_player_url requires a valid http(s) URL")

    return errors


# ---------------------------------------------------------------------------
# Analysis option derivation (simulation/report bucket fallback)
# ---------------------------------------------------------------------------

def analysis_options_for_question(question: Dict[str, Any]) -> List[str]:
    options = question.get("options") or []
    if options:
        labels, _ = normalize_option_schema(options)
        if labels:
            return labels

    config = question.get("config") or {}
    qtype = normalize_question_type(question.get("question_type"), [], config)

    if qtype == "rating_scale":
        scale = config.get("scale") or {}
        labels_list = scale.get("labels")
        if isinstance(labels_list, list) and labels_list:
            return [str(x) for x in labels_list]
        min_v = int(scale.get("min") or 1)
        max_v = int(scale.get("max") or 5)
        if max_v >= min_v and max_v - min_v <= 20:
            return [str(v) for v in range(min_v, max_v + 1)]
        return ["Low", "Medium", "High"]

    if qtype in {"slider", "slider_rating"}:
        scale = config.get("scale") or {}
        min_v = int(scale.get("min") or 0)
        max_v = int(scale.get("max") or 100)
        span = max(max_v - min_v, 1)
        step = max(span // 5, 1)
        buckets = []
        start = min_v
        while start <= max_v:
            end = min(start + step - 1, max_v)
            buckets.append(f"{start}-{end}")
            start = end + 1
        return buckets[:6] or [f"{min_v}-{max_v}"]

    if qtype in {"grid_single_select", "grid_multi_select", "matrix_rating", "autosum"}:
        columns = config.get("columns") or config.get("options") or []
        lbs, _ = normalize_option_schema(columns)
        return lbs or ["Selected", "Not selected"]

    if qtype == "constant_sum":
        return ["Low allocation", "Medium allocation", "High allocation"]

    if qtype in {"ranking", "card_sort"}:
        lbs, _ = normalize_option_schema(config.get("options") or config.get("rankable_items") or [])
        return lbs or ["Ranked first", "Ranked middle", "Ranked last"]

    if qtype == "maxdiff":
        lbs, _ = normalize_option_schema(config.get("attributes") or [])
        return lbs or ["Most important", "Neutral", "Least important"]

    if qtype in {"text", "essay"}:
        return ["Response provided", "No response"]

    if qtype == "number":
        return ["Low", "Medium", "High"]

    if qtype == "date_picker":
        return ["Date provided", "No date"]

    if qtype == "auto_suggest":
        return ["Suggestion selected", "Custom response"]

    if qtype == "star_rating":
        max_stars = int(config.get("max_stars") or 5)
        return [f"{i} star{'s' if i != 1 else ''}" for i in range(1, max_stars + 1)]

    if qtype == "button_rating":
        lbs, _ = normalize_option_schema(config.get("rows") or [])
        return lbs or ["Positive", "Neutral", "Negative"]

    if qtype == "card_rating":
        lbs, _ = normalize_option_schema(config.get("cards") or [])
        return lbs or ["Top rated", "Mid rated", "Low rated"]

    if qtype in UPLOAD_TYPES:
        return ["Asset uploaded", "No asset uploaded"]

    if qtype in STIMULUS_TYPES:
        return ["Viewed", "Skipped"]

    if qtype == "language":
        lbs, _ = normalize_option_schema(config.get("languages") or [])
        return lbs or ["Language selected"]

    if qtype in STRUCTURAL_TYPES:
        return []

    return []


# ---------------------------------------------------------------------------
# Model → dict helpers
# ---------------------------------------------------------------------------

def question_model_to_dict(q: Any) -> Dict[str, Any]:
    config = deepcopy(getattr(q, "config", None) or {})
    labels, option_schema = normalize_option_schema(
        config.get("options") or getattr(q, "options", None) or []
    )
    if not labels:
        labels, option_schema = normalize_option_schema(getattr(q, "options", None) or [])
    if option_schema:
        config["options"] = option_schema

    question_type = normalize_question_type(getattr(q, "question_type", None), labels, config)
    config.setdefault("question_type", question_type)

    return {
        "id": q.id,
        "question_key": getattr(q, "question_key", None) or q.id,
        "question_type": question_type,
        "text": q.text,
        "options": labels,
        "analysis_options": analysis_options_for_question(
            {"question_type": question_type, "options": labels, "config": config}
        ),
        "option_schema": config.get("options", []),
        "config": config,
        "order_index": getattr(q, "order_index", 0) or 0,
    }


def section_model_to_dict(sec: Any, questions: List[Any]) -> Dict[str, Any]:
    return {
        "section_id": sec.id,
        "id": sec.id,
        "title": sec.title,
        "simulation_id": getattr(sec, "simulation_id", None),
        "parent_section_id": getattr(sec, "parent_section_id", None),
        "order_index": getattr(sec, "order_index", 0) or 0,
        "metadata": getattr(sec, "section_metadata", None) or {},
        "questions": [question_model_to_dict(q) for q in questions],
    }


def canonicalize_section_payload(section: Dict[str, Any], section_index: int = 0) -> Dict[str, Any]:
    metadata = deepcopy(section.get("metadata") or {})
    for key in ("section_id", "section_theme", "theme", "description"):
        if section.get(key) is not None:
            metadata.setdefault(key, section.get(key))
    return {
        "title": section.get("title") or section.get("name") or "Untitled Section",
        "parent_section_id": section.get("parent_section_id"),
        "order_index": int(section.get("order_index") or section_index),
        "metadata": metadata,
    }


def get_question_type_catalog() -> Dict[str, Dict[str, Any]]:
    return deepcopy(QUESTION_TYPE_CATALOG)
