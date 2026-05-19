# 5sosy Web App — Prototype Visualization Brief

**Audience:** A design-capable Claude (artifact mode, Claude Code, or design subagent) tasked with producing a high-fidelity, clickable HTML/Tailwind prototype of the 5sosy student web app.

**Deliverable:** A single-page, multi-view interactive prototype (HTML + Tailwind via CDN + minimal JS) that simulates the student experience end-to-end. No real backend — all data hardcoded/simulated like the existing `Challenge Strategy.html` briefing page. Target: laptop-first, but responsive down to mobile.

---

## 1. Product Snapshot (read this first)

**5sosy** (خصوصي — "private tutor" in Egyptian Arabic) is an autonomous study assistant for Egyptian **Thanaweya Amma** (high-school) students preparing for national exams. It ingests Ministry of Education textbooks and orchestrates 5 specialized AI agents (built on Google ADK + Gemini 2.5) to replace the expensive private-tutoring economy (81% of secondary students currently rely on private tutors).

**The student gives a declarative intent** — e.g., *"I have a physics test on thermodynamics in 48 hours and keep failing gas laws"* — and the system produces a personalized study plan, lessons, quizzes, and oral-exam practice.

**The 5 agents (the student should feel these working in the background, not see them as raw labels in most flows):**

1. **Orchestrator & Dynamic Planner** — parses intent, builds the plan
2. **Ingestion & Topology Agent** — converts MOE PDFs into structured knowledge
3. **Pedagogical Analysis Agent** — maps concepts, finds misconceptions
4. **Diagnostic Assessment Agent** — generates adaptive quizzes
5. **Audio-Visual Synthesis Agent** — TTS/STT in Egyptian Arabic accent

---

## 2. Design System (match the existing briefing page)

Inherit the palette and feel from `Challenge Strategy.html` so the app feels continuous with the pitch:

- **Background:** Slate 50 (`#f8fafc`), white panels
- **Primary:** Sky 600 (`#0284c7`) / Sky 700 hover
- **Accent:** Amber 500 (`#f59e0b`) — use sparingly for streaks, urgency, deadlines
- **Text:** Slate 900 headings, Slate 600 body, Slate 400 meta
- **Borders:** Slate 200, soft shadows (`shadow-sm` / `shadow-md`)
- **Radii:** `rounded-xl` for cards, `rounded-lg` for inputs/buttons
- **Type:** Inter for English/Latin, **Cairo** or **Tajawal** (Google Fonts) for Arabic. Load both.
- **Iconography:** Emoji glyphs are acceptable (matches the briefing page) — 🧠 📥 📚 📊 🎤 🔬 ⚙️ 📈 🏆 🔥 ⏱️
- **Motion:** 200ms ease transitions, subtle `translateY(-2px)` on card hover, "typewriter" reveal for agent log lines (already implemented pattern — reuse it)
- **Terminal/log style:** `bg-slate-800` with `text-sky-400` monospace — for any "show the agent thinking" panels

**Localization & direction:** The app is **Arabic-first, RTL by default**, with an English toggle. All layouts must mirror correctly under `dir="rtl"`. Numbers stay LTR. Use logical CSS properties (`ms-`, `me-`, `start-`, `end-`) where possible, or duplicate with RTL-aware classes.

---

## 3. Screens to Build (in this order, all in one HTML file with hash routing or tab switching)

### 3.1 Onboarding / Setup (`#onboarding`)
Three-step wizard:
1. **Grade & track** — radio cards: الصف الأول/الثاني/الثالث الثانوي × علمي علوم / علمي رياضة / أدبي
2. **Subjects** — multi-select chips of subjects relevant to the chosen track (e.g., فيزياء، كيمياء، أحياء، لغة عربية، تاريخ)
3. **Upload or pick textbooks** — drop zone for PDFs + a list of pre-loaded MOE textbooks the student can toggle on. Show a fake "Ingestion Agent" progress card with the typewriter log animation extracting "42 core theorems," embedding to Vertex AI, etc.

CTA: **ابدأ الآن** → routes to Dashboard.

### 3.2 Dashboard / Home (`#home`) — the most important screen
A 3-column layout (collapses to single column on mobile):

- **Left (narrow):** sidebar nav — Home / Subjects / Plan / Practice / Oral / Progress / Settings. Avatar at bottom.
- **Center (wide):** 
  - **Intent input** at top — a large, prominent text field with placeholder *"قولّي إيه اللي محتاج تذاكره النهاردة..."* ("Tell me what you need to study today..."). Below it, 3-4 example chips the student can tap (*"اختبار فيزياء بعد 48 ساعة"*, *"مش فاهم قانون الغازات"*, *"راجع الفصل التاني تاريخ"*).
  - **Today's Plan card** — a vertical timeline of 4-6 study blocks (e.g., 30min: Review Boyle's Law → 15min: Practice quiz → 20min: Watch summary). Each block has subject color, duration, and a play button.
  - **Weak topics** — horizontal scroller of "concept nodes" the Pedagogical Agent has flagged, each with a small red/amber confidence ring.
- **Right (narrow):** 
  - **Streak & XP** card (gamification, Amber accent)
  - **Upcoming exams** countdown list
  - **Agent activity feed** — collapsed by default — small chips showing which agent is currently active ("📊 Assessment Agent updated your gas-laws score").

### 3.3 Study Session (`#session`)
Triggered when student plays a plan block.
- **Top bar:** breadcrumb (Physics → Ch.4 → Boyle's Law), progress bar, pause/exit.
- **Main content:** a "smart lesson" panel — formatted markdown with extracted figures, equations rendered with KaTeX-like styling (`PV = nRT`), and **inline "Explain in Egyptian"** chips that swap a paragraph for a colloquial version.
- **Right rail:** 
  - **Audio summary** player (waveform, Egyptian Arabic TTS) — clickable play button.
  - **"Ask 5sosy"** chat input — short conversational follow-ups.
- **Bottom:** "Take a quick check" CTA → routes to a 3-question mini-quiz.

### 3.4 Diagnostic Quiz (`#quiz`)
One question at a time, large card center-screen.
- Multi-tier questions: MCQ, short answer, "drag-to-order" for procedural concepts.
- Live confidence slider per question ("ايه نسبة تأكدك؟" — 0-100%).
- After submission: an animated **telemetry overlay** mimicking the Assessment Agent log — "Mathematical failure in isolating T in PV=nRT" — then a "what to study next" card.

### 3.5 Mock Oral Exam (`#oral`) — the wow feature
- Full-screen, dark mode aesthetic (`bg-slate-900`).
- Large animated mic orb (CSS animated gradient pulse) in the center.
- Examiner persona card top-left with name + avatar.
- Live transcript stream below the orb (right-aligned Arabic text).
- Sidebar with rubric scores updating in real time: pronunciation, confidence, accuracy, structure — each as a thin progress bar.
- Bottom: "إنهاء الامتحان" red button.

Simulate everything with timers and pre-scripted transcript lines.

### 3.6 Progress Report (`#progress`)
- Heat-map calendar of study days (GitHub-style, Sky shades).
- Per-subject mastery bars.
- "Concept graph" — a simple SVG or HTML node-grid showing mastered (sky), in-progress (amber), and weak (slate) concepts with connecting lines.
- Exportable "Parent summary" card — one-tap PDF download mock.

### 3.7 Settings (`#settings`)
- Language: عربي / English toggle
- TTS accent: Egyptian / MSA
- Notification preferences
- Connected textbooks (re-trigger Ingestion Agent)
- Data & privacy

---

## 4. Required Interactions

- **Hash routing** between the 7 screens (no full reload).
- **Agent telemetry typewriter** — reuse the pattern from `Challenge Strategy.html` lines 410-444. Trigger it on quiz submission, ingestion, and intent parsing.
- **Mic orb pulse** — pure CSS animation, no real getUserMedia call needed.
- **Streak counter** — increments visibly when the student completes a session (small confetti or Amber pulse).
- **RTL/LTR toggle** that actually flips the entire layout live.

---

## 5. Content & Tone

- **Voice:** warm, encouraging, peer-tutor energy — NOT formal MSA. Use **Egyptian colloquial Arabic** in student-facing copy ("يلا بينا", "متقلقش", "تمام كده").
- **Examples must feel Egyptian:** use Egyptian student names (يوسف، فريدة، مريم، أحمد), Egyptian school context (مدرسة, ثانوية عامة, امتحان نصف الترم), EGP for any pricing.
- **Curriculum examples to seed the UI:** Physics Ch.4 (Gas Laws, Boyle's, PV=nRT), Chemistry (التحليل الكمي), Arabic (النصوص الأدبية), History (الحملة الفرنسية).

---

## 6. What NOT to do

- Don't invent new branding — stick to the Sky/Amber/Slate palette from the briefing page.
- Don't show the 5 agents as a literal sidebar to the student (they belong in dev/judge views). Surface them subtly as "activity" chips.
- Don't build a real backend, real auth, or real file upload — everything is simulated client-side.
- Don't use SVG-heavy diagrams or Mermaid (matches the briefing page's stated constraint).
- Don't ship without an RTL pass — Egyptian students will read this right-to-left.

---

## 7. Output Format

A single self-contained `5sosy_Prototype.html` file in this directory, runnable by double-click. Tailwind via CDN, Chart.js via CDN if charts are needed, Cairo/Tajawal + Inter from Google Fonts. Inline `<script>` for routing and animations. Comment-block at the top listing the 7 screens and the hash routes so the user can deep-link during demo.

**Demo path the user will walk a judge through:**
`#onboarding` → `#home` → type intent → `#session` → `#quiz` → `#oral` → `#progress`.

Make that path feel inevitable.
