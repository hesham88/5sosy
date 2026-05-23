from __future__ import annotations

import os
from google.adk.agents.llm_agent import Agent

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

# Define the presenter agent
presenter_agent = Agent(
    model=MODEL,
    name="migration_presenter",
    description="Presenter agent that formats progress details and user console logs during the database migration.",
    instruction="Format status statements, percentages, and logs into clear, readable messages for the web control dashboard."
)

# Define the evaluator agent
evaluator_agent = Agent(
    model=MODEL,
    name="migration_evaluator",
    description="Evaluator agent that validates database integrity and checks document counts between Firestore and MongoDB.",
    instruction="Compare collection counts, sample document keys, and run validation smoke queries to ensure high data fidelity."
)

# Define the executor agent
executor_agent = Agent(
    model=MODEL,
    name="migration_executor",
    description="Executor agent that extracts documents from Firestore and loads them into MongoDB collections.",
    instruction="Perform Firestore document stream reads and MongoDB batch upserts, mapping subcollection paths to flattened collections."
)

# Define the root orchestrator migration agent
root_agent = Agent(
    model=MODEL,
    name="migration_orchestrator",
    description="Orchestrator for the Firestore-to-MongoDB data migration pipeline.",
    instruction="Orchestrate the migration stages: wipe target database if requested, extract and copy data, run evaluation checks, and report details.",
    sub_agents=[executor_agent, evaluator_agent, presenter_agent]
)
