import os
from unittest.mock import MagicMock, patch

os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings


def test_health_returns_503_when_database_is_down():
    with patch('app.main.SessionLocal', return_value=MagicMock()), patch('app.main.healthcheck', return_value=False):
        response = TestClient(app).get('/api/health')
    assert response.status_code == 503
    assert response.json()['database'] == 'unreachable'
    assert response.headers['x-request-id']


def test_liveness_does_not_require_database():
    with patch('app.main.SessionLocal', side_effect=AssertionError('must not access database')):
        assert TestClient(app).get('/api/health/live').status_code == 200


def test_agent_rejects_missing_internal_token_before_database_use():
    with patch.object(settings, 'internal_api_token', 'a' * 32):
        response = TestClient(app).get('/api/agents/runs')
    assert response.status_code == 401
