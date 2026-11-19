import core from './train.mjs';
import { array, list, maybe, optional } from './representation.js';
export const MAX_GUESSES = core.max_guesses();
const phases = { planning: 'Planning', revealed: 'Revealed', complete: 'Complete' };
const hostPhases = { Planning: 'planning', Revealed: 'revealed', Complete: 'complete' };
const legValue = ({ route, to }) => ({ $: 'Leg', route, to: maybe(to) });
const hostLeg = ({ route, to }) => to.$ === 'None' ? { route } : { route, to: to.value };
const legList = (legs) => list(legs.map(legValue));
/** Adapt domain facts to the executable, proved lifecycle. No transition policy lives here. */
export function trainTransition(state, event, router) {
    let input;
    const { from, to } = state.challenge;
    switch (event.type) {
        case 'retry':
            input = { $: 'Retry', valid: !!state.result?.valid };
            break;
        case 'finish':
            input = { $: 'Finish' };
            break;
        case 'next':
            input = { $: 'Next', challenge: event.challenge };
            break;
        case 'show-answer':
            input = { $: 'Show', result: router.grade(from, to, state.guesses ?? []) };
            break;
        case 'hint':
            input = { $: 'Hint' };
            break;
        case 'continue': {
            const guess = state.guesses?.at(-1);
            const assessment = guess ? router.assess(from, to, guess) : undefined;
            input = { $: 'Continue', route: event.route, leg: maybe(assessment?.continuation ? legValue(assessment.continuation) : undefined), prefix: legList(assessment?.legs ?? []) };
            break;
        }
        case 'add':
            input = { $: 'Add', leg: legValue(event.leg) };
            break;
        case 'remove':
            // Nat is a nonnegative integer; reject invalid host numbers before crossing.
            if (!Number.isSafeInteger(event.index) || event.index < 0)
                return state;
            input = { $: 'Remove', index: event.index };
            break;
        case 'submit': {
            const draft = event.draft ?? state.legs;
            if (!Array.isArray(draft))
                return state;
            const assessment = router.assess(from, to, draft);
            input = { $: 'Submit', draft: legList(draft), valid: assessment.valid, result: assessment };
            break;
        }
    }
    const value = {
        $: 'Train', phase: { $: phases[state.phase] }, challenge: state.challenge, legs: legList(state.legs),
        guesses: maybe(state.guesses ? list(state.guesses.map(legList)) : undefined),
        assisted: maybe(state.assisted), skipped: maybe(state.skipped), result: maybe(state.result),
    };
    const changed = core.train_step(value, input);
    if (changed.$ === 'None')
        return state;
    const next = changed.value;
    const result = { phase: hostPhases[next.phase.$], challenge: next.challenge, legs: array(next.legs).map(hostLeg) };
    if (next.guesses.$ === 'Some')
        result.guesses = array(next.guesses.value).map(guess => array(guess).map(hostLeg));
    if (next.assisted.$ === 'Some')
        result.assisted = next.assisted.value;
    if (next.skipped.$ === 'Some')
        result.skipped = next.skipped.value;
    const assessment = optional(next.result);
    if (assessment !== undefined)
        result.result = assessment;
    return result;
}
//# sourceMappingURL=train-state.js.map