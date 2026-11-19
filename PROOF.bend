import Base
import ./LAWS.bend as Laws
import ./verification/train.bend as Train
import ./verification/rush.bend as Rush

def Laws.train_complete_is_terminal(C, R, c, ls, gs, a, k, r, event):
  match event:
    case Train.Retry{valid}:
      {==}
    case Train.Finish{}:
      {==}
    case Train.Next{next}:
      {==}
    case Train.Show{result}:
      {==}
    case Train.Hint{}:
      {==}
    case Train.Continue{route, leg, prefix}:
      {==}
    case Train.Add{leg}:
      {==}
    case Train.Remove{index}:
      {==}
    case Train.Submit{draft, valid, result}:
      {==}

def Laws.train_revealed_rejects_add(C, R, c, ls, gs, a, k, r, leg):
  {==}

def Laws.train_revealed_rejects_submit(C, R, c, ls, gs, a, k, r, draft, valid, result):
  {==}

def Laws.train_next_resets(C, R, c, next, ls, gs, a, k, r):
  {==}

def Laws.train_hint_marks_assisted(C, R, c, ls, gs, a, k, r):
  {==}

def Laws.train_show_marks_skipped(C, R, c, ls, gs, a, k, r, result):
  {==}

def Laws.train_valid_cannot_retry(C, R, c, ls, gs, a, k, r):
  {==}

def Laws.train_six_guesses_reject_submit(C, R, c, ls, g1, g2, g3, g4, g5, g6, rest, a, k, r, draft, valid, result):
  match rest:
    case Nil{}:
      {==}
    case h <> t:
      {==}

def Laws.rush_stale_event_is_ignored(s, e):
  {==}

def Laws.rush_feedback_rejects_answer(g, clock, incoming, now, correct):
  {==}

def Laws.rush_feedback_rejects_timeout(g, clock, incoming, now):
  {==}

def Laws.rush_paused_rejects_answer(g, remaining, incoming, now, correct):
  {==}

def Laws.rush_expired_answer_cannot_score(g, clock, correct):
  {==}

def Laws.rush_resume_preserves_remaining(g, remaining, now):
  {==}

def Laws.rush_hidden_cannot_resume(g, remaining, now):
  {==}

def Laws.rush_pause_retains_time(g, deadline, now):
  {==}

def Laws.rush_rejects_mismatched_generation(phase, g, clock, event, different):
  %Equal.sym(Bool, Nat.is_eq(g, Rush.event_generation(event)), False{}, different) : {Rush.guarded_step(Rush.Rush{phase, g, clock}, event, _) == Rush.RushResult{Rush.Rush{phase, g, clock}, Rush.NoChange{}} : Rush.RushResult}
  {==}

def Laws.train_skipped_cannot_retry(C, R, c, ls, gs, a, r):
  {==}

def Laws.train_legacy_retry_is_assisted(C, R, c, head, tail, a, r):
  {==}
