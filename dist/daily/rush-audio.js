// The host owns one sound context for the run. A new iframe must not require
// a new audio permission gesture on every correctly answered rhythm puzzle.
const key = Symbol.for('dailyo.rush.audio');
const owner = () => window.parent;
export function acquireRushAudio() {
    const host = owner();
    if (!host[key] || host[key].state === 'closed')
        host[key] = new host.AudioContext();
    return host[key];
}
export function closeRushAudio() {
    const host = owner(), audio = host[key];
    delete host[key];
    if (audio)
        void audio.close().catch(() => { });
}
//# sourceMappingURL=rush-audio.js.map