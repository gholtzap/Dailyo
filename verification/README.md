# Verified lifecycle rules

The application executes JavaScript compiled from Bend 2. Train transitions are
shared by the browser and score API. Rush receives browser events in TypeScript
and applies its lifecycle rules in Bend. Routing assessment, external inputs,
browser effects, timers, persistence, and Postgres remain integration boundaries.

## Existing behavior to preserve

| State                     | Event                                | Conditions                                                                        | Next state / effect                                                                       |
| ------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Train planning            | Add / remove / continue              | Valid index, available continuation, at most six legs                             | Update draft                                                                              |
| Train planning            | Submit                               | Nonempty draft of at most six legs; fewer than six guesses; different from latest | Move repeated earlier guess to latest, or add guess; reveal on valid route or sixth guess |
| Train planning            | Hint / show answer                   | Always                                                                            | Mark assisted / reveal and mark skipped                                                   |
| Train revealed            | Retry                                | Legacy invalid result, no guesses, nonempty draft, not skipped                    | Planning, assisted, one recorded guess, drop final leg                                    |
| Train revealed            | Finish                               | Always                                                                            | Complete                                                                                  |
| Train planning / revealed | Next                                 | New challenge supplied                                                            | Fresh planning state                                                                      |
| Train revealed / complete | Editing event                        | Never                                                                             | Unchanged                                                                                 |
| Rush any                  | Load                                 | Always                                                                            | Loading                                                                                   |
| Rush page entry / recap   | New run / Play again                 | New run requested                                                                 | Fresh random seed; load opening round                                                     |
| Rush loading / playing    | Retry / preload / next round         | Same run                                                                          | Retain run seed and select by game and round                                              |
| Rush loading              | Ready / fail / complete              | Current round only                                                                | Playing / error / recap                                                                   |
| Rush playing              | Answer / timeout                     | Current round only                                                                | Feedback, at most one result                                                              |
| Rush playing              | Pause                                | Timed round with time remaining                                                   | Paused, remaining time retained                                                           |
| Rush paused               | Resume                               | Page visible                                                                      | Playing, remaining time retained                                                          |
| Any                       | Unsupported / repeated / stale event | Not permitted by state or round                                                   | Unchanged                                                                                 |

The browser schedules Rush feedback completion after 180 ms for a correct
answer and 2.4 seconds for a miss or timeout; Angles uses three seconds for both outcomes. Both automatic and manual
continuation use the answered generation; an earlier timer cannot advance a
new round. Daily mix uses the following host transitions:

| State    | Event                             | Conditions                  | Next state / effect                   |
| -------- | --------------------------------- | --------------------------- | ------------------------------------- |
| Loading  | Child playing                     | Current frame and date      | Playing; preload next game            |
| Loading  | Child complete                    | Current frame and date      | Load next game (already played)       |
| Playing  | Child complete                    | Current frame and date      | Complete; wait for explicit Next game |
| Complete | Child complete                    | Same frame                  | Remain complete                       |
| Complete | Timer / Next game                 | Same frame, index, and date | Load next game or recap; cancel timer |
| Complete | Child playing / error             | Current frame and date      | Playing / error; cancel timer         |
| Any      | Skip / undo / retry / date change | Existing action guards      | Load selected game; cancel timer      |
| Any      | Message from old frame / old date | Never current               | Unchanged                             |

## Static perception readiness

| State     | Event        | Conditions                            | Next state / effect                                            |
| --------- | ------------ | ------------------------------------- | -------------------------------------------------------------- |
| Ready     | Reset / next | Unanswered standalone Angles or Split | Showing, then Answering; render the editable board immediately |
| Answering | Start        | Already active                        | Unchanged; no duplicate round                                  |
| Feedback  | Next         | Final round completed                 | Results                                                        |

## Failure cases

Proofs must cover illegal edits, duplicate submissions, exhausted guesses,
assistance reset, legacy retry exceptions, repeated answers/timeouts, and stale
round events. Integration checks cover TypeScript/Bend representation conversion,
router assessment, actual timer scheduling, iframe identity/origin, storage,
rendering, and database behavior. Existing tests remain until their distinct
risks are covered; no browser or API checks are removed for CI speed.

## Proof scope and trust boundary

`LAWS.bend` contains 23 quantified laws; `PROOF.bend` supplies their proof terms.
Train laws cover the terminal state, revealed edit rejection, fresh-state reset,
hints, answer reveal, retry eligibility/assistance, and rejection at six or more
guesses. Rush laws cover stale generations, feedback/paused answer rejection,
expiry scoring, deadline snapshot grading, and pause/resume time accounting. They are statements about the
functions that generate the application modules.

The TypeScript adapters supply routing assessments and translate domain values to
Bend's constructors and lists. Assessments and challenges are opaque generic
payloads in the train proofs. `tests/verified-boundary.test.ts` checks those host
representations, optional fields, Unicode station/route names, and sub-millisecond
time conversion. The monotonic clock crosses as integer microseconds; each
reading must fit Bend's native immediate Nat range (2^48-1 microseconds).

The compiler, source-to-kernel translation, runtime, host adapters, routing
assessment, and environment remain trusted or tested rather than proved here.
`--verdict` additionally checks proof terms with BendTT's Lean-proved kernel;
it does not prove JavaScript code generation. CI recompiles with a pinned
compiler and compares exact bytes, while behavioral tests exercise the emitted
modules. The six negative checks in `scripts/check-proof-failures.mjs` ensure
that specific rule regressions and an omitted proof make the gate fail.

The existing isolated tests also check generated-code/adapter behavior and
routing or security risks outside these laws. They remain alongside proofs and
end-to-end checks. No Quint model or second rules implementation is maintained.
