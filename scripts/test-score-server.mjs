import {cpSync, mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';

// Run only with the disposable loopback database used by integration checks.
const database = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)) throw new Error('A loopback test database is required');
process.env.DAILY_SCORE_SECRET = randomBytes(32).toString('hex');
mkdirSync('.test-build/dist/games', {recursive: true});
cpSync('dist/data', '.test-build/dist/data', {recursive: true});
cpSync('dist/games/data', '.test-build/dist/games/data', {recursive: true});
const {default: handler} = await import('../.test-build/api/daily-score.js');
const server = createServer((req, res) => {void handler(req, res);});
server.listen(Number(process.env.PORT ?? 4174), '127.0.0.1', () => console.log('Disposable score API ready'));
