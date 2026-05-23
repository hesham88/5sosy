const dict = {
  appName: '5sosy',
  appSub: 'Dein KI-Nachhilfelehrer',
  nav: {
    home: 'Start', subjects: 'Fächer', books: 'Bücher', plan: 'Plan',
    practice: 'Üben', oral: 'Mündlich', progress: 'Fortschritt', settings: 'Einstellungen',
    profile: 'Profil', signOut: 'Abmelden', menu: 'Menü', close: 'Schließen'
  },
  cta: { start: 'Loslegen', next: 'Weiter', back: 'Zurück', save: 'Speichern', finish: 'Fertig', skip: 'Überspringen', signIn: 'Anmelden', signUp: 'Registrieren' },
  auth: {
    title: 'Willkommen bei 5sosy',
    sub: 'Melde dich an, um deinen Plan und deine Lernserie fortzusetzen.',
    google: 'Mit Google fortfahren',
    anon: 'Als Gast fortfahren',
    email: 'E-Mail',
    password: 'Passwort',
    or: 'oder'
  },
  home: {
    greet: 'Hallo Youssef 👋',
    sub: 'Was lernen wir heute?',
    intentPh: 'Sag mir, was du heute lernen möchtest…',
    examples: [
      'Physikprüfung in 48 Stunden',
      'Ich verstehe die Gasgesetze nicht',
      'Geschichte Kapitel 2 wiederholen',
      'Chemie — quantitative Analyse'
    ],
    plan: 'Heutiger Plan',
    planSub: 'Vom Planer aus deinem Ziel erstellt',
    weak: 'Konzepte zum Wiederholen',
    streak: 'Serie',
    streakDay: 'Tage in Folge',
    xp: 'XP',
    next: 'Kommende Prüfungen',
    activity: '5sosy-Aktivität'
  },
  subjects: {
    title: 'Deine Fächer',
    sub: 'Jedes Fach bündelt deine Bücher, Kapitel und schwachen Konzepte',
    mastery: 'Beherrschung',
    chapters: 'Kapitel',
    chaptersDone: 'Kapitel abgeschlossen',
    books: 'Bücher',
    weak: 'Schwache Themen',
    week: 'Min. diese Woche',
    last: 'Letztes Thema',
    drill: 'Übung',
    openBooks: 'Bücher öffnen',
    takeQuiz: 'Quiz starten',
    allSubjects: 'Alle Fächer',
    onlyTrack: 'Nur mein Zweig',
    none: 'Noch keine Fächer — schließe zuerst das Onboarding ab.'
  },
  plan: {
    title: 'Dein Wochenplan',
    sub: 'Vom Planer erzeugt — passt sich an, während du Fortschritte machst',
    today: 'Heute',
    blocks: 'Einheiten',
    total: 'Gesamt',
    done: 'Erledigt',
    remaining: 'Übrig',
    regenerate: 'Plan neu erstellen',
    regenerating: 'Wird erstellt…',
    empty: 'Keine Einheiten an diesem Tag',
    addBlock: 'Einheit hinzufügen',
    daySummary: 'Tageszusammenfassung',
    minutes: 'Min.',
    sessions: 'Einheiten'
  },
  books: {
    title: 'Deine verbundenen Bücher',
    sub: 'Lehrplan des ägyptischen Bildungsministeriums + externe Bücher — in Vertex AI indiziert',
    indexed: 'Indiziert',
    processing: 'Wird verarbeitet',
    queued: 'In Warteschlange',
    chapters: 'Kapitel',
    pages: 'Seiten',
    publisher: 'Verlag',
    year: 'Jahr',
    lastOpened: 'Zuletzt geöffnet',
    selected: 'Buch ausgewählt',
    selectedPlural: 'Bücher ausgewählt',
    selectAll: 'Alle auswählen',
    clear: 'Löschen',
    selectToBegin: 'Wähle ein oder mehrere Bücher, um zu beginnen',
    action: {
      chat: 'Chatten',
      summarize: 'Zusammenfassen',
      explain: 'Erklären — auf Ägyptisch',
      audio: 'Audio-Zusammenfassung',
      quiz: 'Quiz',
      questions: 'Vorgeschlagene Fragen'
    },
    actionSub: {
      chat: 'Stelle beliebige Fragen zu diesen Büchern',
      summarize: 'Kompakte Zusammenfassung der Kernkapitel',
      explain: 'Erklärung im ägyptisch-arabischen Dialekt',
      audio: 'Eine Audio-Erklärung abspielen',
      quiz: 'Schnellcheck mit 5 Fragen',
      questions: 'Häufigste Ministeriumsfragen'
    },
    chatPh: 'Stelle eine Frage zu den ausgewählten Büchern…',
    addBook: 'Neues Buch verbinden',
    filterAll: 'Alle Bücher',
    filterIndexed: 'Nur indizierte',
    workingOn: 'Pädagogik-Agent arbeitet',
    resultReady: 'Ergebnis bereit',
    panelHint: 'Über 5 Agenten verteilt — Pädagogik + Ingestion + Bewertung + AV + Orchestrator',
    goToQuiz: 'Quiz starten'
  }
} as const;

export default dict;
