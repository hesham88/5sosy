const dict = {
  appName: '5sosy',
  appSub: 'Il tuo tutor IA',
  nav: {
    home: 'Home', subjects: 'Materie', books: 'Libri', plan: 'Piano',
    practice: 'Esercizi', oral: 'Orale', progress: 'Progressi', settings: 'Impostazioni',
    profile: 'Profilo', signOut: 'Esci', menu: 'Menu', close: 'Chiudi'
  },
  cta: { start: 'Inizia', next: 'Avanti', back: 'Indietro', save: 'Salva', finish: 'Fine', skip: 'Salta', signIn: 'Accedi', signUp: 'Registrati' },
  auth: {
    title: 'Benvenuto in 5sosy',
    sub: 'Accedi per continuare il tuo piano e la tua sequenza di studio.',
    google: 'Continua con Google',
    anon: 'Continua come ospite',
    email: 'E-mail',
    password: 'Password',
    or: 'oppure'
  },
  home: {
    greet: 'Bentornato 👋',
    sub: 'Cosa studiamo oggi?',
    intentPh: 'Dimmi cosa devi studiare oggi…',
    examples: [
      'Esame di fisica fra 48 ore',
      'Non capisco le leggi dei gas',
      'Ripassare il capitolo 2 di storia',
      'Chimica — analisi quantitativa'
    ],
    plan: 'Piano di oggi',
    planSub: 'Creato dal pianificatore a partire dal tuo obiettivo',
    weak: 'Concetti da ripassare',
    streak: 'Serie',
    streakDay: 'giorni di fila',
    xp: 'XP',
    next: 'Esami in arrivo',
    activity: 'Attività di 5sosy'
  },
  subjects: {
    title: 'Le tue materie',
    sub: 'Ogni materia raccoglie i tuoi libri, capitoli e concetti deboli',
    mastery: 'Padronanza',
    chapters: 'Capitoli',
    chaptersDone: 'capitoli completati',
    books: 'Libri',
    weak: 'Argomenti deboli',
    week: 'min questa settimana',
    last: 'Ultimo argomento',
    drill: 'Esercizio',
    openBooks: 'Apri i libri',
    takeQuiz: 'Fai il quiz',
    allSubjects: 'Tutte le materie',
    onlyTrack: 'Solo il mio indirizzo',
    none: 'Ancora nessuna materia — completa prima l’onboarding.'
  },
  plan: {
    title: 'Il tuo piano settimanale',
    sub: 'Generato dal pianificatore — si adatta man mano che procedi',
    today: 'Oggi',
    blocks: 'sessioni',
    total: 'Totale',
    done: 'Fatto',
    remaining: 'Rimanenti',
    regenerate: 'Rigenera il piano',
    regenerating: 'Rigenerazione…',
    empty: 'Nessuna sessione in questo giorno',
    addBlock: 'Aggiungi sessione',
    daySummary: 'Riepilogo del giorno',
    minutes: 'min',
    sessions: 'sessioni'
  },
  books: {
    title: 'I tuoi libri collegati',
    sub: 'Programma del MOE egiziano + i tuoi libri esterni — indicizzati in Vertex AI',
    indexed: 'Indicizzato',
    processing: 'In elaborazione',
    queued: 'In coda',
    chapters: 'capitoli',
    pages: 'pagine',
    publisher: 'Editore',
    year: 'Anno',
    lastOpened: 'Ultima apertura',
    selected: 'libro selezionato',
    selectedPlural: 'libri selezionati',
    selectAll: 'Seleziona tutto',
    clear: 'Pulisci',
    selectToBegin: 'Scegli uno o più libri per iniziare',
    action: {
      chat: 'Chatta',
      summarize: 'Riassumi',
      explain: 'Spiega — in egiziano',
      audio: 'Riepilogo audio',
      quiz: 'Quiz',
      questions: 'Domande suggerite'
    },
    actionSub: {
      chat: 'Chiedi qualsiasi cosa su questi libri',
      summarize: 'Riepilogo essenziale dei capitoli chiave',
      explain: 'Spiegazione in arabo egiziano colloquiale',
      audio: 'Riproduci una spiegazione audio',
      quiz: 'Verifica rapida con 5 domande',
      questions: 'Domande ministeriali più frequenti'
    },
    chatPh: 'Chiedi qualcosa sui libri selezionati…',
    addBook: 'Collega un nuovo libro',
    filterAll: 'Tutti i libri',
    filterIndexed: 'Solo indicizzati',
    workingOn: 'L’agente pedagogico sta lavorando',
    resultReady: 'Risultato pronto',
    panelHint: 'Smistato tra 5 agenti — Pedagogia + Ingestione + Valutazione + AV + Orchestratore',
    goToQuiz: 'Avvia il quiz'
  }
} as const;

export default dict;
