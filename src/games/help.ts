const instructions: Record<string,string[]> = {
  countrot: ['Start the round and estimate how many dots flash on screen. Enter your count after they disappear.', 'Five rounds, each worth up to 100 points. Hard practice uses moving dots.'],
  trackrot: ['Watch the ball until it disappears. Tap the field or use the Landing position slider to predict where it reaches the floor.', 'Five rounds, each worth up to 100 points. Hard practice adds wall bounces.'],
  anglerot: ['Use the Rotate line slider to set the requested counterclockwise angle from the right-facing starting line. Arrow keys make small adjustments.', 'Five rounds, each worth up to 100 points. Hard practice includes full turns: 450° means one turn plus 90°.'],
  temporot: ['Listen to four beats, then tap eight more using Tap or Space. Keep sound on.', 'Hard practice asks you to tap halfway between the imagined beats. Scores measure your timing against the reference schedule.'],
  splitrot: ['Measure the requested percentage from the named endpoint. Tap the line or use the Split position slider, then check your answer.', 'Hard practice extends beyond the line. 150% from the left is one and a half line lengths from the left endpoint.'],
  skyrot: ['Identify the city from an overhead photograph. Each missed guess reveals a wider view. You have three guesses per photo.', 'A correct answer earns 100, 65, or 35 points depending on the view and guesses used. Rush gives one guess per photo.'],
  pricerot: ['Guess the listed US supermarket price in dollars, before tax. Check the exact package size, retailer, and recorded date.', 'Five products per set. Your score rewards accuracy; within 20% counts as correct in Rush. Product images are original illustrations.'],
  skylinerot: ['Choose the city shown in the skyline photograph. You have up to three guesses.', 'First guesses earn 100 points, second guesses 65, third guesses 35. Rush gives one guess per photo.'],
  zoomrot: ['Identify an everyday object from a close-up photograph. Wrong guesses reveal a wider view, or use Reveal a wider view for a hint.', 'A correct answer earns 100, 65, or 35 points depending on the view and guesses used. Rush gives one guess per photo.'],
  orderrot: ['Arrange the items from lowest to highest using the up and down buttons, then select Check order.', 'Each correct order earns 100 points. Daily and Practice use four items; Rush uses three.'],
  train: [
    'Find the fastest subway route from A to B.',
    'Tap the trains you would take in order. You don’t need to choose transfer stations.',
    'Select Check route to compare your time with the fastest route. You have six checks.',
  ],
  flags: [
    'Choose the place represented by the flag.',
    'Get one point for each correct answer across five daily questions.',
  ],
  languages: [
    'Read the excerpt and choose the language it’s written in.',
    'Get one point for each correct answer across five daily questions.',
  ],
  vocabulary: [
    'Read the word and choose its meaning.',
    'Get one point for each correct answer across five daily questions. An example sentence appears after each answer.',
  ],
  maprot: [
    'Pin the named city on the map. Tap the map or move the pin with the arrow keys, then select Check pin.',
    'Your score is the total distance you were off across five cities. Lower is better.',
  ],
  yearrot: [
    'Place the event before, between, or after the dated events on the timeline.',
    'Get one point for each correct placement across five daily events.',
  ],
  borderrot: [
    'Search for and add countries that share a land border with the previous country.',
    'Find a shortest route to earn a point. There are five routes in the daily game.',
  ],
  ladderrot: [
    'Change one letter at a time to get from the starting word to the target word. Each step must make a valid four-letter word.',
    'Aim for the fewest moves. Undo the last word to explore another path. After finishing, review a shortest solution.',
  ],
  cluerot: [
    'Guess the answer from the clues. Reveal another clue if you’re stuck.',
    'Aim to solve it with the fewest clues.',
  ],
  scalerot: [
    'Enter your best estimate in the unit shown, then select Check estimate.',
    'Your score is the percentage your estimate was off. Lower is better.',
  ],
  swaprot: [
    'Select a tile, then select a tile beside it to swap the two.',
    'Put the numbers 1 to 7 in order in the fewest swaps.',
  ],
};

const game = (document.body.dataset.game ?? 'train') as keyof typeof instructions;
const anchor = document.querySelector<HTMLElement>('.map-panel, .heading')!;
anchor.insertAdjacentHTML('beforeend', `
  <span class="game-help">
    <button id="help" class="game-icon" type="button" aria-label="How to play" aria-haspopup="dialog">How to play</button>
  </span>
`);
document.body.insertAdjacentHTML('beforeend', `
  <dialog id="help-dialog" class="game-help-dialog" aria-labelledby="help-title">
    <div class="game-help-header">
      <h2 id="help-title">How to play</h2>
      <form method="dialog"><button type="submit">Close</button></form>
    </div>
    ${instructions[game].map(step => `<p>${step}</p>`).join('')}
    ${['skyrot','skylinerot','zoomrot','yearrot'].includes(game) ? '<p class="standalone-only">Practice offers Easy, Standard, and Hard, with separate progress for each level. Daily and Rush use Standard difficulty.</p>' : ''}
    <p class="standalone-only">The daily game resets at midnight in New York. Use Practice to play more.</p>
  </dialog>
`);
document.querySelector<HTMLElement>('#help')!.onclick = () => document.querySelector<HTMLDialogElement>('#help-dialog')!.showModal();

// Progress belongs to the game identity, rather than another row above the puzzle.
export function showGameProgress(progress?: HTMLElement) {
  const heading = document.querySelector<HTMLElement>('.heading');
  if (!heading) return;
  heading.querySelector('.game-progress')?.remove();
  if (progress) {
    progress.classList.add('game-progress');
    heading.append(progress);
  }
}
