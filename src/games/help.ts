import { rushRound } from "../daily/bridge.js";

const instructions: Record<string, string[]> = {
  path: [
    "Draw one path through every square, visiting the numbered checkpoints in order. Start at 1 and finish at 7.",
    "Drag across squares or use the arrow keys to focus a square and Enter to extend the path. Select an earlier square to backtrack.",
  ],
  skyrot: [
    "Identify the city from an overhead photograph. Each missed guess reveals a wider view. You have three guesses per photo.",
    "A correct answer earns 100, 65, or 35 points depending on the view and guesses used. Rush gives one guess per photo.",
  ],
  pricerot: ["Prices are in US dollars, before tax."],
  skylinerot: [
    "Choose the city shown in the skyline photograph. You have up to three guesses.",
    "First guesses earn 100 points, second guesses 65, third guesses 35. Rush gives one guess per photo.",
  ],
  zoomrot: [
    "Identify an everyday object from a close-up photograph. Wrong guesses reveal a wider view, or use Reveal a wider view for a hint.",
    "A correct answer earns 100, 65, or 35 points depending on the view and guesses used. Rush gives one guess per photo.",
  ],
  orderrot: ["Order the items from lowest to highest."],
  train: [
    "Find the fastest subway route from A to B.",
    "Tap the trains you would take in order. You don’t need to choose transfer stations.",
    "You have six checks.",
    "Times use scheduled train travel, four minutes per transfer, and predefined walking links. Other walks, initial waits, and live delays aren’t included.",
  ],
  flags: ["Choose the place represented by the flag."],
  languages: ["Read the excerpt and choose the language it’s written in."],
  vocabulary: ["Read the word and choose its meaning."],
  maprot: [
    "Pin the named city. Drag the map to pan or drag your pin to adjust it. Arrow keys move the pin; hold Shift for finer adjustment.",
    "Your score is the total distance you were off across five cities. Lower is better.",
  ],
  yearrot: [
    "Place the event before, between, or after the dated events on the timeline.",
  ],
  borderrot: [
    "Search for and add countries that share a land border with the previous country.",
    "Find a shortest route to earn a point.",
  ],
  ladderrot: [
    "Change one letter at a time to get from the starting word to the target word. Each step must make a valid four-letter word.",
    "Aim for the fewest moves.",
  ],
  cluerot: [
    "Guess the answer from the clues.",
    "Aim to solve it with the fewest clues.",
  ],
};

const game = (document.body.dataset.game ??
  "train") as keyof typeof instructions;
const rushRules: Record<string, string[]> = {
  train: [
    instructions.train[0],
    instructions.train[1],
    "You have one check. Your route must match the fastest time.",
  ],
  flags: [instructions.flags[0]],
  languages: [instructions.languages[0]],
  vocabulary: [instructions.vocabulary[0]],
  maprot: [instructions.maprot[0], "Place your pin within 500 km."],
  yearrot: [instructions.yearrot[0]],
  borderrot: [
    instructions.borderrot[0],
    "Reach the destination using a shortest route.",
  ],
  ladderrot: [instructions.ladderrot[0]],
  cluerot: [instructions.cluerot[0], "An incorrect guess ends this game."],
  skyrot: [
    "Identify the city from the overhead photograph. You have one guess.",
  ],
  skylinerot: [
    "Identify the city from the skyline photograph. You have one guess.",
  ],
  zoomrot: [
    "Identify the object from the close-up photograph. You have one guess.",
  ],
  pricerot: [instructions.pricerot[0], "Estimate within 20%."],
  orderrot: [instructions.orderrot[0]],
};
const steps =
  rushRound === null
    ? instructions[game]
    : game === "pricerot"
      ? rushRules[game]
      : [...rushRules[game], "A miss or timeout ends this game."];
const anchor = document.querySelector<HTMLElement>(".map-panel, .heading")!;
anchor.insertAdjacentHTML(
  "beforeend",
  `
  <span class="game-help">
    <button id="help" class="game-icon" type="button" aria-label="How to play" aria-haspopup="dialog">How to play</button>
  </span>
`,
);
document.body.insertAdjacentHTML(
  "beforeend",
  `
  <dialog id="help-dialog" class="game-help-dialog" aria-labelledby="help-title">
    <div class="game-help-header">
      <h2 id="help-title">How to play</h2>
      <form method="dialog"><button type="submit">Close</button></form>
    </div>
    ${steps.map((step) => `<p>${step}</p>`).join("")}
    ${game === "pricerot" ? "" : '<p class="standalone-only">The daily game resets at midnight in New York.</p>'}
  </dialog>
`,
);
const dialog = document.querySelector<HTMLDialogElement>("#help-dialog")!;
document.querySelector<HTMLElement>("#help")!.onclick = () => {
  dialog.showModal();
  if (rushRound !== null)
    parent.postMessage({ type: "rush-help", open: true }, location.origin);
};
dialog.addEventListener("close", () => {
  if (rushRound !== null)
    parent.postMessage({ type: "rush-help", open: false }, location.origin);
});

// Progress belongs to the game identity, rather than another row above the puzzle.
export function showGameProgress(progress?: HTMLElement) {
  const heading = document.querySelector<HTMLElement>(".heading");
  if (!heading) return;
  heading.querySelector(".game-progress")?.remove();
  if (progress) {
    progress.classList.add("game-progress");
    heading.append(progress);
  }
}
