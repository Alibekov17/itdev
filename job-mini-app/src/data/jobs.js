// Тестовые данные. Позже их можно заменить на загрузку с backend (/api/jobs).
export const JOBS = [
  {
    id: 1,
    title: 'Frontend-разработчик (React)',
    company: 'Яндекс',
    salary: 'от 200 000 ₽',
    city: 'Москва',
    remote: true,
    experience: '1–3 года',
    tags: ['React', 'TypeScript', 'Redux'],
    description:
      'Разрабатываем интерфейсы сервисов с миллионами пользователей.\n\nЧто нужно:\n— уверенное знание React и TypeScript;\n— опыт работы с REST/GraphQL;\n— внимание к деталям и качеству кода.',
  },
  {
    id: 2,
    title: 'Backend-разработчик (Node.js)',
    company: 'Ozon',
    salary: 'от 180 000 ₽',
    city: 'Санкт-Петербург',
    remote: false,
    experience: '3–6 лет',
    tags: ['Node.js', 'PostgreSQL', 'Docker'],
    description:
      'Проектируем высоконагруженные сервисы маркетплейса.\n\nЧто нужно:\n— опыт разработки на Node.js от 3 лет;\n— понимание SQL и оптимизации запросов;\n— опыт с Docker и CI/CD.',
  },
  {
    id: 3,
    title: 'Дизайнер интерфейсов',
    company: 'Студия «Пиксель»',
    salary: 'от 120 000 ₽',
    city: 'Удалённо',
    remote: true,
    experience: '1–3 года',
    tags: ['Figma', 'UI/UX', 'Мобильные приложения'],
    description:
      'Ищем дизайнера в продуктовую команду.\n\nЧто нужно:\n— портфолио с мобильными интерфейсами;\n— уверенная работа в Figma;\n— понимание гайдлайнов iOS и Android.',
  },
  {
    id: 4,
    title: 'QA-инженер',
    company: 'Тинькофф',
    salary: 'от 150 000 ₽',
    city: 'Москва',
    remote: false,
    experience: '1–3 года',
    tags: ['Тестирование', 'Postman', 'Автотесты'],
    description:
      'Тестируем банковские продукты и API.\n\nЧто нужно:\n— опыт ручного тестирования;\n— базовые навыки автотестов;\n— умение писать понятные баг-репорты.',
  },
];
