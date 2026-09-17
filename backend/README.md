# Synthetic People — Backend

FastAPI service for the Synthetic People platform. The entry point is
`app.main:app`.

**Setup, environment variables, testing and deployment are documented in the
[root README](../README.md).**

## Quick reference

Run everything from `backend/`, since `.env` is loaded from the working directory.

```bash
cp example.env .env                 # then fill in the required values
pip install -r requirements-dev.txt
python -m playwright install chromium
alembic upgrade head
uvicorn app.main:app --reload --port 8000
pytest tests/ -v
```

- Swagger docs: http://localhost:8000/docs
- All settings and their defaults: [app/config.py](app/config.py), with a commented template in [example.env](example.env)
- Migrations: [alembic/README.md](alembic/README.md). Alembic is the schema source of truth.
- Neuroscience layer: [app/neuro/README.md](app/neuro/README.md)
- ML pipeline: [app/ml/README.md](app/ml/README.md)
