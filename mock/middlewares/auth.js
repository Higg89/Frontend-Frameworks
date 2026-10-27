const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PROTECTED_PREFIXES = ['/todos', '/tasks', '/tags', '/labels', '/users'];
const ACCESS_TTL_MS = 8 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TITLE_MAX_LENGTH = 200;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 72;

function requestPath(req) {
  const raw = (req.originalUrl || req.url || '').split('?')[0];

  if (raw.startsWith('/api/')) {
    return raw.slice(4);
  }

  return raw;
}

function readUsers(req) {
  const db = req?.app?.get('db');

  if (db) {
    const users = db.get('users').value();

    if (Array.isArray(users)) {
      return users.filter((user) => typeof user.id === 'number' && typeof user.name === 'string');
    }
  }

  const dbPath = path.join(__dirname, '..', 'db.json');
  const file = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  if (!Array.isArray(file.users)) {
    return [];
  }

  return file.users.filter((user) => typeof user.id === 'number' && typeof user.name === 'string');
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(payload, secret) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

function verify(token, secret, kind) {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));

    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return null;
    }

    if (
      typeof payload.sub !== 'number' ||
      typeof payload.name !== 'string' ||
      payload.kind !== kind
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function jwtSecret() {
  return (process.env.MOCK_JWT_SECRET || 'dev-mock-secret').trim();
}

function mockPassword() {
  return (process.env.MOCK_PASSWORD || 'demo').trim();
}

function delayRange() {
  const min = Number(process.env.MOCK_DELAY_MIN || 200);
  const max = Number(process.env.MOCK_DELAY_MAX || 1000);
  const low = Number.isFinite(min) ? min : 200;
  const high = Number.isFinite(max) ? max : 1000;

  return { min: Math.min(low, high), max: Math.max(low, high) };
}

function randomDelay() {
  const { min, max } = delayRange();

  return min + Math.floor(Math.random() * (max - min + 1));
}

function applyCors(req, res) {
  const allowed = (process.env.MOCK_CORS_ORIGIN || 'http://localhost:9005')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const origin = req.headers.origin;

  if (typeof origin === 'string' && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mock-Error');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
}

function isProtected(pathname) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function issueSession(user) {
  const secret = jwtSecret();
  const token = sign(
    { sub: user.id, name: user.name, exp: Date.now() + ACCESS_TTL_MS, kind: 'access' },
    secret,
  );
  const refreshToken = sign(
    { sub: user.id, name: user.name, exp: Date.now() + REFRESH_TTL_MS, kind: 'refresh' },
    secret,
  );

  return {
    token,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email || '' },
  };
}

function readCredentials(req) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  return { name, email, password };
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return value.length > 0 && value.length <= 254 && EMAIL_PATTERN.test(value);
}

function fieldError(res, status, message, field, code) {
  res.status(status).json({ message, field, code });
}

function handleLogin(req, res) {
  const { name, email, password } = readCredentials(req);
  const identifier = name || email;
  const user = readUsers(req).find(
    (item) =>
      item.name === identifier ||
      (typeof item.email === 'string' && item.email.toLowerCase() === identifier.toLowerCase()),
  );

  if (!user || password !== mockPassword()) {
    res.status(401).json({ message: 'Неверное имя или пароль', code: 'invalid-credentials' });
    return;
  }

  res.status(200).json(issueSession(user));
}

function handleRegister(req, res) {
  const { name, email, password } = readCredentials(req);

  // Server-side validation repeats the same rules as the client schema.
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    fieldError(res, 422, 'Имя должно быть от 2 до 50 символов', 'name', 'NAME_INVALID');
    return;
  }

  if (!isValidEmail(email)) {
    fieldError(res, 422, 'Введите корректный email', 'email', 'EMAIL_INVALID');
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    fieldError(res, 422, 'Пароль должен быть от 4 до 72 символов', 'password', 'PASSWORD_INVALID');
    return;
  }

  if (password !== mockPassword()) {
    fieldError(res, 400, 'Неверный пароль', 'password', 'PASSWORD_MISMATCH');
    return;
  }

  const db = req.app.get('db');
  const users = db.get('users');
  const existing = users.value().find((item) => item.name === name);

  if (existing) {
    fieldError(res, 409, 'Имя уже занято', 'name', 'NAME_TAKEN');
    return;
  }

  const emailTaken = users
    .value()
    .some((item) => typeof item.email === 'string' && item.email.toLowerCase() === email);

  if (emailTaken) {
    fieldError(res, 409, 'Этот email уже используется', 'email', 'EMAIL_TAKEN');
    return;
  }

  const nextId = users.value().reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1;
  const user = { id: nextId, name, email, settings: { showCreatedAt: true } };

  users.push(user).write();
  res.status(201).json(issueSession(user));
}

function handleCheckEmail(req, res) {
  const requestUrl = new URL(req.originalUrl || req.url || '/', 'http://localhost');
  const email = normalizeEmail(requestUrl.searchParams.get('email'));

  if (!isValidEmail(email)) {
    fieldError(res, 422, 'Введите корректный email', 'email', 'EMAIL_INVALID');
    return;
  }

  const taken = readUsers(req).some(
    (item) => typeof item.email === 'string' && item.email.toLowerCase() === email,
  );

  res.status(200).json({ available: !taken });
}

function handleRefresh(req, res) {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  const payload = verify(refreshToken, jwtSecret(), 'refresh');
  const user = payload ? readUsers(req).find((item) => item.id === payload.sub) : undefined;

  if (!user) {
    res.status(401).json({ message: 'Токен недействителен' });
    return;
  }

  res.status(200).json(issueSession(user));
}

function validateTaskRequest(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
    return false;
  }

  const pathname = requestPath(req);

  if (pathname !== '/tasks' && !/^\/tasks\/[^/]+$/.test(pathname)) {
    return false;
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');

  if (req.method === 'POST' && !hasTitle) {
    fieldError(res, 422, 'Введите название задачи', 'title', 'TITLE_REQUIRED');
    return true;
  }

  if (!hasTitle) {
    return false;
  }

  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';

  if (title.length === 0) {
    fieldError(res, 422, 'Введите название задачи', 'title', 'TITLE_REQUIRED');
    return true;
  }

  if (title.length > TITLE_MAX_LENGTH) {
    fieldError(res, 422, 'Название не длиннее 200 символов', 'title', 'TITLE_TOO_LONG');
    return true;
  }

  req.body.title = title;
  return false;
}

function validateSettingsRequest(req, res) {
  if (req.method !== 'PATCH' || !/^\/users\/[^/]+$/.test(requestPath(req))) {
    return false;
  }

  const settings = req.body?.settings;

  if (settings === undefined) {
    return false;
  }

  if (
    typeof settings !== 'object' ||
    settings === null ||
    typeof settings.showCreatedAt !== 'boolean'
  ) {
    fieldError(res, 422, 'Некорректные настройки', 'form', 'SETTINGS_INVALID');
    return true;
  }

  return false;
}

function handleGuard(req, res, next) {
  const mockStatus = req.get('X-Mock-Error');

  if (typeof mockStatus === 'string' && /^[45]\d\d$/.test(mockStatus)) {
    res.status(Number(mockStatus)).json({ message: 'Имитация ошибки' });
    return;
  }

  const pathname = requestPath(req);

  if (req.method === 'POST' && pathname === '/auth/login') {
    handleLogin(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/auth/register') {
    handleRegister(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/auth/refresh') {
    handleRefresh(req, res);
    return;
  }

  if (req.method === 'GET' && pathname === '/auth/check-email') {
    handleCheckEmail(req, res);
    return;
  }

  if (!isProtected(pathname)) {
    next();
    return;
  }

  const header = req.get('Authorization') || '';
  const match = /^Bearer\s+(\S+)$/.exec(header);

  if (!match) {
    res.status(401).json({ message: 'Требуется токен', code: 'token-required' });
    return;
  }

  const payload = verify(match[1], jwtSecret(), 'access');

  if (!payload) {
    res.status(401).json({ message: 'Токен недействителен', code: 'invalid-token' });
    return;
  }

  if (validateTaskRequest(req, res) || validateSettingsRequest(req, res)) {
    return;
  }

  next();
}

function pipeline(req, res, next) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  setTimeout(() => {
    handleGuard(req, res, next);
  }, randomDelay());
}

module.exports = pipeline;
