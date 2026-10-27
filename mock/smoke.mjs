const base = 'http://localhost:3002';
const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:9005' };
const suffix = Date.now().toString(36);
const email = `petr-${suffix}@example.com`;
const name = `Пётр ${suffix}`;

async function call(label, url, options = {}) {
  const started = Date.now();
  const response = await fetch(base + url, options);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const summary =
    body && typeof body === 'object' && !Array.isArray(body)
      ? {
          ...body,
          token: body.token ? 'yes' : undefined,
          refreshToken: body.refreshToken ? 'yes' : undefined,
        }
      : Array.isArray(body)
        ? `items:${body.length}`
        : body;
  console.log(
    label,
    response.status,
    `${Date.now() - started}ms`,
    JSON.stringify(summary).slice(0, 180),
  );
  return body;
}

const login = await call('login', '/api/auth/login', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: 'Алексей', password: 'demo' }),
});
const auth = { ...headers, Authorization: `Bearer ${login.token}` };
await call('login-by-email', '/api/auth/login', {
  method: 'POST',
  headers,
  body: JSON.stringify({ email: 'alexey@example.com', password: 'demo' }),
});
await call('tasks', '/api/users/1/tasks', { headers: auth });
await call('refresh', '/api/auth/refresh', {
  method: 'POST',
  headers,
  body: JSON.stringify({ refreshToken: login.refreshToken }),
});
await call('bad-access', '/api/users/1/tasks', {
  headers: { ...headers, Authorization: 'Bearer nope' },
});

await call('check-email-taken', '/api/auth/check-email?email=alexey@example.com', { headers });
await call('check-email-free', `/api/auth/check-email?email=${encodeURIComponent(email)}`, {
  headers,
});
await call('check-email-invalid', '/api/auth/check-email?email=not-an-email', { headers });

await call('register-invalid-email', '/api/auth/register', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: 'Пётр', email: 'not-an-email', password: 'demo' }),
});
await call('register-short-password', '/api/auth/register', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: 'Пётр', email: `short-${suffix}@example.com`, password: 'x' }),
});
const registered = await call('register', '/api/auth/register', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name, email, password: 'demo' }),
});
await call('register-duplicate-email', '/api/auth/register', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: `Другой ${suffix}`, email, password: 'demo' }),
});
await call('register-duplicate-name', '/api/auth/register', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name, email: `other-${suffix}@example.com`, password: 'demo' }),
});
await call('check-email-now-taken', `/api/auth/check-email?email=${encodeURIComponent(email)}`, {
  headers,
});

const userAuth = { ...headers, Authorization: `Bearer ${registered.token}` };
await call('create-empty-title', '/api/tasks', {
  method: 'POST',
  headers: userAuth,
  body: JSON.stringify({
    title: '   ',
    completed: false,
    createdAt: new Date().toISOString(),
    userId: registered.user.id,
    tagId: 1,
  }),
});
const created = await call('create', '/api/tasks', {
  method: 'POST',
  headers: userAuth,
  body: JSON.stringify({
    title: 'Задача Петра',
    completed: false,
    createdAt: new Date().toISOString(),
    userId: registered.user.id,
    tagId: 1,
  }),
});
await call('profile', `/api/users/${registered.user.id}`, { headers: userAuth });
await call('settings', `/api/users/${registered.user.id}`, {
  method: 'PATCH',
  headers: userAuth,
  body: JSON.stringify({ settings: { showCreatedAt: false } }),
});
await call('settings-invalid', `/api/users/${registered.user.id}`, {
  method: 'PATCH',
  headers: userAuth,
  body: JSON.stringify({ settings: { showCreatedAt: 'yes' } }),
});
await call('delete', `/api/tasks/${created.id}`, {
  method: 'DELETE',
  headers: userAuth,
});
console.log('ids', login.user.id, registered.user.id, created.id);
