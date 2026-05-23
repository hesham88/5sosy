const dict = {
  appName: '5sosy',
  appSub: 'Tu tutor con IA',
  nav: {
    home: 'Inicio', subjects: 'Materias', books: 'Libros', plan: 'Plan',
    practice: 'Practicar', oral: 'Oral', progress: 'Progreso', settings: 'Ajustes',
    profile: 'Perfil', signOut: 'Cerrar sesión', menu: 'Menú', close: 'Cerrar'
  },
  cta: { start: 'Empezar', next: 'Siguiente', back: 'Atrás', save: 'Guardar', finish: 'Finalizar', skip: 'Omitir', signIn: 'Iniciar sesión', signUp: 'Registrarse' },
  auth: {
    title: 'Bienvenido a 5sosy',
    sub: 'Inicia sesión para continuar con tu plan y tu racha de estudio.',
    google: 'Continuar con Google',
    anon: 'Continuar como invitado',
    email: 'Correo electrónico',
    password: 'Contraseña',
    or: 'o'
  },
  home: {
    greet: 'Hola, Youssef 👋',
    sub: '¿Qué vamos a estudiar hoy?',
    intentPh: 'Dime qué necesitas estudiar hoy…',
    examples: [
      'Examen de física en 48 horas',
      'No entiendo las leyes de los gases',
      'Repasar el capítulo 2 de historia',
      'Química — análisis cuantitativo'
    ],
    plan: 'Plan de hoy',
    planSub: 'Creado por el planificador a partir de tu objetivo',
    weak: 'Conceptos para repasar',
    streak: 'Racha',
    streakDay: 'días seguidos',
    xp: 'XP',
    next: 'Próximos exámenes',
    activity: 'Actividad de 5sosy'
  },
  subjects: {
    title: 'Tus materias',
    sub: 'Cada materia agrupa tus libros, capítulos y conceptos a reforzar',
    mastery: 'Dominio',
    chapters: 'Capítulos',
    chaptersDone: 'capítulos terminados',
    books: 'Libros',
    weak: 'Temas a reforzar',
    week: 'min esta semana',
    last: 'Último tema',
    drill: 'Ejercicio',
    openBooks: 'Abrir libros',
    takeQuiz: 'Hacer el quiz',
    allSubjects: 'Todas las materias',
    onlyTrack: 'Solo mi itinerario',
    none: 'Aún no hay materias — completa primero la configuración inicial.'
  },
  plan: {
    title: 'Tu plan semanal',
    sub: 'Generado por el planificador — se adapta a tu progreso',
    today: 'Hoy',
    blocks: 'sesiones',
    total: 'Total',
    done: 'Hecho',
    remaining: 'Restante',
    regenerate: 'Regenerar el plan',
    regenerating: 'Regenerando…',
    empty: 'No hay sesiones este día',
    addBlock: 'Añadir sesión',
    daySummary: 'Resumen del día',
    minutes: 'min',
    sessions: 'sesiones'
  },
  books: {
    title: 'Tus libros conectados',
    sub: 'Plan de estudios del MOE egipcio + tus libros externos — indexados en Vertex AI',
    indexed: 'Indexado',
    processing: 'Procesando',
    queued: 'En cola',
    chapters: 'capítulos',
    pages: 'páginas',
    publisher: 'Editorial',
    year: 'Año',
    lastOpened: 'Última apertura',
    selected: 'libro seleccionado',
    selectedPlural: 'libros seleccionados',
    selectAll: 'Seleccionar todo',
    clear: 'Limpiar',
    selectToBegin: 'Elige uno o más libros para empezar',
    action: {
      chat: 'Conversar',
      summarize: 'Resumir',
      explain: 'Explicar — en egipcio',
      audio: 'Resumen en audio',
      quiz: 'Quiz',
      questions: 'Preguntas sugeridas'
    },
    actionSub: {
      chat: 'Pregunta lo que quieras sobre estos libros',
      summarize: 'Resumen breve de los capítulos clave',
      explain: 'Explicación en árabe egipcio coloquial',
      audio: 'Reproducir un repaso en audio',
      quiz: 'Comprobación rápida de 5 preguntas',
      questions: 'Preguntas ministeriales más frecuentes'
    },
    chatPh: 'Pregunta lo que quieras sobre los libros seleccionados…',
    addBook: 'Conectar un libro nuevo',
    filterAll: 'Todos los libros',
    filterIndexed: 'Solo indexados',
    workingOn: 'El agente pedagógico está trabajando',
    resultReady: 'Resultado listo',
    panelHint: 'Distribuido entre 5 agentes — Pedagogía + Ingesta + Evaluación + AV + Orquestador',
    goToQuiz: 'Empezar el quiz'
  }
} as const;

export default dict;
