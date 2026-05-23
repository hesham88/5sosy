const dict = {
  appName: '5sosy',
  appSub: 'Votre tuteur IA',
  nav: {
    home: 'Accueil', subjects: 'Matières', books: 'Livres', plan: 'Plan',
    practice: 'S’entraîner', oral: 'Oral', progress: 'Progrès', settings: 'Paramètres',
    profile: 'Profil', signOut: 'Se déconnecter', menu: 'Menu', close: 'Fermer'
  },
  cta: { start: 'Commencer', next: 'Suivant', back: 'Retour', save: 'Enregistrer', finish: 'Terminer', skip: 'Passer', signIn: 'Se connecter', signUp: 'S’inscrire' },
  auth: {
    title: 'Bienvenue sur 5sosy',
    sub: 'Connectez-vous pour poursuivre votre plan et votre série d’étude.',
    google: 'Continuer avec Google',
    anon: 'Continuer en invité',
    email: 'E-mail',
    password: 'Mot de passe',
    or: 'ou'
  },
  home: {
    greet: 'Salut Youssef 👋',
    sub: 'Qu’étudions-nous aujourd’hui ?',
    intentPh: 'Dites-moi ce que vous devez étudier aujourd’hui…',
    examples: [
      'Examen de physique dans 48 heures',
      'Je ne comprends pas les lois des gaz',
      'Réviser le chapitre 2 d’histoire',
      'Chimie — analyse quantitative'
    ],
    plan: 'Plan du jour',
    planSub: 'Conçu par le planificateur à partir de votre objectif',
    weak: 'Notions à revoir',
    streak: 'Série',
    streakDay: 'jours d’affilée',
    xp: 'XP',
    next: 'Examens à venir',
    activity: 'Activité 5sosy'
  },
  subjects: {
    title: 'Vos matières',
    sub: 'Chaque matière regroupe vos livres, chapitres et notions à renforcer',
    mastery: 'Maîtrise',
    chapters: 'Chapitres',
    chaptersDone: 'chapitres terminés',
    books: 'Livres',
    weak: 'Notions à renforcer',
    week: 'min cette semaine',
    last: 'Dernier sujet',
    drill: 'Exercice',
    openBooks: 'Ouvrir les livres',
    takeQuiz: 'Passer le quiz',
    allSubjects: 'Toutes les matières',
    onlyTrack: 'Ma filière seulement',
    none: 'Aucune matière pour l’instant — terminez d’abord l’intégration.'
  },
  plan: {
    title: 'Votre plan de la semaine',
    sub: 'Généré par le planificateur — s’adapte au fil de votre progression',
    today: 'Aujourd’hui',
    blocks: 'séances',
    total: 'Total',
    done: 'Fait',
    remaining: 'Restant',
    regenerate: 'Régénérer le plan',
    regenerating: 'Régénération…',
    empty: 'Aucune séance ce jour-là',
    addBlock: 'Ajouter une séance',
    daySummary: 'Résumé du jour',
    minutes: 'min',
    sessions: 'séances'
  },
  books: {
    title: 'Vos livres connectés',
    sub: 'Programme du ministère égyptien + vos livres externes — indexés dans Vertex AI',
    indexed: 'Indexé',
    processing: 'En cours',
    queued: 'En attente',
    chapters: 'chapitres',
    pages: 'pages',
    publisher: 'Éditeur',
    year: 'Année',
    lastOpened: 'Dernière ouverture',
    selected: 'livre sélectionné',
    selectedPlural: 'livres sélectionnés',
    selectAll: 'Tout sélectionner',
    clear: 'Effacer',
    selectToBegin: 'Choisissez un ou plusieurs livres pour commencer',
    action: {
      chat: 'Discuter',
      summarize: 'Résumer',
      explain: 'Expliquer — en égyptien',
      audio: 'Résumé audio',
      quiz: 'Quiz',
      questions: 'Questions suggérées'
    },
    actionSub: {
      chat: 'Posez n’importe quelle question sur ces livres',
      summarize: 'Résumé concis des chapitres clés',
      explain: 'Explication en arabe égyptien familier',
      audio: 'Lire un résumé audio',
      quiz: 'Vérification rapide en 5 questions',
      questions: 'Questions ministérielles les plus posées'
    },
    chatPh: 'Posez une question sur les livres sélectionnés…',
    addBook: 'Connecter un nouveau livre',
    filterAll: 'Tous les livres',
    filterIndexed: 'Indexés uniquement',
    workingOn: 'L’agent pédagogique travaille',
    resultReady: 'Résultat prêt',
    panelHint: 'Acheminé entre 5 agents — Pédagogie + Ingestion + Évaluation + AV + Orchestrateur',
    goToQuiz: 'Lancer le quiz'
  }
} as const;

export default dict;
