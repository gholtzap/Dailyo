import Base

type TrainPhase is Data:
  Planning{}
  Revealed{}
  Complete{}

type Leg is Data:
  Leg{route: String, to: Maybe<&2, String>}

def max_guesses() -> Nat:
  6n

def stop_eq(a: Maybe<&2, String>, b: Maybe<&2, String>) -> Bool:
  match a b:
    case None{} None{}:
      True{}
    case Some{x} Some{y}:
      String.eq(x, y)
    case _ _:
      False{}

def leg_eq(a: Leg, b: Leg) -> Bool:
  match a b:
    case Leg{ar, at} Leg{br, bt}:
      String.eq(ar, br) && stop_eq(at, bt)

def legs_eq(a: +List<Leg>, b: +List<Leg>) -> Bool:
  match a b:
    case Nil{} Nil{}:
      True{}
    case ah <> at bh <> bt:
      leg_eq(ah, bh) && legs_eq(at, bt)
    case _ _:
      False{}

def without_guess_put(h: +List<Leg>, t: +List<+List<Leg>>, same: Bool) -> +List<+List<Leg>>:
  match same:
    case True{}:
      t
    case False{}:
      h <> t

def without_guess(xs: +List<+List<Leg>>, +draft: +List<Leg>) -> +List<+List<Leg>>:
  match xs:
    case Nil{}:
      Nil{}
    case +h <> t:
      without_guess_put(h, without_guess(t, draft), legs_eq(h, draft))


def remove_leg(xs: +List<Leg>, index: Nat) -> +List<Leg>:
  match xs index:
    case Nil{} _:
      Nil{}
    case h <> t 0n:
      t
    case h <> t 1n+p:
      h <> remove_leg(t, p)

def drop_last(+xs: +List<Leg>) -> +List<Leg>:
  List.take(&2, Leg, xs, Nat.sub(List.length(&2, Leg, xs), 1n))

type Train<-C: Data, -R: Data> is Data:
  Train{phase: TrainPhase, challenge: C, legs: +List<Leg>, guesses: Maybe<&2, +List<+List<Leg>>>, assisted: Maybe<&2, Bool>, skipped: Maybe<&2, Bool>, result: Maybe<&2, R>}

type TrainEvent<-C: Data, -R: Data> is Data:
  Retry{valid: Bool}
  Finish{}
  Next{challenge: C}
  Show{result: R}
  Hint{}
  Continue{route: String, leg: Maybe<&2, Leg>, prefix: +List<Leg>}
  Add{leg: Leg}
  Remove{index: Nat}
  Submit{draft: +List<Leg>, valid: Bool, result: R}

def empty_guesses(gs: Maybe<&2, +List<+List<Leg>>>) -> +List<+List<Leg>>:
  Maybe.default(&2, +List<+List<Leg>>, gs, Nil{})

def truth(b: Maybe<&2, Bool>) -> Bool:
  Maybe.default(&2, Bool, b, False{})

def choose(-A: Data, yes: A, no: A, condition: Bool) -> A:
  match condition:
    case True{}:
      yes
    case False{}:
      no

def train_add(-C: Data, -R: Data, +s: Train<C, R>, leg: Leg, allowed: Bool) -> Maybe<&2, Train<C, R>>:
  match s allowed:
    case Train{phase, challenge, legs, guesses, assisted, skipped, result} True{}:
      Some{Train{phase, challenge, List.append(&2, Leg, legs, [leg]), guesses, assisted, skipped, result}}
    case _ False{}:
      None{}

def train_remove(-C: Data, -R: Data, s: Train<C, R>, index: Nat, allowed: Bool) -> Maybe<&2, Train<C, R>>:
  match s allowed:
    case Train{phase, challenge, legs, guesses, assisted, skipped, result} True{}:
      Some{Train{phase, challenge, remove_leg(legs, index), guesses, assisted, skipped, result}}
    case _ False{}:
      None{}

def train_continue(-C: Data, -R: Data, +s: Train<C, R>, route: String, leg: Maybe<&2, Leg>, prefix: +List<Leg>) -> Maybe<&2, Train<C, R>>:
  match s leg:
    case Train{phase, challenge, +legs, guesses, assisted, skipped, result} Some{Leg{+r, to}}:
      train_add(C, R, Train{phase, challenge, legs, guesses, assisted, skipped, result}, Leg{r, to}, (List.length(&2, Leg, legs) < 5n : Nat) && String.eq(route, r) && legs_eq(legs, prefix))
    case _ None{}:
      None{}

def last_eq_option(last: Maybe<&2, +List<Leg>>, draft: +List<Leg>) -> Bool:
  match last:
    case None{}:
      False{}
    case Some{xs}:
      legs_eq(xs, draft)

def last_eq(gs: +List<+List<Leg>>, draft: +List<Leg>) -> Bool:
  last_eq_option(List.last(&2, +List<Leg>, gs), draft)

def train_submit_result(-C: Data, -R: Data, s: Train<C, R>, +draft: +List<Leg>, +gs: +List<+List<Leg>>, valid: Bool, result: R) -> Train<C, R>:
  match s:
    case Train{+phase, +challenge, legs, guesses, +assisted, +skipped, old}:
      choose(Train<C, R>,
        Train{Revealed{}, challenge, draft, Some{gs}, assisted, skipped, Some{result}},
        Train{phase, challenge, legs, Some{gs}, assisted, skipped, old},
        valid || Nat.is_eq(List.length(&2, +List<Leg>, gs), max_guesses()))

def train_submit(-C: Data, -R: Data, +s: Train<C, R>, +draft: +List<Leg>, valid: Bool, result: R, allowed: Bool) -> Maybe<&2, Train<C, R>>:
  match s allowed:
    case Train{phase, challenge, legs, +guesses, assisted, skipped, old} True{}:
      next = List.append(&2, +List<Leg>, without_guess(empty_guesses(guesses), draft), [draft])
      Some{train_submit_result(C, R, Train{phase, challenge, legs, guesses, assisted, skipped, old}, draft, next, valid, result)}
    case _ False{}:
      None{}

def planning_step(-C: Data, -R: Data, +s: Train<C, R>, event: TrainEvent<C, R>) -> Maybe<&2, Train<C, R>>:
  match s event:
    case Train{phase, challenge, legs, guesses, assisted, skipped, result} Show{r}:
      Some{Train{Revealed{}, challenge, Nil{}, guesses, assisted, Some{True{}}, Some{r}}}
    case Train{phase, challenge, legs, guesses, assisted, skipped, result} Hint{}:
      Some{Train{phase, challenge, legs, guesses, Some{True{}}, skipped, result}}
    case _ Continue{route, leg, prefix}:
      train_continue(C, R, s, route, leg, prefix)
    case Train{phase, challenge, +legs, guesses, assisted, skipped, result} Add{Leg{+route, to}}:
      train_add(C, R, Train{phase, challenge, legs, guesses, assisted, skipped, result}, Leg{route, to}, Bool.not(String.is_empty(route)) && (List.length(&2, Leg, legs) < 6n : Nat))
    case Train{phase, challenge, +legs, guesses, assisted, skipped, result} Remove{+index}:
      train_remove(C, R, Train{phase, challenge, legs, guesses, assisted, skipped, result}, index, (index < List.length(&2, Leg, legs) : Nat))
    case Train{phase, challenge, legs, +guesses, assisted, skipped, result} Submit{+draft, valid, r}:
      train_submit(C, R, Train{phase, challenge, legs, guesses, assisted, skipped, result}, draft, valid, r,
        (List.length(&2, +List<Leg>, empty_guesses(guesses)) < max_guesses() : Nat) && Bool.not(List.is_empty(&2, Leg, draft)) && (List.length(&2, Leg, draft) <= 6n : Nat) && Bool.not(last_eq(empty_guesses(guesses), draft)))
    case _ _:
      None{}

def retry_step(-C: Data, -R: Data, s: Train<C, R>, valid: Bool) -> Maybe<&2, Train<C, R>>:
  match s:
    case Train{phase, challenge, +legs, +guesses, assisted, +skipped, result}:
      choose(Maybe<&2, Train<C, R>>,
        Some{Train{Planning{}, challenge, drop_last(legs), Some{[legs]}, Some{True{}}, None{}, None{}}},
        None{},
        Bool.not(valid) && Bool.not(truth(skipped)) && List.is_empty(&2, +List<Leg>, empty_guesses(guesses)) && Bool.not(List.is_empty(&2, Leg, legs)))

def train_step(-C: Data, -R: Data, +s: Train<C, R>, event: TrainEvent<C, R>) -> Maybe<&2, Train<C, R>>:
  match s event:
    case Train{Revealed{}, c, ls, gs, a, k, r} Retry{valid}:
      retry_step(C, R, Train{Revealed{}, c, ls, gs, a, k, r}, valid)
    case Train{Revealed{}, c, ls, gs, a, k, r} Finish{}:
      Some{Train{Complete{}, c, ls, gs, a, k, r}}
    case Train{Planning{}, c, ls, gs, a, k, r} Next{next}:
      Some{Train{Planning{}, next, Nil{}, None{}, None{}, None{}, None{}}}
    case Train{Revealed{}, c, ls, gs, a, k, r} Next{next}:
      Some{Train{Planning{}, next, Nil{}, None{}, None{}, None{}, None{}}}
    case Train{Planning{}, c, ls, gs, a, k, r} _:
      planning_step(C, R, Train{Planning{}, c, ls, gs, a, k, r}, event)
    case _ _:
      None{}
