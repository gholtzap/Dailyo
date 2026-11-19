import type {Assessment, Challenge} from '../types.js';
import type {List, Maybe} from './representation.js';
export interface LegValue {$: 'Leg'; route: string; to: Maybe<string>}
export interface TrainValue {
  $: 'Train'; phase: {$: 'Planning' | 'Revealed' | 'Complete'}; challenge: Challenge;
  legs: List<LegValue>; guesses: Maybe<List<List<LegValue>>>;
  assisted: Maybe<boolean>; skipped: Maybe<boolean>; result: Maybe<Assessment>;
}
export type TrainEventValue =
  | {$: 'Retry'; valid: boolean} | {$: 'Finish'} | {$: 'Next'; challenge: Challenge}
  | {$: 'Show'; result: Assessment} | {$: 'Hint'}
  | {$: 'Continue'; route: string; leg: Maybe<LegValue>; prefix: List<LegValue>}
  | {$: 'Add'; leg: LegValue} | {$: 'Remove'; index: number}
  | {$: 'Submit'; draft: List<LegValue>; valid: boolean; result: Assessment};
declare const core: {
  max_guesses(): number;
  train_step(state: TrainValue, event: TrainEventValue): Maybe<TrainValue>;
};
export default core;
