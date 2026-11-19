export type Coordinate = [number, number];
export type Game = 'countrot' | 'trackrot' | 'anglerot' | 'temporot' | 'splitrot' | 'train' | 'flags' | 'languages' | 'vocabulary' | RotGame | ExtraGame | 'skyrot' | 'pricerot' | 'skylinerot' | 'zoomrot' | 'orderrot';
export type RotGame = 'maprot' | 'yearrot' | 'borderrot';
export type ExtraGame = 'ladderrot' | 'cluerot' | 'scalerot' | 'swaprot';
export type QuizGame = 'flags' | 'languages' | 'vocabulary';
export type Mode = 'daily' | 'practice';
export interface Station { id: string; name: string; label: string; area: string; lon: number; lat: number }
export interface Pattern { route: string; stations: string[]; seconds: number[]; geometry: Coordinate[]; offsets: number[]; headsign: string }
export interface Walk { from: string; to: string; seconds: number; fareControl?: boolean }
export interface City { slug: string; name: string; country: string; lat: number; lon: number }
export interface WorldCity extends City {feedVersion: string; stations: number; lines: number; source?: string; license?: string; attribution?: string[]; timeModel?: string}
export interface Network {
  metadata: { feedVersion: string; transferSeconds: number; mapName?: string; city?: City; source?: string; model?: string; timeModel?: string; attribution?: string[] };
  stations: Record<string, Station>;
  routes: Record<string, { name: string; color: string; title?: string; system?: string }>;
  patterns: Pattern[];
  walkingConnections?: Walk[];
  retiredChallenges?: Challenge[];
}
export interface Boroughs { type: 'FeatureCollection'; features: { properties?: {kind?: string}; geometry: { coordinates: Coordinate[][][] } }[] }
export interface Challenge { from: string; to: string; fromTitle: string; toTitle: string; fromArea: string; toArea: string; difficulty: 'easy' | 'medium' | 'hard'; daily?: boolean }
export interface DraftLeg { route: string; to?: string }
export interface Ride extends Walk { route: string; stops: number; patternIndex: number; start: number; end: number; walkBefore?: Walk; walkAfter?: Walk }
export interface RoutePath { seconds: number; legs: Ride[] }
export interface RidePoint { route: string; to: string; points: number }
export interface Assessment {
  valid: boolean; legs: Ride[]; optimal: RoutePath | null; draft: DraftLeg[];
  score: number; ceiling: number; points: RidePoint[];
  seconds?: number; estimatedSeconds?: number | null; brokenLeg?: number; error?: string;
  continuation?: DraftLeg | null;
}
export interface TrainState { phase: 'planning' | 'revealed' | 'complete'; challenge: Challenge; legs: DraftLeg[]; guesses?: DraftLeg[][]; assisted?: boolean; skipped?: boolean; result?: Assessment }
export type TrainEvent = { type: 'retry' | 'finish' | 'show-answer' | 'hint' } | { type: 'next'; challenge: Challenge } | { type: 'continue'; route: string } | { type: 'add'; leg: DraftLeg } | { type: 'remove'; index: number } | { type: 'submit'; draft?: DraftLeg[] };
export interface QuizItem { id: string; name: string; samples?: string[]; distractors?: string[]; example?: string }
export interface RankRequest { game: Game; day: string; puzzle: string; answers: JsonValue[] | DraftLeg[][] }
export interface RankResponse { lower: number; tied: number; others: number; score: number }
// Untrusted JSON is kept at the serialization boundary, never used as a domain model.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export interface DailyMessage { type: 'daily-game'; date: string; phase: 'playing' | 'complete' | 'error'; result?: string | null }
export interface RushMessage { type: 'rush-game'; phase: 'ready' | 'answered' | 'error'; correct?: boolean }
