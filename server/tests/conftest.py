"""Shared pytest fixtures for Annotrieve server tests."""

from __future__ import annotations

import os
from typing import Iterator
from unittest.mock import MagicMock, patch

import pytest

# Settings reads env at import time; set hermetic defaults before importing main.
os.environ.setdefault("DB_NAME", "annotrieve_test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "27017")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASS", "test")
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/0")
os.environ.setdefault("LOCAL_ANNOTATIONS_DIR", "/tmp/annotrieve-test-annotations")
os.environ.setdefault("AUTH_KEY", "test-auth-key")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")
os.environ.setdefault("IP_FINGERPRINT_SECRET", "test-ip-fingerprint-secret")


@pytest.fixture
def app():
    """FastAPI app with DB connect/disconnect patched (no live Mongo)."""
    with (
        patch("main.connect_to_db"),
        patch("main.close_db_connection"),
        patch("main.create_celery", return_value=MagicMock()),
    ):
        from main import create_app

        yield create_app()


@pytest.fixture
def client(app) -> Iterator:
    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def mock_celery_delay():
    """
    Factory: patch `.delay` on a Celery task object.

    Usage:
        def test_x(mock_celery_delay):
            with mock_celery_delay("jobs.taxonomy.export_flattened_taxonomy") as delay:
                ...
                delay.assert_called_once()
    """

    def _factory(task_path: str):
        return patch(f"{task_path}.delay")

    return _factory


@pytest.fixture(scope="session", autouse=True)
def _warm_sort_probe():
    """The GNU-sort probe is cached; run it for real once so tests that fake Popen never consume it."""
    try:
        from jobs.services import annotation as annotation_service

        annotation_service._sort_supports_gnu_options()
    except Exception:  # pragma: no cover - environment without the job deps
        pass
    yield
