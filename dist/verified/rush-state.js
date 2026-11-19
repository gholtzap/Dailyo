import core from './rush.mjs';
import { maybe } from './representation.js';
const phases = { Loading: 'loading', Playing: 'playing', Feedback: 'feedback', Paused: 'paused', Error: 'error', Recap: 'recap' };
// Integer microseconds retain sub-millisecond deadlines without floating-point proofs.
function micros(milliseconds) {
    const value = Math.floor(milliseconds * 1000);
    if (!Number.isSafeInteger(value) || value < 0 || value > 281474976710655)
        throw new RangeError('Invalid monotonic time');
    return value;
}
/** Owns the Bend state; TypeScript supplies clock readings and performs effects. */
export class RushMachine {
    value = { $: 'Rush', phase: { $: 'Recap' }, generation: 0, clock: { $: 'Untimed' } };
    get phase() { return phases[this.value.phase.$]; }
    get generation() { return this.value.generation; }
    get deadline() { return this.value.clock.$ === 'Running' ? this.value.clock.deadline / 1000 : Infinity; }
    send(event) {
        const result = core.rush_step(this.value, event);
        this.value = result.state;
        return result.effect;
    }
    load(generation = this.generation) { return this.send({ $: 'RushLoad', generation }); }
    ready(now, duration, generation = this.generation) {
        return this.send({ $: 'RushReady', generation, now: micros(now), duration: maybe(duration === undefined ? undefined : micros(duration)) });
    }
    fail(generation = this.generation) { return this.send({ $: 'RushFail', generation }); }
    complete() { return this.send({ $: 'RushComplete', generation: this.generation }); }
    answer(correct, now, generation = this.generation) { return this.send({ $: 'RushAnswer', generation, now: micros(now), correct }); }
    timeout(now, generation = this.generation) { return this.send({ $: 'RushTimeout', generation, now: micros(now) }); }
    pause(now) { return this.send({ $: 'RushPause', generation: this.generation, now: micros(now) }); }
    resume(now, visible) { return this.send({ $: 'RushResume', generation: this.generation, now: micros(now), visible }); }
}
//# sourceMappingURL=rush-state.js.map