"""5sosy deployment orchestrator.

Runs the remaining manual deploy steps for the 5sosy project.
Interactive auth flows (firebase login, gcloud login, git credentials)
will pause and hand off to the terminal user.

Usage:
    python deploy.py            # interactive menu
    python deploy.py all        # run every step
    python deploy.py 1          # run step 1 only
    python deploy.py 1 2 3      # run steps 1, 2, 3
    python deploy.py --list     # list steps
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
WEB = ROOT / "web"
AGENTS = ROOT / "agents"
PROJECT = "khsosy"
REPO = "hesham88/5sosy"

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"


def banner(text: str) -> None:
    line = "=" * (len(text) + 4)
    print(f"\n{BOLD}{line}\n  {text}\n{line}{RESET}")


def info(msg: str) -> None:
    print(f"{YELLOW}>>> {msg}{RESET}")


def ok(msg: str) -> None:
    print(f"{GREEN}OK  {msg}{RESET}")


def err(msg: str) -> None:
    print(f"{RED}ERR {msg}{RESET}")


def run(cmd: str, cwd: Path | None = None, check: bool = True) -> int:
    info(f"{cmd}  (cwd={cwd or ROOT})")
    proc = subprocess.run(cmd, cwd=str(cwd or ROOT), shell=True)
    if check and proc.returncode != 0:
        err(f"Command failed (exit {proc.returncode}): {cmd}")
        sys.exit(proc.returncode)
    return proc.returncode


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def confirm(prompt: str, default_no: bool = True) -> bool:
    suffix = "[y/N]" if default_no else "[Y/n]"
    ans = input(f"\n{prompt} {suffix} ").strip().lower()
    if not ans:
        return not default_no
    return ans.startswith("y")


def pause(msg: str = "Press Enter to continue...") -> None:
    input(f"\n{msg}")


# ----------------------------------------------------------------------------
# Steps
# ----------------------------------------------------------------------------

def step_1_web_install() -> None:
    banner("Step 1: Install web dependencies (npm install)")
    if not WEB.exists():
        err(f"web directory not found at {WEB}")
        sys.exit(1)
    if (WEB / "node_modules").exists():
        ok("node_modules already present — skipping. Delete it to force reinstall.")
        return
    run("npm install", cwd=WEB)


def step_2_dev_smoke() -> None:
    banner("Step 2: Smoke-test the dev server")
    print("Starts `npm run dev` — open http://localhost:3000 in a browser.")
    print("It should redirect to /ar/home. Ctrl+C in the terminal to stop.")
    if not confirm("Start dev server now?"):
        return
    run("npm run dev", cwd=WEB, check=False)


def step_3_git_push() -> None:
    banner("Step 3: Push to GitHub")
    print(f"Target remote: {REPO}")
    print("If credentials aren't cached, git/GitHub will prompt you.")
    # If branch already tracks remote, plain push is fine; -u is idempotent.
    run("git push -u origin main", cwd=ROOT, check=False)


def step_4_firebase_cli() -> None:
    banner("Step 4: Install Firebase CLI")
    if have("firebase"):
        run("firebase --version", check=False)
        ok("firebase CLI already installed.")
        return
    print("Installing firebase-tools globally (may need admin shell on Windows).")
    run("npm install -g firebase-tools")


def step_5_firebase_deploy() -> None:
    banner("Step 5: Firebase login + deploy rules/indexes/storage")
    if not have("firebase"):
        err("firebase CLI not found. Run step 4 first.")
        sys.exit(1)
    print("`firebase login` opens a browser. If you're already logged in, it'll say so.")
    if confirm("Run firebase login now?", default_no=False):
        run("firebase login", check=False)
    run(f"firebase use {PROJECT}", cwd=WEB, check=False)
    # firebase.json lives under web/
    run(
        f"firebase deploy --only firestore:rules,firestore:indexes,storage --project {PROJECT}",
        cwd=WEB,
    )


def step_6_seed() -> None:
    banner("Step 6: Seed Firestore")
    if not have("gcloud"):
        err("gcloud CLI not installed.")
        print("Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install")
        print("Then re-run: python deploy.py 6")
        return
    print("`gcloud auth application-default login` opens a browser for ADC.")
    if confirm("Run ADC login now?", default_no=False):
        run("gcloud auth application-default login", check=False)
    run("npm run seed", cwd=WEB)


def step_7_app_hosting() -> None:
    banner("Step 7: App Hosting (manual — Firebase Console UI)")
    print("There's no CLI for the GitHub connection step. Do this in the browser:")
    print()
    print("  1. Open https://console.firebase.google.com/project/khsosy/apphosting")
    print("  2. Click 'Add backend'")
    print("  3. Region:     us-central1")
    print(f"  4. Repository: {REPO}")
    print("  5. Branch:     main")
    print("  6. Root:       /web")
    print()
    print("App Hosting will read web/apphosting.yaml and deploy on every push to main.")
    pause("Press Enter once the backend is created (or to skip)...")


def step_8_agents() -> None:
    banner("Step 8: Agents service (Python ADK)")
    if not AGENTS.exists():
        err(f"agents directory not found at {AGENTS}")
        return
    venv = AGENTS / ".venv"
    pip = venv / "Scripts" / "pip.exe"
    python_exe = venv / "Scripts" / "python.exe"

    if not venv.exists():
        info("Creating venv at agents/.venv")
        run(f'"{sys.executable}" -m venv .venv', cwd=AGENTS)

    info("Installing agents package (editable, with dev extras)")
    run(f'"{pip}" install -e ".[dev]"', cwd=AGENTS)

    env_file = AGENTS / ".env"
    example = AGENTS / ".env.example"
    if not env_file.exists() and example.exists():
        shutil.copy(example, env_file)
        ok("Copied .env.example -> .env (edit it before running)")

    print("\nLocal run command (paste in a new terminal):")
    print(f'  cd "{AGENTS}"')
    print(r"  .venv\Scripts\activate")
    print("  uvicorn fivesosy_agents.server:app --reload --port 8080")

    if not have("gcloud"):
        print()
        err("gcloud not installed — skipping Cloud Run deploy.")
        print("Install Google Cloud SDK to deploy: https://cloud.google.com/sdk/docs/install")
        return

    if confirm("Deploy agents to Cloud Run now (gcloud builds submit)?"):
        run(f"gcloud builds submit --config=cloudbuild.yaml --project={PROJECT}", cwd=AGENTS)
        print()
        print("Once deployed, set NEXT_PUBLIC_AGENTS_BASE_URL in App Hosting env vars to the")
        print("Cloud Run URL, then redeploy the web app.")


STEPS: list[tuple[str, callable]] = [
    ("Install web deps (npm install)", step_1_web_install),
    ("Smoke-test dev server (npm run dev)", step_2_dev_smoke),
    ("Push to GitHub (git push -u origin main)", step_3_git_push),
    ("Install Firebase CLI", step_4_firebase_cli),
    ("firebase login + deploy rules/indexes/storage", step_5_firebase_deploy),
    ("Seed Firestore (requires gcloud ADC)", step_6_seed),
    ("App Hosting setup (Firebase Console UI)", step_7_app_hosting),
    ("Agents service (venv install + optional Cloud Run deploy)", step_8_agents),
]


def list_steps() -> None:
    print(f"{BOLD}5sosy deployment steps:{RESET}")
    for i, (name, _) in enumerate(STEPS, 1):
        print(f"  {i}. {name}")


def preflight() -> None:
    banner("Preflight: toolchain check")
    checks = [
        ("node", "Required for web build"),
        ("npm", "Required for web build"),
        ("git", "Required for git push"),
        ("python", "You're already running it"),
        ("firebase", "Step 4 installs it if missing"),
        ("gcloud", "Required for steps 6 and 8 (Cloud Run)"),
    ]
    for cmd, note in checks:
        if have(cmd):
            ok(f"{cmd:10s} found")
        else:
            err(f"{cmd:10s} NOT FOUND — {note}")
    print(f"\nProject: {PROJECT}\nRepo:    {REPO}\nRoot:    {ROOT}")


def interactive_menu() -> None:
    preflight()
    print()
    list_steps()
    print(f"  a. Run ALL")
    print(f"  q. Quit")
    choice = input("\nPick: ").strip().lower()
    if choice in ("q", ""):
        return
    if choice == "a":
        for _, fn in STEPS:
            fn()
        return
    try:
        idx = int(choice) - 1
        if not 0 <= idx < len(STEPS):
            raise ValueError
    except ValueError:
        err("Invalid choice")
        sys.exit(1)
    STEPS[idx][1]()


def main() -> None:
    args = sys.argv[1:]
    if not args:
        interactive_menu()
        return
    if args[0] in ("--list", "-l", "list"):
        list_steps()
        return
    if args[0] in ("--help", "-h", "help"):
        print(__doc__)
        return
    if args[0] == "all":
        preflight()
        for _, fn in STEPS:
            fn()
        return
    # numeric step list
    try:
        indices = [int(a) - 1 for a in args]
    except ValueError:
        err(f"Unknown args: {args}")
        print(__doc__)
        sys.exit(1)
    for idx in indices:
        if not 0 <= idx < len(STEPS):
            err(f"Step {idx + 1} out of range (1..{len(STEPS)})")
            sys.exit(1)
        STEPS[idx][1]()


if __name__ == "__main__":
    main()
