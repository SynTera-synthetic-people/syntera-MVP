"""Model registration utilities.

SQLModel only creates tables for model classes that have been imported into
metadata. Startup migrations must not depend on routers or services importing
models as a side effect, so this module owns the explicit import list.
"""

from importlib import import_module


MODEL_MODULES = (
    "billing",
    "exploration",
    "interview",
    "omi",
    "organization",
    "persona",
    "population",
    "questionnaire",
    "rebuttal",
    "report_cache",
    "research_objectives",
    "survey_simulation",
    "traceability",
    "user",
    "user_settings",
    "workspace",
)


def register_all_models() -> None:
    """Import every SQLModel table module so SQLModel.metadata is complete."""
    for module_name in MODEL_MODULES:
        import_module(f"app.models.{module_name}")
