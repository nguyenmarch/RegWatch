from sqlalchemy.orm import declarative_base

# Shared declarative base for all ORM models.
# The async engine, session factory and get_db dependency live in app.core.db.
Base = declarative_base()
