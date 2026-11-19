// Integration risks outside Bend's proofs: host representation, optional fields,
// assessment handoff, and emitted modules used by both the API and browser build.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter, transition} from '../src/router.js';
import type {Challenge, Network, TrainState} from '../src/types.js';

const challenge = {from: '北', to: '終'} as Challenge;
const network = {
  metadata: {transferSeconds: 20},
  stations: {'北': {id: '北'}, '中': {id: '中'}, '終': {id: '終'}},
  patterns: [{route: '線🚇', stations: ['北', '中', '終'], seconds: [40, 40]}],
} as unknown as Network;

test('host values survive a train lifecycle through the shared generated module', () => {
  const router = createRouter(network);
  const initial: TrainState = {phase: 'planning', challenge, legs: []};
  const added = transition(initial, {type: 'add', leg: {route: '線🚇'}}, router);
  assert.deepEqual(added, {...initial, legs: [{route: '線🚇'}]});
  assert.equal(added.challenge, challenge);
  assert.equal(Object.hasOwn(added, 'assisted'), false);
  const finished = transition(added, {type: 'submit'}, router);
  assert.equal(finished.phase, 'revealed');
  assert.equal(finished.result?.score, 100);
  assert.deepEqual(finished.guesses, [[{route: '線🚇'}]]);
  assert.equal(transition(finished, {type: 'submit'}, router), finished);
  const next = transition(finished, {type: 'next', challenge}, router);
  assert.deepEqual(next, initial);
});

test('invalid host indices leave state identity and optional values intact', () => {
  const router = createRouter(network);
  const state: TrainState = {phase: 'planning', challenge, legs: [{route: '線🚇', to: '中'}], assisted: false, guesses: []};
  for (const index of [-1, 0.5, NaN, Infinity]) {
    assert.equal(transition(state, {type: 'remove', index}, router), state);
  }
  assert.deepEqual(transition(state, {type: 'remove', index: 0}, router), {...state, legs: []});
});

test('the Rush host adapter preserves fractional time and rejects stale callbacks', async () => {
  const {RushMachine} = await import('../src/verified/rush-state.js');
  const run = new RushMachine();
  run.load();
  const old = run.generation;
  run.ready(10.125, 8000);
  assert.equal(run.deadline, 8010.125);
  assert.equal(run.pause(110.125).$, 'Suspended');
  assert.equal(run.answer(true, 1000).$, 'NoChange');
  run.resume(20110.125, true);
  assert.equal(run.deadline, 28010.125);
  assert.deepEqual(run.answer(true, 28010.125), {$: 'Finished', correct: false, expired: true});
  assert.equal(run.answer(true, 28011).$, 'NoChange');
  run.load();
  assert.equal(run.ready(0, 1, old).$, 'NoChange');
  assert.equal(run.fail(old).$, 'NoChange');
  assert.equal(run.load(old).$, 'NoChange');
  assert.equal(run.phase, 'loading');
});
