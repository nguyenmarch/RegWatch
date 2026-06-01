# RegWatch v2

Hybrid Graph-RAG system for legal document retrieval — FastAPI · MySQL · Qdrant · Neo4j · Gemini

---

## Requirements

- Docker & Docker Compose

---

## Setup

**1. Configure environment**

Copy `.env` and fill in your values:

```env
SECRET_KEY=your-secret-key
MYSQL_PASSWORD=password
MYSQL_DATABASE=law_db
NEO4J_PASSWORD=password
GEMINI_API_KEY=your-gemini-api-key
```

**2. Start all services**

```bash
docker compose up --build -d
```

**3. Verify**

```bash
curl http://localhost:8000/health
```

---

## Running Locally (without Docker)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> MySQL, Qdrant, and Neo4j must be running before starting the app.

---

## Monitoring & Tracking

| What | URL |
|---|---|
| Swagger UI (API docs + test) | http://localhost:8000/docs |
| App logs | `docker compose logs -f app` |
| MySQL | `docker compose exec mysql mysql -uroot -ppassword law_db` |
| Qdrant dashboard | http://localhost:6333/dashboard |
| Neo4j browser | http://localhost:7474 |

---

## Common Commands

```bash
docker compose up -d --build     # start
docker compose down              # stop
docker compose down -v           # stop + delete all data
docker compose logs -f app       # live app logs
```
