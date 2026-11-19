import type {JsonValue} from '../types.js';
import {shuffle} from '../daily/puzzles.js';
import type {PracticeDifficulty} from './difficulty.js';

export const visualGames = ['skyrot', 'pricerot', 'skylinerot', 'zoomrot', 'orderrot'] as const;
export type VisualGame = typeof visualGames[number];
export type OrderItem = { id: string; name: string; value: number };
export type VisualItem = {
  id: string; name: string; image?: string; source: string; credit?: string; license?: string;
  explanation?: string; focus?: [number,number]; detailFocus?: [number,number]; distractors?: string[]; lookalikes?: string[]; licenseUrl?: string; size?: string; retailer?: string; currency?: string; captured?: string;
  cents?: number; unit?: string; items?: OrderItem[];
};
export interface VisualQuestion { item: VisualItem; options: Pick<VisualItem, 'id' | 'name'>[]; tiles: OrderItem[] }
export type VisualAnswer = { guesses: string[]; hint: number; price: number | null; order: string[]; skipped: boolean };
export const isVisualGame = (value: string): value is VisualGame => visualGames.some(game => game === value);
export const emptyAnswer = (): VisualAnswer => ({guesses: [], hint: 0, price: null, order: [], skipped: false});
export function prepareVisual(game: VisualGame, value: JsonValue): VisualItem[] {
  if (!Array.isArray(value) || value.length < 5) throw new Error('Not enough puzzles');
  const ids = new Set<string>();
  for (const row of value as VisualItem[]) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id) || !row.name || !row.source?.startsWith('https://')) throw new Error('Invalid puzzle');
    ids.add(row.id);
    if (game === 'pricerot') {
      if (!Number.isSafeInteger(row.cents) || row.cents! <= 0 || !row.size || row.currency !== 'USD' || !row.captured) throw new Error('Invalid price');
    } else if (game === 'orderrot') {
      if (!row.items || row.items.length < 4 || new Set(row.items.map(x=>x.id)).size !== row.items.length || new Set(row.items.map(x=>x.value)).size !== row.items.length || row.items.some(x=>!x.id || !x.name || !Number.isFinite(x.value))) throw new Error('Invalid order');
    } else if (!row.image?.startsWith('/games/media/')) throw new Error('Invalid photo');
    for (const focus of [row.focus, row.detailFocus]) if (focus && (focus.length !== 2 || focus.some(x=>!Number.isFinite(x) || x<0 || x>100))) throw new Error('Invalid crop focus');
    if (row.lookalikes && (row.lookalikes.length !== 3 || new Set(row.lookalikes).size !== 3 || row.lookalikes.some(name=>typeof name!=='string' || !name.trim() || name.toLowerCase()===row.name.toLowerCase()))) throw new Error('Invalid lookalikes');
    if (row.distractors && (row.distractors.length < 3 || new Set(row.distractors).size !== row.distractors.length || row.distractors.some(id=>id===row.id || !(value as VisualItem[]).some(other=>other.id===id)))) throw new Error('Invalid distractors');
  }
  return value as VisualItem[];
}
export function visualSet(game: VisualGame, rows: VisualItem[], seed: string, rush = false, round = 0, difficulty: PracticeDifficulty = 'standard'): VisualQuestion[] {
  const deck = shuffle(rows, `${game}:v1:${seed}`);
  const chosen = rush ? [deck[round % deck.length]!] : deck.slice(0, 5);
  return chosen.map((item, index) => {
    const token = `${seed}:${rush ? round : index}:${item.id}`;
    const others = shuffle(rows.filter(x=>x.id!==item.id), `${token}:others`);
    // Curated alternatives resemble the answer; their order is still seeded.
    const alternatives = difficulty === 'hard' && !rush ? [...others.filter(x=>item.distractors?.includes(x.id)), ...others.filter(x=>!item.distractors?.includes(x.id))] : others;
    const decoys = difficulty === 'hard' && !rush && item.lookalikes ? item.lookalikes.map((name,index)=>({id:`decoy:${item.id}:${index}`, name})) : alternatives.slice(0,3);
    const options = shuffle([item, ...decoys], `${token}:options`);
    let tiles = shuffle(item.items ?? [], `${token}:tiles`).slice(0, rush ? 3 : 4);
    if (tiles.every((tile,i)=>!i || tile.value > tiles[i-1]!.value)) tiles = [...tiles].reverse();
    return {item, options, tiles};
  });
}
export const visualPuzzle = (questions: VisualQuestion[]) => JSON.stringify(questions.map(q=>[q.item.id, q.tiles.map(x=>x.id)]));
export function priceError(cents: number, actual: number) { return Math.abs(cents-actual)/actual; }
export function validAnswer(game: VisualGame, q: VisualQuestion, value: JsonValue): value is VisualAnswer {
  if (!value || typeof value !== 'object') return false;
  const a = value as VisualAnswer;
  if (!Array.isArray(a.guesses) || !Number.isInteger(a.hint) || a.hint < 0 || a.hint > 2 || typeof a.skipped !== 'boolean' || !Array.isArray(a.order)) return false;
  if (game === 'pricerot') return a.guesses.length === 0 && a.order.length === 0 && (a.price === null ? true : Number.isSafeInteger(a.price) && a.price >= 0 && a.price <= 1000000 && !a.skipped);
  if (game === 'orderrot') return a.price === null && a.guesses.length === 0 && (a.order.length === 0 ? true : !a.skipped && a.order.length === q.tiles.length && new Set(a.order).size === a.order.length && a.order.every(id=>q.tiles.some(x=>x.id===id)));
  if (a.price !== null || a.order.length || a.guesses.length > 3 || new Set(a.guesses).size !== a.guesses.length || a.guesses.some(id=>!q.options.some(x=>x.id===id))) return false;
  const correct = a.guesses.indexOf(q.item.id);
  if (correct >= 0 && correct !== a.guesses.length-1) return false;
  return a.hint >= Math.min(2,a.guesses.length-Number(correct>=0)) && !(a.skipped && correct>=0);
}
export function answered(game: VisualGame, q: VisualQuestion, a: VisualAnswer) {
  return a.skipped || (game === 'pricerot' ? a.price !== null : game === 'orderrot' ? a.order.length > 0 : a.guesses.includes(q.item.id) || a.guesses.length === 3);
}
export function answerPoints(game: VisualGame, q: VisualQuestion, a: VisualAnswer) {
  if (a.skipped) return 0;
  if (game === 'pricerot') return a.price === null ? 0 : Math.max(0,Math.round(100*(1-priceError(a.price,q.item.cents!))));
  if (game === 'orderrot') return a.order.length===q.tiles.length && a.order.every((id,i)=>id===[...q.tiles].sort((x,y)=>x.value-y.value)[i]?.id) ? 100 : 0;
  return a.guesses.includes(q.item.id) ? [100,65,35][Math.max(a.hint,a.guesses.length-1)]! : 0;
}
export function rushCorrect(game: VisualGame,q: VisualQuestion,a: VisualAnswer) {
  return !a.skipped && (game === 'pricerot' ? a.price !== null && priceError(a.price,q.item.cents!) <= .200000001 : answerPoints(game,q,a)>0);
}
export function gradeVisual(game: VisualGame, questions: VisualQuestion[], values: JsonValue[]) {
  if (values.length !== questions.length) return;
  let score = 0;
  for (const [index,q] of questions.entries()) {
    const a=values[index];
    if (!validAnswer(game,q,a) || !answered(game,q,a)) return;
    score += answerPoints(game,q,a);
  }
  return score;
}

/** The final view always reveals the whole photograph. */
export function photoScale(game: VisualGame, difficulty: PracticeDifficulty, view: number) {
  const scales = game === 'zoomrot' ? {easy: [2.5, 1.6, 1], standard: [4, 2.2, 1], hard: [8, 4, 1]} :
    game === 'skyrot' ? {easy: [1.6, 1.2, 1], standard: [2.5, 1.6, 1], hard: [5, 2.5, 1]} :
    {easy: [1, 1, 1], standard: [1, 1, 1], hard: [2.4, 1.6, 1]};
  return scales[difficulty][Math.max(0, Math.min(2, view))]!;
}
export const photoPoints = (view: number) => [100, 65, 35][Math.max(0, Math.min(2, view))]!;
