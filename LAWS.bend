import Base
import ./verification/train.bend as Train
import ./verification/rush.bend as Rush

# Laws describe the executable Bend functions, not a second model of them.

law train_complete_is_terminal:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  for event: Train.TrainEvent<C, R>
  {Train.train_step(C, R, Train.Train{Train.Complete{}, c, ls, gs, a, k, r}, event) == None{} : Maybe<&2, Train.Train<C, R>>}

law train_revealed_rejects_add:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  for leg: Train.Leg
  {Train.train_step(C, R, Train.Train{Train.Revealed{}, c, ls, gs, a, k, r}, Train.Add{leg}) == None{} : Maybe<&2, Train.Train<C, R>>}

law train_revealed_rejects_submit:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  for draft: +List<Train.Leg>
  for valid: Bool
  for result: R
  {Train.train_step(C, R, Train.Train{Train.Revealed{}, c, ls, gs, a, k, r}, Train.Submit{draft, valid, result}) == None{} : Maybe<&2, Train.Train<C, R>>}

law train_next_resets:
  for -C: Data
  for -R: Data
  for c: C
  for next: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  {Train.train_step(C, R, Train.Train{Train.Planning{}, c, ls, gs, a, k, r}, Train.Next{next}) == Some{Train.Train{Train.Planning{}, next, Nil{}, None{}, None{}, None{}, None{}}} : Maybe<&2, Train.Train<C, R>>}

law train_hint_marks_assisted:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  {Train.train_step(C, R, Train.Train{Train.Planning{}, c, ls, gs, a, k, r}, Train.Hint{}) == Some{Train.Train{Train.Planning{}, c, ls, gs, Some{True{}}, k, r}} : Maybe<&2, Train.Train<C, R>>}

law train_show_marks_skipped:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  for result: R
  {Train.train_step(C, R, Train.Train{Train.Planning{}, c, ls, gs, a, k, r}, Train.Show{result}) == Some{Train.Train{Train.Revealed{}, c, Nil{}, gs, a, Some{True{}}, Some{result}}} : Maybe<&2, Train.Train<C, R>>}

law train_valid_cannot_retry:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  {Train.train_step(C, R, Train.Train{Train.Revealed{}, c, ls, gs, a, k, r}, Train.Retry{True{}}) == None{} : Maybe<&2, Train.Train<C, R>>}

law train_six_guesses_reject_submit:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for g1: +List<Train.Leg>
  for g2: +List<Train.Leg>
  for g3: +List<Train.Leg>
  for g4: +List<Train.Leg>
  for g5: +List<Train.Leg>
  for g6: +List<Train.Leg>
  for rest: +List<+List<Train.Leg>>
  for a: Maybe<&2, Bool>
  for k: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  for draft: +List<Train.Leg>
  for valid: Bool
  for result: R
  {Train.train_step(C, R, Train.Train{Train.Planning{}, c, ls, Some{g1 <> g2 <> g3 <> g4 <> g5 <> g6 <> rest}, a, k, r}, Train.Submit{draft, valid, result}) == None{} : Maybe<&2, Train.Train<C, R>>}

law rush_stale_event_is_ignored:
  for s: Rush.Rush
  for e: Rush.RushEvent
  {Rush.guarded_step(s, e, False{}) == Rush.RushResult{s, Rush.NoChange{}} : Rush.RushResult}

law rush_feedback_rejects_answer:
  for g: Nat
  for clock: Rush.Clock
  for incoming: Nat
  for now: Nat
  for correct: Bool
  {Rush.current_step(Rush.Rush{Rush.Feedback{}, g, clock}, Rush.RushAnswer{incoming, now, correct}) == Rush.RushResult{Rush.Rush{Rush.Feedback{}, g, clock}, Rush.NoChange{}} : Rush.RushResult}

law rush_feedback_rejects_timeout:
  for g: Nat
  for clock: Rush.Clock
  for incoming: Nat
  for now: Nat
  {Rush.current_step(Rush.Rush{Rush.Feedback{}, g, clock}, Rush.RushTimeout{incoming, now}) == Rush.RushResult{Rush.Rush{Rush.Feedback{}, g, clock}, Rush.NoChange{}} : Rush.RushResult}

law rush_paused_rejects_answer:
  for g: Nat
  for remaining: Nat
  for incoming: Nat
  for now: Nat
  for correct: Bool
  {Rush.current_step(Rush.Rush{Rush.Paused{}, g, Rush.Stopped{remaining}}, Rush.RushAnswer{incoming, now, correct}) == Rush.RushResult{Rush.Rush{Rush.Paused{}, g, Rush.Stopped{remaining}}, Rush.NoChange{}} : Rush.RushResult}

law rush_expired_answer_cannot_score:
  for g: Nat
  for clock: Rush.Clock
  for correct: Bool
  {Rush.finish_answer(g, clock, correct, True{}) == Rush.RushResult{Rush.Rush{Rush.Feedback{}, g, clock}, Rush.Finished{False{}, True{}}} : Rush.RushResult}

law rush_resume_preserves_remaining:
  for g: Nat
  for remaining: Nat
  for now: Nat
  {Rush.resume_stopped(g, remaining, now, True{}) == Rush.RushResult{Rush.Rush{Rush.Playing{}, g, Rush.Running{Nat.add(now, remaining)}}, Rush.Resumed{}} : Rush.RushResult}

law rush_hidden_cannot_resume:
  for g: Nat
  for remaining: Nat
  for now: Nat
  {Rush.resume_stopped(g, remaining, now, False{}) == Rush.RushResult{Rush.Rush{Rush.Paused{}, g, Rush.Stopped{remaining}}, Rush.NoChange{}} : Rush.RushResult}

law rush_pause_retains_time:
  for g: Nat
  for deadline: Nat
  for now: Nat
  {Rush.pause_running(g, deadline, now, False{}) == Rush.RushResult{Rush.Rush{Rush.Paused{}, g, Rush.Stopped{Nat.sub(deadline, now)}}, Rush.Suspended{}} : Rush.RushResult}

law rush_rejects_mismatched_generation:
  for phase: Rush.RushPhase
  for g: Nat
  for clock: Rush.Clock
  for event: Rush.RushEvent
  for different: {Nat.is_eq(g, Rush.event_generation(event)) == False{} : Bool}
  {Rush.rush_step(Rush.Rush{phase, g, clock}, event) == Rush.RushResult{Rush.Rush{phase, g, clock}, Rush.NoChange{}} : Rush.RushResult}

law train_skipped_cannot_retry:
  for -C: Data
  for -R: Data
  for c: C
  for ls: +List<Train.Leg>
  for gs: Maybe<&2, +List<+List<Train.Leg>>>
  for a: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  {Train.train_step(C, R, Train.Train{Train.Revealed{}, c, ls, gs, a, Some{True{}}, r}, Train.Retry{False{}}) == None{} : Maybe<&2, Train.Train<C, R>>}

law train_legacy_retry_is_assisted:
  for -C: Data
  for -R: Data
  for c: C
  for head: Train.Leg
  for tail: +List<Train.Leg>
  for a: Maybe<&2, Bool>
  for r: Maybe<&2, R>
  {Train.train_step(C, R, Train.Train{Train.Revealed{}, c, head <> tail, None{}, a, None{}, r}, Train.Retry{False{}}) == Some{Train.Train{Train.Planning{}, c, Train.drop_last(head <> tail), Some{[head <> tail]}, Some{True{}}, None{}, None{}}} : Maybe<&2, Train.Train<C, R>>}
