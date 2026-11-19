import type {Maybe} from './representation.js';
export type RushPhase = 'Loading' | 'Playing' | 'Feedback' | 'Paused' | 'Error' | 'Recap';
export type Clock = {$: 'Untimed'} | {$: 'Running'; deadline: number} | {$: 'Stopped'; remaining: number};
export interface RushValue {$: 'Rush'; phase: {$: RushPhase}; generation: number; clock: Clock}
export type RushEvent =
  | {$: 'RushLoad' | 'RushFail' | 'RushComplete'; generation: number}
  | {$: 'RushReady'; generation: number; now: number; duration: Maybe<number>}
  | {$: 'RushAnswer'; generation: number; now: number; correct: boolean}
  | {$: 'RushTimeout' | 'RushPause'; generation: number; now: number}
  | {$: 'RushResume'; generation: number; now: number; visible: boolean};
export type RushEffect = {$: 'NoChange' | 'Loaded' | 'Started' | 'Failed' | 'Suspended' | 'Resumed' | 'Recapped'} | {$: 'Finished'; correct: boolean; expired: boolean};
declare const core: {rush_step(state: RushValue, event: RushEvent): {state: RushValue; effect: RushEffect}};
export default core;
