import type {Coordinate} from '../types.js';
export type Place = [string, string, number, number];
export type YearEvent = [number, string];
export interface YearQuestion {event: YearEvent; timeline: YearEvent[]}
export interface Country {id: string; name: string; neighbours: string[]}
export type CountryGraph = Map<string, Country>;
export type BorderRow = [string, string, string[]];
export type RotData =
  | {kind: 'maprot'; land: string; items: Place[]}
  | {kind: 'yearrot'; items: YearEvent[]}
  | {kind: 'borderrot'; graph: CountryGraph; items: string[][]};
export type RotQuestion = Place | YearQuestion | string[];
export type RotAnswer = Coordinate | number | string[] | null;
export interface RotState {seed: string; index: number; answers: RotAnswer[]; draft: number[] | string[]}
export interface RotSession {slot?: string; questions: RotQuestion[]; state: RotState}
export type RotAction =
  | {type: 'next' | 'submit' | 'skip' | 'undo'}
  | {type: 'position'; point: number[]}
  | {type: 'place'; slot: number}
  | {type: 'add'; country: string};
export interface BorderGeometry {paths: [string, string][]; anchors: Record<string, Coordinate>}
