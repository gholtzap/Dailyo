import { shuffle } from "../../daily/puzzles.js";
export interface WordGroup {
  name: string;
  words: string[];
}
export interface GroupsPuzzle {
  kind: "groups";
  size: 4;
  groups: WordGroup[];
  items: string[];
}
const categories: WordGroup[] = [
  {
    name: "Planets closest to the Sun",
    words: ["MERCURY", "VENUS", "EARTH", "MARS"],
  },
  { name: "Cardinal directions", words: ["NORTH", "EAST", "SOUTH", "WEST"] },
  { name: "Chess pieces", words: ["KING", "QUEEN", "ROOK", "BISHOP"] },
  { name: "Pasta shapes", words: ["PENNE", "FUSILLI", "RIGATONI", "FARFALLE"] },
  { name: "String instruments", words: ["VIOLIN", "VIOLA", "CELLO", "HARP"] },
  {
    name: "Brass instruments",
    words: ["TRUMPET", "TROMBONE", "TUBA", "CORNET"],
  },
  { name: "Parts of a tree", words: ["ROOT", "TRUNK", "BRANCH", "LEAF"] },
  { name: "Parts of a book", words: ["COVER", "SPINE", "PREFACE", "INDEX"] },
  {
    name: "Things in a sewing kit",
    words: ["NEEDLE", "THREAD", "THIMBLE", "PINS"],
  },
  {
    name: "Things used to paint",
    words: ["BRUSH", "EASEL", "PALETTE", "CANVAS"],
  },
  { name: "Types of cloud", words: ["CIRRUS", "CUMULUS", "STRATUS", "NIMBUS"] },
  { name: "Metric prefixes", words: ["KILO", "CENTI", "MILLI", "MICRO"] },
  {
    name: "Olympic swimming strokes",
    words: ["FREESTYLE", "BACKSTROKE", "BREASTSTROKE", "BUTTERFLY"],
  },
  { name: "Pieces of cutlery", words: ["FORK", "KNIFE", "SPOON", "SPORK"] },
  { name: "Citrus fruits", words: ["LEMON", "LIME", "ORANGE", "GRAPEFRUIT"] },
  { name: "Stone fruits", words: ["PEACH", "PLUM", "APRICOT", "CHERRY"] },
  { name: "Types of nut", words: ["ALMOND", "CASHEW", "PECAN", "WALNUT"] },
  { name: "Types of footwear", words: ["BOOT", "SANDAL", "SNEAKER", "LOAFER"] },
  { name: "Fasteners", words: ["BUTTON", "ZIPPER", "BUCKLE", "SNAP"] },
  { name: "Units of time", words: ["SECOND", "MINUTE", "HOUR", "WEEK"] },
  { name: "Units of distance", words: ["INCH", "FOOT", "YARD", "MILE"] },
  {
    name: "Kitchen appliances",
    words: ["TOASTER", "BLENDER", "OVEN", "KETTLE"],
  },
  {
    name: "Common web browsers",
    words: ["CHROME", "FIREFOX", "SAFARI", "EDGE"],
  },
  { name: "Ways to cook an egg", words: ["POACH", "SCRAMBLE", "FRY", "BOIL"] },
  {
    name: "Types of triangle",
    words: ["EQUILATERAL", "ISOSCELES", "SCALENE", "RIGHT"],
  },
  { name: "Types of angle", words: ["ACUTE", "OBTUSE", "REFLEX", "STRAIGHT"] },
  { name: "Classical elements", words: ["AIR", "WATER", "FIRE", "EARTH"] },
  { name: "Things with keys", words: ["PIANO", "KEYBOARD", "LOCK", "MAP"] },
  { name: "Words following snow", words: ["BALL", "FLAKE", "MAN", "STORM"] },
  { name: "Words following book", words: ["CASE", "MARK", "WORM", "SHELF"] },
  { name: "Words preceding house", words: ["LIGHT", "GREEN", "TREE", "BOAT"] },
  { name: "Words following tooth", words: ["BRUSH", "PASTE", "PICK", "ACHE"] },
  { name: "Types of dance", words: ["WALTZ", "TANGO", "SALSA", "BALLET"] },
  {
    name: "Animals in the Chinese zodiac",
    words: ["RAT", "OX", "TIGER", "RABBIT"],
  },
  { name: "Dog breeds", words: ["BEAGLE", "POODLE", "COLLIE", "BOXER"] },
  { name: "Types of hat", words: ["BERET", "FEDORA", "BEANIE", "BOWLER"] },
];
export function makeGroups(seed: string): GroupsPuzzle {
  const groups: WordGroup[] = [];
  const used = new Set<string>();
  for (const group of shuffle(categories, seed)) {
    if (group.words.some((w) => used.has(w))) continue;
    groups.push(group);
    group.words.forEach((w) => used.add(w));
    if (groups.length === 4) break;
  }
  return {
    kind: "groups",
    size: 4,
    groups,
    items: shuffle(
      groups.flatMap((g) => g.words),
      seed + ":tiles",
    ),
  };
}
