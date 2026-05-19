# Cloud Run image for the 5sosy ADK agent service
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# System deps (curl for healthcheck, build-essential for any wheels that need it)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (cache layer)
COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install -e .

# Copy source
COPY src ./src
COPY README.md ./

EXPOSE 8080

# Cloud Run sets $PORT
CMD ["sh", "-c", "uvicorn fivesosy_agents.server:app --host 0.0.0.0 --port ${PORT:-8080}"]
