import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

/**
 * In-browser demo API used by the GitHub Pages preview.
 *
 * The real application talks to the mock server in /mock through the Vite
 * proxy. A static hosting provider cannot run that server, so this adapter
 * implements the same small API surface on top of localStorage. It is enabled
 * only when VITE_USE_MOCK_API=true and is never used in normal development.
 *
 * Demo accounts: Алексей / Мария / Иван, password "demo".
 */

const STORAGE_KEY = 'todo-app:mock-db';
const ACCESS_PREFIX = 'mock-access-';
const REFRESH_PREFIX = 'mock-refresh-';
const DEMO_PASSWORD = 'demo';
const MAX_TITLE_LENGTH = 200;

interface MockUser {
  id: number;
  name: string;
  email: string;
  password: string;
  settings: { showCreatedAt: boolean };
}

interface MockTodo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
  userId: number;
  tagId: number;
}

interface MockDb {
  users: MockUser[];
  todos: MockTodo[];
  nextUserId: number;
  nextTodoId: number;
}

interface MockSession {
  token: string;
  refreshToken: string;
  user: { id: number; name: string; email: string };
}

interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
  config: InternalAxiosRequestConfig;
}

interface MockResult {
  status: number;
  data: unknown;
}

class MockHttpError extends Error {
  readonly status: number;
  readonly field: string | undefined;
  readonly code: string | undefined;

  constructor(status: number, message: string, options: { field?: string; code?: string } = {}) {
    super(message);
    this.name = 'MockHttpError';
    this.status = status;
    this.field = options.field;
    this.code = options.code;
  }
}

let memoryDb: MockDb | null = null;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function createSeed(): MockDb {
  return {
    users: [
      {
        id: 1,
        name: 'Алексей',
        email: 'alexey@example.com',
        password: DEMO_PASSWORD,
        settings: { showCreatedAt: true },
      },
      {
        id: 2,
        name: 'Мария',
        email: 'maria@example.com',
        password: DEMO_PASSWORD,
        settings: { showCreatedAt: true },
      },
      {
        id: 3,
        name: 'Иван',
        email: 'ivan@example.com',
        password: DEMO_PASSWORD,
        settings: { showCreatedAt: false },
      },
    ],
    todos: [
      {
        id: 1,
        title: 'Подготовить отчёт',
        completed: true,
        createdAt: daysAgo(5),
        userId: 1,
        tagId: 1,
      },
      {
        id: 2,
        title: 'Купить продукты',
        completed: false,
        createdAt: daysAgo(7),
        userId: 2,
        tagId: 4,
      },
      {
        id: 3,
        title: 'Позвонить маме',
        completed: false,
        createdAt: daysAgo(20),
        userId: 3,
        tagId: 2,
      },
      {
        id: 4,
        title: 'Сделать зарядку',
        completed: false,
        createdAt: daysAgo(10),
        userId: 1,
        tagId: 3,
      },
      {
        id: 5,
        title: 'Прочитать статью',
        completed: true,
        createdAt: daysAgo(7),
        userId: 2,
        tagId: 4,
      },
      {
        id: 6,
        title: 'Обновить резюме',
        completed: false,
        createdAt: daysAgo(6),
        userId: 3,
        tagId: 3,
      },
      {
        id: 7,
        title: 'Разобрать почту',
        completed: false,
        createdAt: daysAgo(2),
        userId: 1,
        tagId: 2,
      },
      {
        id: 8,
        title: 'Запланировать отпуск',
        completed: false,
        createdAt: daysAgo(1),
        userId: 1,
        tagId: 1,
      },
    ],
    nextUserId: 4,
    nextTodoId: 9,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMockDb(value: unknown): value is MockDb {
  return (
    isRecord(value) &&
    Array.isArray(value.users) &&
    Array.isArray(value.todos) &&
    typeof value.nextUserId === 'number' &&
    typeof value.nextTodoId === 'number'
  );
}

function saveDb(db: MockDb): void {
  memoryDb = db;

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage can be full or disabled; the in-memory copy still works.
  }
}

function loadDb(): MockDb {
  if (memoryDb !== null) {
    return memoryDb;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);

        if (isMockDb(parsed)) {
          memoryDb = parsed;
          return parsed;
        }
      }
    } catch {
      // Corrupted storage is replaced with a fresh seed.
    }
  }

  const seeded = createSeed();
  saveDb(seeded);
  return seeded;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];

  return typeof value === 'boolean' ? value : undefined;
}

function readHeader(config: InternalAxiosRequestConfig, name: string): string {
  const headers = config.headers;

  if (headers === undefined) {
    return '';
  }

  const value =
    typeof headers.get === 'function'
      ? headers.get(name)
      : (headers as Record<string, unknown>)[name];

  return typeof value === 'string' ? value : '';
}

function parseUrl(
  url: string,
  baseURL: string | undefined,
): { path: string; query: URLSearchParams } {
  const parsed = new URL(url, 'http://mock.local');
  let path = parsed.pathname;
  const prefixes = ['/api'];

  if (baseURL !== undefined && baseURL !== '') {
    try {
      const basePath = new URL(baseURL, 'http://mock.local').pathname;

      if (basePath !== '/' && !prefixes.includes(basePath)) {
        prefixes.unshift(basePath);
      }
    } catch {
      // A malformed baseURL is ignored; /api is still stripped below.
    }
  }

  for (const prefix of prefixes) {
    if (path === prefix) {
      path = '/';
      break;
    }

    if (path.startsWith(`${prefix}/`)) {
      path = path.slice(prefix.length);
      break;
    }
  }

  return { path, query: parsed.searchParams };
}

function parseBody(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(data) ? data : {};
}

function sessionFor(user: MockUser): MockSession {
  return {
    token: `${ACCESS_PREFIX}${user.id}`,
    refreshToken: `${REFRESH_PREFIX}${user.id}`,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

function publicTodo(todo: MockTodo): {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
} {
  return {
    id: todo.id,
    title: todo.title,
    completed: todo.completed,
    createdAt: todo.createdAt,
  };
}

function profile(user: MockUser): {
  id: number;
  name: string;
  email: string;
  settings: { showCreatedAt: boolean };
} {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    settings: { ...user.settings },
  };
}

function authenticatedUserId(config: InternalAxiosRequestConfig): number {
  const header = readHeader(config, 'authorization');
  const token = header.replace(/^Bearer\s+/i, '');
  const match = new RegExp(`^${ACCESS_PREFIX}(\\d+)$`).exec(token);

  if (match === null) {
    throw new MockHttpError(401, 'Требуется войти в аккаунт', { code: 'unauthorized' });
  }

  const userId = Number(match[1]);
  const db = loadDb();

  if (!db.users.some((user) => user.id === userId)) {
    throw new MockHttpError(401, 'Сессия истекла. Войдите снова', {
      code: 'session-expired',
    });
  }

  return userId;
}

function findUserByNameOrEmail(db: MockDb, login: string): MockUser | undefined {
  const normalized = login.toLowerCase();

  return db.users.find(
    (user) => user.name.toLowerCase() === normalized || user.email.toLowerCase() === normalized,
  );
}

function login(request: MockRequest): MockResult {
  const name = readString(request.body, 'name');
  const password = readString(request.body, 'password');
  const db = loadDb();
  const user = findUserByNameOrEmail(db, name);

  if (user === undefined || user.password !== password) {
    throw new MockHttpError(401, 'Неверное имя или пароль', {
      code: 'invalid-credentials',
    });
  }

  return { status: 200, data: sessionFor(user) };
}

function register(request: MockRequest): MockResult {
  const name = readString(request.body, 'name');
  const email = readString(request.body, 'email');
  const password = readString(request.body, 'password');
  const db = loadDb();

  if (name === '') {
    throw new MockHttpError(400, 'Укажите имя', { field: 'name', code: 'name-required' });
  }

  if (!email.includes('@')) {
    throw new MockHttpError(400, 'Укажите корректный email', {
      field: 'email',
      code: 'email-invalid',
    });
  }

  if (password.length < 4) {
    throw new MockHttpError(400, 'Пароль должен быть не короче 4 символов', {
      field: 'password',
      code: 'password-short',
    });
  }

  if (db.users.some((user) => user.name.toLowerCase() === name.toLowerCase())) {
    throw new MockHttpError(409, 'Пользователь с таким именем уже существует', {
      field: 'name',
      code: 'name-taken',
    });
  }

  if (db.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    throw new MockHttpError(409, 'Пользователь с таким email уже существует', {
      field: 'email',
      code: 'email-taken',
    });
  }

  const user: MockUser = {
    id: db.nextUserId,
    name,
    email,
    password,
    settings: { showCreatedAt: true },
  };

  db.users.push(user);
  db.nextUserId += 1;
  saveDb(db);

  return { status: 201, data: sessionFor(user) };
}

function refresh(request: MockRequest): MockResult {
  const token = readString(request.body, 'refreshToken');
  const match = new RegExp(`^${REFRESH_PREFIX}(\\d+)$`).exec(token);
  const db = loadDb();
  const user = match === null ? undefined : db.users.find((item) => item.id === Number(match[1]));

  if (user === undefined) {
    throw new MockHttpError(401, 'Сессия истекла. Войдите снова', {
      code: 'session-expired',
    });
  }

  return { status: 200, data: sessionFor(user) };
}

function checkEmail(request: MockRequest): MockResult {
  const email = (request.query.get('email') ?? '').trim().toLowerCase();
  const db = loadDb();

  return {
    status: 200,
    data: {
      available: email !== '' && !db.users.some((user) => user.email.toLowerCase() === email),
    },
  };
}

function listTasks(request: MockRequest, userId: number): MockResult {
  const match = /^\/users\/(\d+)\/tasks$/.exec(request.path);
  const requestedUserId = match === null ? userId : Number(match[1]);

  if (requestedUserId !== userId) {
    throw new MockHttpError(403, 'Недостаточно прав для этого действия', {
      code: 'forbidden',
    });
  }

  const db = loadDb();

  return {
    status: 200,
    data: db.todos.filter((todo) => todo.userId === userId).map(publicTodo),
  };
}

function createTask(request: MockRequest, userId: number): MockResult {
  const title = readString(request.body, 'title');
  const db = loadDb();

  if (title === '') {
    throw new MockHttpError(400, 'Введите название задачи', {
      field: 'title',
      code: 'title-required',
    });
  }

  if (title.length > MAX_TITLE_LENGTH) {
    throw new MockHttpError(400, 'Название задачи слишком длинное', {
      field: 'title',
      code: 'title-too-long',
    });
  }

  const todo: MockTodo = {
    id: db.nextTodoId,
    title,
    completed: readBoolean(request.body, 'completed') ?? false,
    createdAt: readString(request.body, 'createdAt') || new Date().toISOString(),
    userId,
    tagId: 1,
  };

  db.todos.push(todo);
  db.nextTodoId += 1;
  saveDb(db);

  return { status: 201, data: publicTodo(todo) };
}

function updateTask(request: MockRequest, userId: number): MockResult {
  const match = /^\/tasks\/(\d+)$/.exec(request.path);
  const id = match === null ? Number.NaN : Number(match[1]);
  const db = loadDb();
  const todo = db.todos.find((item) => item.id === id);

  if (todo === undefined) {
    throw new MockHttpError(404, 'Задача не найдена', { code: 'not-found' });
  }

  if (todo.userId !== userId) {
    throw new MockHttpError(403, 'Недостаточно прав для этого действия', {
      code: 'forbidden',
    });
  }

  const title = readString(request.body, 'title');

  if (title !== '') {
    if (title.length > MAX_TITLE_LENGTH) {
      throw new MockHttpError(400, 'Название задачи слишком длинное', {
        field: 'title',
        code: 'title-too-long',
      });
    }

    todo.title = title;
  }

  const completed = readBoolean(request.body, 'completed');

  if (completed !== undefined) {
    todo.completed = completed;
  }

  saveDb(db);

  return { status: 200, data: publicTodo(todo) };
}

function deleteTask(request: MockRequest, userId: number): MockResult {
  const match = /^\/tasks\/(\d+)$/.exec(request.path);
  const id = match === null ? Number.NaN : Number(match[1]);
  const db = loadDb();
  const index = db.todos.findIndex((item) => item.id === id);

  if (index < 0) {
    throw new MockHttpError(404, 'Задача не найдена', { code: 'not-found' });
  }

  const todo = db.todos[index];

  if (todo === undefined || todo.userId !== userId) {
    throw new MockHttpError(403, 'Недостаточно прав для этого действия', {
      code: 'forbidden',
    });
  }

  db.todos.splice(index, 1);
  saveDb(db);

  return { status: 200, data: true };
}

function getUser(request: MockRequest, userId: number): MockResult {
  const match = /^\/users\/(\d+)$/.exec(request.path);
  const requestedUserId = match === null ? userId : Number(match[1]);

  if (requestedUserId !== userId) {
    throw new MockHttpError(403, 'Недостаточно прав для этого действия', {
      code: 'forbidden',
    });
  }

  const db = loadDb();
  const user = db.users.find((item) => item.id === userId);

  if (user === undefined) {
    throw new MockHttpError(404, 'Пользователь не найден', { code: 'not-found' });
  }

  return { status: 200, data: profile(user) };
}

function updateUser(request: MockRequest, userId: number): MockResult {
  const match = /^\/users\/(\d+)$/.exec(request.path);
  const requestedUserId = match === null ? userId : Number(match[1]);

  if (requestedUserId !== userId) {
    throw new MockHttpError(403, 'Недостаточно прав для этого действия', {
      code: 'forbidden',
    });
  }

  const db = loadDb();
  const user = db.users.find((item) => item.id === userId);

  if (user === undefined) {
    throw new MockHttpError(404, 'Пользователь не найден', { code: 'not-found' });
  }

  if (isRecord(request.body.settings)) {
    const showCreatedAt = readBoolean(request.body.settings, 'showCreatedAt');

    if (showCreatedAt !== undefined) {
      user.settings = { showCreatedAt };
      saveDb(db);
    }
  }

  return { status: 200, data: profile(user) };
}

function handle(request: MockRequest): MockResult {
  const { method, path } = request;

  if (method === 'POST' && path === '/auth/login') {
    return login(request);
  }

  if (method === 'POST' && path === '/auth/register') {
    return register(request);
  }

  if (method === 'POST' && path === '/auth/refresh') {
    return refresh(request);
  }

  if (method === 'GET' && path === '/auth/check-email') {
    return checkEmail(request);
  }

  if (method === 'GET' && /^\/users\/\d+\/tasks$/.test(path)) {
    return listTasks(request, authenticatedUserId(request.config));
  }

  if (method === 'POST' && path === '/tasks') {
    return createTask(request, authenticatedUserId(request.config));
  }

  if (method === 'PATCH' && /^\/tasks\/\d+$/.test(path)) {
    return updateTask(request, authenticatedUserId(request.config));
  }

  if (method === 'DELETE' && /^\/tasks\/\d+$/.test(path)) {
    return deleteTask(request, authenticatedUserId(request.config));
  }

  if (method === 'GET' && /^\/users\/\d+$/.test(path)) {
    return getUser(request, authenticatedUserId(request.config));
  }

  if (method === 'PATCH' && /^\/users\/\d+$/.test(path)) {
    return updateUser(request, authenticatedUserId(request.config));
  }

  throw new MockHttpError(404, 'Запрос не найден', { code: 'not-found' });
}

function wait(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new axios.CanceledError());
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new axios.CanceledError());
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function response(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers: new AxiosHeaders({ 'content-type': 'application/json' }),
    config,
    request: {},
  };
}

function httpError(config: InternalAxiosRequestConfig, error: MockHttpError): AxiosError {
  const data = {
    message: error.message,
    ...(error.field === undefined ? {} : { field: error.field }),
    ...(error.code === undefined ? {} : { code: error.code }),
  };
  const axiosResponse = response(config, error.status, data);

  return new AxiosError(
    error.message,
    error.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    config,
    undefined,
    axiosResponse,
  );
}

export function createMockAdapter(): AxiosAdapter {
  return async (config) => {
    const { path, query } = parseUrl(config.url ?? '/', config.baseURL);

    await wait(150 + Math.random() * 150, config.signal as AbortSignal | undefined);

    try {
      const result = handle({
        method: (config.method ?? 'get').toUpperCase(),
        path,
        query,
        body: parseBody(config.data),
        config,
      });

      return response(config, result.status, result.data);
    } catch (cause) {
      if (cause instanceof MockHttpError) {
        throw httpError(config, cause);
      }

      throw cause;
    }
  };
}
