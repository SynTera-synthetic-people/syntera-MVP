"""AWS SSM Parameter Store loader.

Imported for its side effect by app/config.py, which must see the parameters in
os.environ before Settings() resolves DATABASE_URL.

Two things this module deliberately does differently from its previous version:

1.  The parameter path comes from the SSM_PATH environment variable instead of
    being hardcoded to "/app/staging/". The Kubernetes manifests have always
    set SSM_PATH, but nothing read it, so a production overlay setting
    SSM_PATH=/app/platform/ would still have loaded the staging parameter
    tree — including staging's DATABASE_URL. A production pod would then have
    connected to the staging database.

2.  Loading is skipped entirely when SSM_PATH is unset. Local development uses
    the .env file and has no AWS credentials, which is why this module kept
    getting commented out by hand. Now local and deployed environments both
    work from the same committed code.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

parameters: dict[str, str] = {}


def load_ssm_parameters(path: str | None = None) -> dict[str, str]:
    """Load every parameter under `path` into os.environ.

    Existing environment variables win: an explicitly-set value should never be
    silently overridden by the parameter store, which is what makes per-pod
    overrides and test fixtures possible.

    Returns the parameters that were loaded, empty when SSM is not in use.
    """
    path = path or os.environ.get("SSM_PATH")
    if not path:
        logger.info("SSM_PATH not set — using local environment/.env configuration")
        return {}

    # Imported lazily so environments without boto3 configured can still start.
    import boto3

    region = os.environ.get("AWS_REGION", "ap-south-1")
    logger.info("loading SSM parameters from %s (region=%s)", path, region)

    ssm = boto3.client("ssm", region_name=region)
    paginator = ssm.get_paginator("get_parameters_by_path")

    for page in paginator.paginate(Path=path, WithDecryption=True, Recursive=True):
        for param in page["Parameters"]:
            parameters[param["Name"]] = param["Value"].strip()

    for key, value in parameters.items():
        env_key = key.split("/")[-1]
        os.environ.setdefault(env_key, value)

    logger.info("loaded %d SSM parameters from %s", len(parameters), path)

    # Log the resolved database host — never the URL, which carries credentials.
    # With migrations now gating deploys, "which database did this touch?" must
    # be answerable from logs alone.
    db = os.environ.get("DATABASE_URL", "")
    if db:
        host = db.split("@")[-1].split("/")[0] if "@" in db else "unknown"
        logger.info(
            "DATABASE_URL host=%s ssl=%s",
            host,
            ("ssl=require" in db) or ("sslmode=require" in db),
        )

    return parameters


load_ssm_parameters()
