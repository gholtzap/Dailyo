import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

/** Check that the proof gate rejects plausible regressions, not merely valid syntax. */
export function checkProofFailures(bend, env) {
  const mutations = [
    ['seventh guess', 'verification/train.bend', '  6n\n', '  7n\n'],
    ['unmarked hint', 'verification/train.bend', 'guesses, Some{True{}}, skipped, result', 'guesses, Some{False{}}, skipped, result'],
    ['stale round accepted', 'verification/rush.bend', 'Nat.is_eq(generation, event_generation(event))', 'True{}'],
    ['expired answer scores', 'verification/rush.bend', 'Finished{False{}, True{}}', 'Finished{True{}, True{}}'],
    ['pause loses remaining time', 'verification/rush.bend', 'Stopped{Nat.sub(deadline, now)}', 'Stopped{now}'],
    ['missing proof', 'PROOF.bend', 'def Laws.rush_hidden_cannot_resume(g, remaining, now):\n  {==}', ''],
  ];
  for (const [name, file, before, after] of mutations) {
    const root = mkdtempSync(join(tmpdir(), 'dailyo-proof-negative-'));
    try {
      mkdirSync(join(root, 'verification'));
      for (const path of ['LAWS.bend', 'PROOF.bend', 'verification/train.bend', 'verification/rush.bend']) cpSync(path, join(root, path));
      const original = readFileSync(join(root, file), 'utf8');
      if (!original.includes(before)) throw new Error(`Mutation no longer applies: ${name}`);
      writeFileSync(join(root, file), original.replace(before, after));
      const result = spawnSync(bend, [join(root, 'PROOF.bend'), '--verdict'], {env, encoding: 'utf8', timeout: 30_000});
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      if (result.error || result.status === 0 || !output.includes('SOME PROOFS FAIL')) throw new Error(`Proof gate did not reject ${name}: ${output}`);
      console.log(`Proof gate rejected: ${name}`);
    } finally {rmSync(root, {recursive: true, force: true});}
  }
}
