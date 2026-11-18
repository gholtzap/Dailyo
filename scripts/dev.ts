import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';

const compilerPath = resolve(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin/tsc');
const compiler = spawn(process.execPath, [compilerPath, '-p', 'tsconfig.browser.json', '--watch', '--preserveWatchOutput'], {stdio: 'inherit'});
const server = spawn('python3', ['-m', 'http.server', process.env.PORT ?? '4173', '--bind', '127.0.0.1', '--directory', 'dist'], {stdio: 'inherit'});
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  compiler.kill();
  server.kill();
  process.exitCode = code;
}
for (const child of [compiler, server]) {
  child.on('error', error => {console.error(error.message); stop(1);});
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
