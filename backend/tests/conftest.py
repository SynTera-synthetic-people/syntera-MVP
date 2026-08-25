"""Shared test setup.

app.parameters calls load_ssm_parameters() at import time, which reaches AWS
SSM and raises NoCredentialsError in any environment without AWS credentials.
Tests must not depend on cloud access, so a no-op boto3 stub is installed
before any application module is imported. Installing it here (rather than
changing app.parameters) keeps runtime behaviour untouched.
"""
import sys
import types


def _install_boto3_stub() -> None:
    if "boto3" in sys.modules:
        return

    class _Paginator:
        def paginate(self, *args, **kwargs):
            return []

    class _Client:
        def get_paginator(self, *args, **kwargs):
            return _Paginator()

    stub = types.ModuleType("boto3")
    stub.client = lambda *args, **kwargs: _Client()
    sys.modules["boto3"] = stub


_install_boto3_stub()
