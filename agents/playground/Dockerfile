FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY orchestrator_agent ./orchestrator_agent
COPY executor_agent ./executor_agent
COPY onboarding_agent ./onboarding_agent
COPY ingestion_agent ./ingestion_agent
COPY pdf_parser_agent ./pdf_parser_agent
COPY shared ./shared
COPY server.py ./
COPY sync_job_main.py ./

RUN pip install .

ENV PORT=8080
EXPOSE 8080

# Default CMD = the long-lived HTTP service. The Cloud Run Job override is
# `python sync_job_main.py` (see deploy-job.ps1).
CMD ["python", "server.py"]
