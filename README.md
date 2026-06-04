# RegWatch v2

Hybrid Graph-RAG system for legal document retrieval in the Fintech/Banking domain.

**Stack:** React · Vite · FastAPI · MySQL · Qdrant · Neo4j · Gemini · LangGraph · Docker

```
RegWatch/
├── backend/    FastAPI · LangGraph · MySQL · Qdrant · Neo4j
├── frontend/   React · Vite · TypeScript · nginx
└── docker-compose.yml
```

---

## Requirements

- Docker & Docker Compose

---

## Setup

**1. Configure environment**

```bash
cp backend/.env.example backend/.env
```

Fill in your values:

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
curl http://localhost/api/health
```

---

## Running Locally (without Docker)

**Backend**

```bash
cd backend
python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> MySQL, Qdrant, and Neo4j must be running before starting the app.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

> Vite dev server runs on `http://localhost:5173` and proxies `/api` → `localhost:8000`.

---

## Monitoring & Tracking

| What | URL |
|---|---|
| App (production) | <http://localhost> |
| Vite dev server | <http://localhost:5173> |
| Swagger UI (API docs) | <http://localhost:8000/docs> |
| Qdrant dashboard | <http://localhost:6333/dashboard> |
| Neo4j browser | <http://localhost:7474> |
| App logs | `docker compose logs -f app` |
| Frontend logs | `docker compose logs -f frontend` |
| MySQL CLI | `docker compose exec mysql mysql -uroot -ppassword law_db` |

---

## Common Commands

```bash
docker compose up -d --build        # start (build images)
docker compose up -d                # start (use cached images)
docker compose down                 # stop
docker compose down -v              # stop + delete all data volumes
docker compose logs -f app          # live backend logs
docker compose logs -f frontend     # live frontend logs
docker compose restart app          # restart backend only
```
