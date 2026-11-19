import type {ExtraGame, JsonValue} from '../types.js';
export type LadderRow = [string, string];
export type ClueRow = [string, string[], string[]];
export type ScaleRow = [string, string, string, number, string];
export type ExtraData =
  | {game: 'swaprot'}
  | {game: 'ladderrot'; rows: LadderRow[]; words: Set<string>; buckets: Map<string, string[]>}
  | {game: 'cluerot'; rows: ClueRow[]}
  | {game: 'scalerot'; rows: ScaleRow[]};
export type ExtraPuzzle =
  | {game: 'swaprot'; id: string; board: number[]; minimum: number}
  | {game: 'ladderrot'; id: string; start: string; goal: string; words: Set<string>; solution: string[]}
  | {game: 'cluerot'; id: string; answer: string; aliases: string[]; clues: string[]}
  | {game: 'scalerot'; id: string; prompt: string; unit: string; actual: number; explanation: string};
export type ExtraMove = string | number | null;
export interface ExtraState {
  phase: 'playing' | 'complete'; moves: ExtraMove[]; score: number | null;
  board: number[]; path: string[]; clue: number;
}
export interface ExtraSession {slot?: string; token?: string; puzzle: ExtraPuzzle; state: ExtraState; cycle?: JsonValue}
export interface ExtraSave {token: string; puzzle: string; moves: JsonValue[]; cycle?: JsonValue}
export function isExtraGame(value: string): value is ExtraGame {
  return ['ladderrot', 'cluerot', 'scalerot', 'swaprot'].includes(value);
}
