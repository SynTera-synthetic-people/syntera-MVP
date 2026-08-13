"""Marks `tests` as a package so `from tests.conftest import ...` resolves.

Do not delete this file because it looks empty.

Without it, pytest's default "prepend" import mode inserts the test file's own
directory (backend/tests) into sys.path rather than backend/, so `tests` is not
importable as a package and collection fails with:

    ModuleNotFoundError: No module named 'tests'

This surfaces only under the bare `pytest` console script, which is what CI
runs. `python -m pytest` additionally prepends the working directory to
sys.path, which masks the problem locally.

With this file present, pytest walks up from the test module to the first
directory lacking __init__.py — backend/ — and puts that on sys.path instead,
so both invocations behave identically.
"""
