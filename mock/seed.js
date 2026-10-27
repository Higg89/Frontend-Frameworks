const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker/locale/ru');

faker.seed(7);

const users = [
  { id: 1, name: 'Алексей', email: 'alexey@example.com', settings: { showCreatedAt: true } },
  { id: 2, name: 'Мария', email: 'maria@example.com', settings: { showCreatedAt: true } },
  { id: 3, name: 'Иван', email: 'ivan@example.com', settings: { showCreatedAt: false } },
];

const tagNames = ['Учёба', 'Работа', 'Дом', 'Личное'];
const tags = tagNames.map((name, index) => ({ id: index + 1, name }));

const titles = [
  'Подготовить конспект',
  'Купить продукты',
  'Ответить на письмо',
  'Разобрать заметки',
  'Записаться к врачу',
  'Оплатить интернет',
  'Проверить отчёт',
  'Полить цветы',
  'Собрать документы',
];

const todos = titles.map((title, index) => {
  const user = users[index % users.length];
  const tag = faker.helpers.arrayElement(tags);

  return {
    id: index + 1,
    title,
    completed: index % 4 === 0,
    createdAt: faker.date.recent({ days: 20 }).toISOString(),
    userId: user.id,
    tagId: tag.id,
  };
});

const db = { users, todos, tags };
const target = path.join(__dirname, 'db.json');

fs.writeFileSync(target, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Wrote ${todos.length} tasks to ${target}`);
