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
COPY harvester_agent ./harvester_agent
COPY analyzer_agent ./analyzer_agent
COPY pdf_parser_agent ./pdf_parser_agent
COPY migration_agent ./migration_agent
COPY language_detection_agent ./language_detection_agent
COPY translation_agent ./translation_agent
COPY ask_me_agent ./ask_me_agent
COPY shared ./shared
COPY server.py ./
COPY playlist_crawler.py ./
COPY sync_job_main.py ./
COPY harvester_job_main.py ./
COPY analyzer_job_main.py ./
COPY migration_job_main.py ./

RUN pip install .

ENV PORT=8080
EXPOSE 8080

# Default CMD = the long-lived HTTP service. Cloud Run Job overrides:
#   khsosybot-sync          → python sync_job_main.py        (legacy single job)
#   khsosybot-get-books     → python harvester_job_main.py   (new harvester)
#   khsosybot-analyze-books → python analyzer_job_main.py    (new analyzer)
CMD ["python", "server.py"]
