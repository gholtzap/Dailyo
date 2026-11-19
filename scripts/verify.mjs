import {checkProofFailures} from './check-proof-failures.mjs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {delimiter, join, resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const mode = process.argv[2] ?? '--verify';
if (!['--verify', '--generate', '--check'].includes(mode)) throw new Error('Use --verify, --generate, or --check');
const config = JSON.parse(readFileSync('verification/toolchain.json', 'utf8'));
const platform = `${process.platform}-${process.arch}`;
const modules = ['train', 'rush'];
const inputs = ['LAWS.bend', 'PROOF.bend', 'verification/toolchain.json', ...modules.map(name => `verification/${name}.bend`)];
const outputs = modules.map(name => `src/verified/${name}.mjs`);
const manifestPath = 'verification/generated.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = files => Object.fromEntries(files.map(file => [file, hash(readFileSync(file))]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}):\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return (result.stdout ?? '') + (result.stderr ?? '');
}
async function download(url, destination, expected) {
  const response = await fetch(url, {signal: AbortSignal.timeout(300_000)});
  if (!response.ok) throw new Error(`Toolchain download failed: ${response.status} ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(destination)) digest.update(chunk);
  if (digest.digest('hex') !== expected) {rmSync(destination); throw new Error(`Toolchain checksum mismatch: ${url}`);}
}
async function install(name) {
  const tool = config[name];
  const archive = tool.archives[platform];
  if (!archive) throw new Error(`No pinned ${name} toolchain for ${platform}`);
  const directory = resolve('.cache', name, tool.version, platform);
  const folder = name === 'bend' ? 'bend' : `lean-${tool.version}-${archive.target}`;
  const executable = join(directory, folder, 'bin', name);
  if (existsSync(executable)) return executable;
  mkdirSync(resolve('.cache'), {recursive: true});
  const staging = mkdtempSync(resolve('.cache', `${name}-`));
  try {
    const file = name === 'bend' ? `bend-${tool.version}-${platform}.tar.gz` : `${folder}.tar.zst`;
    const repo = name === 'bend' ? 'bendlang/bend' : 'leanprover/lean4';
    const compressed = join(staging, file);
    console.log(`Installing pinned ${name} ${tool.version} (${platform})`);
    await download(`https://github.com/${repo}/releases/download/v${tool.version}/${file}`, compressed, typeof archive === 'string' ? archive : archive.sha256);
    run('tar', ['-xf', compressed, '-C', staging]);
    rmSync(compressed);
    mkdirSync(resolve(directory, '..'), {recursive: true});
    renameSync(staging, directory);
  } finally {rmSync(staging, {recursive: true, force: true});}
  return executable;
}
function checkManifest() {
  if (!existsSync(manifestPath)) throw new Error('Missing verified artifacts; run npm run verify:generate');
  const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (JSON.stringify(expected) !== JSON.stringify({inputs: hashes(inputs), outputs: hashes(outputs)})) {
    throw new Error('Bend sources, proofs, or generated JavaScript changed. Run npm run verify:generate, then npm run verify.');
  }
}

if (mode === '--check') {
  checkManifest();
  console.log('Verified artifact hashes match sources and proofs. CI independently rechecks proofs and compilation.');
} else {
  const start = performance.now();
  const bend = await install('bend');
  const lean = await install('lean');
  const env = {...process.env, PATH: resolve(lean, '..') + delimiter + process.env.PATH};
  const proofStart = performance.now();
  const verdict = run(bend, ['PROOF.bend', '--verdict'], {env});
  if (!verdict.includes('ALL PROOFS CHECK') || verdict.includes('SOME PROOFS FAIL')) throw new Error(verdict);
  console.log(verdict.trim());
  console.log(`Proof check: ${((performance.now() - proofStart) / 1000).toFixed(3)}s`);
  const temporary = mkdtempSync(join(tmpdir(), 'dailyo-verified-'));
  try {
    for (const name of modules) {
      const output = join(temporary, `${name}.mjs`);
      run(bend, [`verification/${name}.bend`, '-o', output]);
      const bytes = readFileSync(output);
      const destination = `src/verified/${name}.mjs`;
      if (mode === '--generate') writeFileSync(destination, bytes);
      else if (!bytes.equals(readFileSync(destination))) throw new Error(`${destination} differs from pinned compiler output; run npm run verify:generate`);
    }
    if (mode === '--generate') writeFileSync(manifestPath, JSON.stringify({inputs: hashes(inputs), outputs: hashes(outputs)}, null, 2) + '\n');
    checkManifest();
  } finally {rmSync(temporary, {recursive: true, force: true});}
  checkProofFailures(bend, env);
  console.log(`Proofs and generated modules verified in ${((performance.now() - start) / 1000).toFixed(3)}s`);
}
