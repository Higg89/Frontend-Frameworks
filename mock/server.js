const path = require('path');
const jsonServer = require('json-server');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const auth = require('./middlewares/auth');
const routes = require('./routes.json');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults({ noCors: true });

server.set('db', router.db);
server.use(middlewares);
server.use(jsonServer.bodyParser);
server.use(auth);
server.use(jsonServer.rewriter(routes));
server.use(router);

const port = Number(process.env.MOCK_PORT || 3001);

server.listen(port, () => {
  console.log(`Mock API http://localhost:${port}`);
});
