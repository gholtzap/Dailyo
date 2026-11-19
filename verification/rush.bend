import Base

type RushPhase is Data:
  Loading{}
  Playing{}
  Feedback{}
  Paused{}
  Error{}
  Recap{}

type Clock is Data:
  Untimed{}
  Running{deadline: Nat}
  Stopped{remaining: Nat}

type Rush is Data:
  Rush{phase: RushPhase, generation: Nat, clock: Clock}

type RushEvent is Data:
  RushLoad{generation: Nat}
  RushReady{generation: Nat, now: Nat, duration: Maybe<&2, Nat>}
  RushFail{generation: Nat}
  RushAnswer{generation: Nat, now: Nat, correct: Bool}
  RushTimeout{generation: Nat, now: Nat}
  RushPause{generation: Nat, now: Nat}
  RushResume{generation: Nat, now: Nat, visible: Bool}
  RushComplete{generation: Nat}

type RushEffect is Data:
  NoChange{}
  Loaded{}
  Started{}
  Failed{}
  Finished{correct: Bool, expired: Bool}
  Suspended{}
  Resumed{}
  Recapped{}

type RushResult is Data:
  RushResult{state: Rush, effect: RushEffect}

def start_clock(now: Nat, duration: Maybe<&2, Nat>) -> Clock:
  match duration:
    case None{}:
      Untimed{}
    case Some{d}:
      Running{Nat.add(now, d)}

def expired(clock: Clock, now: Nat) -> Bool:
  match clock:
    case Running{deadline}:
      (now >= deadline : Nat)
    case _:
      False{}

def finish_answer(generation: Nat, clock: Clock, correct: Bool, late: Bool) -> RushResult:
  match late:
    case True{}:
      RushResult{Rush{Feedback{}, generation, clock}, Finished{False{}, True{}}}
    case False{}:
      RushResult{Rush{Feedback{}, generation, clock}, Finished{correct, False{}}}

def timeout_round(+state: Rush, +generation: Nat, clock: Clock, late: Bool) -> RushResult:
  match late:
    case True{}:
      RushResult{Rush{Feedback{}, generation, clock}, Finished{False{}, True{}}}
    case False{}:
      RushResult{state, NoChange{}}

def pause_running(+generation: Nat, +deadline: Nat, +now: Nat, late: Bool) -> RushResult:
  match late:
    case True{}:
      RushResult{Rush{Feedback{}, generation, Running{deadline}}, Finished{False{}, True{}}}
    case False{}:
      RushResult{Rush{Paused{}, generation, Stopped{Nat.sub(deadline, now)}}, Suspended{}}

def resume_stopped(+generation: Nat, remaining: Nat, now: Nat, visible: Bool) -> RushResult:
  match visible:
    case True{}:
      RushResult{Rush{Playing{}, generation, Running{Nat.add(now, remaining)}}, Resumed{}}
    case False{}:
      RushResult{Rush{Paused{}, generation, Stopped{remaining}}, NoChange{}}

def current_step(+s: Rush, event: RushEvent) -> RushResult:
  match s event:
    case Rush{phase, generation, clock} RushLoad{_}:
      RushResult{Rush{Loading{}, 1n+generation, Untimed{}}, Loaded{}}
    case Rush{Loading{}, generation, clock} RushReady{_, now, duration}:
      RushResult{Rush{Playing{}, generation, start_clock(now, duration)}, Started{}}
    case Rush{Loading{}, generation, clock} RushFail{_}:
      RushResult{Rush{Error{}, generation, clock}, Failed{}}
    case Rush{Loading{}, generation, clock} RushComplete{_}:
      RushResult{Rush{Recap{}, generation, clock}, Recapped{}}
    case Rush{Playing{}, generation, +clock} RushAnswer{_, now, correct}:
      finish_answer(generation, clock, correct, expired(clock, now))
    case Rush{Playing{}, generation, +clock} RushTimeout{_, now}:
      timeout_round(s, generation, clock, expired(clock, now))
    case Rush{Playing{}, generation, Running{+deadline}} RushPause{_, +now}:
      pause_running(generation, deadline, now, (now >= deadline : Nat))
    case Rush{Paused{}, generation, Stopped{remaining}} RushResume{_, now, visible}:
      resume_stopped(generation, remaining, now, visible)
    case _ _:
      RushResult{s, NoChange{}}

def event_generation(event: RushEvent) -> Nat:
  match event:
    case RushLoad{generation}:
      generation
    case RushReady{generation, _, _}:
      generation
    case RushFail{generation}:
      generation
    case RushAnswer{generation, _, _}:
      generation
    case RushTimeout{generation, _}:
      generation
    case RushPause{generation, _}:
      generation
    case RushResume{generation, _, _}:
      generation
    case RushComplete{generation}:
      generation

def guarded_step(+s: Rush, event: RushEvent, current: Bool) -> RushResult:
  match current:
    case True{}:
      current_step(s, event)
    case False{}:
      RushResult{s, NoChange{}}

def rush_step(+s: Rush, +event: RushEvent) -> RushResult:
  match s:
    case Rush{phase, +generation, clock}:
      guarded_step(Rush{phase, generation, clock}, event, Nat.is_eq(generation, event_generation(event)))
