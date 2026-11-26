function word_to_u32(w) {
  let x = 0;
  for (let i = 0; w.$ === "WCon"; i++) {
    x |= Number(w.head) << i;
    w = w.tail;
  }
  return x >>> 0;
}

function u32_to_word(x) {
  let w = {$: "WNil"};
  for (let i = 31; i >= 0; i--) {
    w = {$: "WCon", head: ((x >>> i) & 1) === 1, tail: w};
  }
  return w;
}

function cmp_new(a, b) {
  return {$: a < b ? "LT" : a === b ? "EQ" : "GT"};
}

function tup_new(a, b) {
  return {$: "Tuple", fst: a, snd: b};
}

function nat_divmod(a, b) {
  return tup_new(b && Math.trunc(a / b), b ? a % b : a);
}

function nat_chk(n) {
  if (n > 281474976710655) {
    throw "bend: a Nat past the largest immediate 2^48-1";
  }
  return n;
}

function nat_in(n) {
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 53) {
    throw "bend: expected a Nat host number: an integer from 0 to 2^53";
  }
  return n;
}

function f32_show(x) {
  let s = "nan";
  for (let p = 1; x === x && p <= 9 && f32_round(s) !== x; p += 1) {
    s = String(Number(x.toExponential(p - 1)));
  }
  return (Object.is(x, -0) ? "-0" : s).replace("Infinity", "inf");
}

function f32_bits(x) {
  return new Uint32Array(new Float32Array([x]).buffer)[0];
}

function f32_from_bits(u) {
  return new Float32Array(new Uint32Array([u]).buffer)[0];
}

function f32_read(s) {
  const re = /^[\t\n\v\f\r ]*[+-]?((\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|inf(inity)?|nan)$/i;
  return re.test(s) ? {$: "Some", value: f32_round(
    s.replace(/inf\w*/i, "Infinity"))} : {$: "None"};
}

const f32_round = function f32_round(s) {
  const d = Number(s);
  const a = Math.abs(d);
  const f = Math.fround(a);
  const g = 2 * a - Math.min(f, 2 ** 128);
  if (g === f || Math.fround(g) !== g || g === Infinity) {
    return Math.sign(d) * f;
  }
  let k = 0;
  while (a * 2 ** k % 1 !== 0) {
    k += 1;
  }
  const [, i, r, e] = /(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
  const n = Number(e ?? 0) - r.length;
  const x = BigInt(i + r) * 2n ** BigInt(k) * 10n ** BigInt(Math.max(n, 0));
  const y = BigInt(a * 2 ** k) * 10n ** BigInt(Math.max(-n, 0));
  return Math.sign(d) * (x === y || x > y !== g > f ? f : g);
};

const char_new = function char_new(c) {
  return c < 55296 || c >= 57344 && c <= 1114111 ? String.fromCodePoint(c) : String.fromCharCode(56320, c >>> 22, c >>> 11 & 2047, c & 2047);
};

function char_len(s, at = 0) {
  return s[at] === "\uDC00" ? 4 : s.codePointAt(at) > 0xFFFF ? 2 : 1;
}

function char_code(s) {
  return s.length < 4 ? s.codePointAt(0)
    : (s.charCodeAt(1) << 22 | s.charCodeAt(2) << 11 | s.charCodeAt(3)) >>> 0;
}

function string_contains(s, p) {
  // A match starts at a Char, not inside a packed U32 code.
  for (let at = 0; at <= s.length; at += char_len(s, at)) {
    if (s.startsWith(p, at)) {
      return true;
    }
  }
  return false;
}

function str_out(s) {
  return s.replace(/\uDC00[^]{3}/gu, "\uFFFD");
}

function str_in(s) {
  return s.replace(/\p{Cs}/gu, "\uFFFD");
}

// Array
// =====

function array_new(d, v, lgs) {
  if (d > 31 - lgs) {
    throw "bend: an array past the deepest block class 31 (depth + log2 words per cell)";
  }
  return Array(2 ** d).fill(v);
}

function array_node(a, b) {
  if (a.length !== b.length) {
    throw "bend: runtime fail-stop";
  }
  return a.concat(b);
}

function array_rmw(a, i, f) {
  const old = a[i %= a.length];
  a[i] = f(old);
  return tup_new(a, old);
}

// Run
// ===

function run_tail(f, x) {
  return {$: "$JMP", f: f.j?.f === f ? f.j : f, x};
}

function run_clo(j) {
  const f = (x) => run_loop(j(x));
  f.j = j;
  j.f = f;
  return f;
}

function run_loop(r) {
  while (r !== null && typeof r === "object" && r.$ === "$JMP") {
    r = r.f(r.x);
  }
  return r;
}

function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : run_loop(f(...a));
}

// Effect
// ======

const $0eff = Object.create(null);
const io_file_append = new Set();

function io_eff(k, run) {
  if (arguments.length > 2) {
    throw new Error("bend: " + k + " takes no need: an effect that waits parks itself");
  }
  if (k in $0eff) {
    throw new Error("bend: two effects register " + k);
  }
  $0eff[k] = run;
}
// Program
// =======

function $start_clock(_now_0, _duration_0) {
  if (_duration_0.$ === "None") {
    return {$: "Untimed"};
  } else {
    const _d_0 = _duration_0["value"];
    return {$: "Running", "deadline": nat_chk(_now_0 + _d_0)};
  }
}

function $expired(_clock_0, _now_0) {
  if (_clock_0.$ === "Running") {
    const _deadline_0 = _clock_0["deadline"];
    return $Nat_is_ge(_now_0, _deadline_0);
  } else {
    return false;
  }
}

function $finish_answer(_generation_0, _clock_0, _correct_0, _late_0) {
  if (_late_0) {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Feedback"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "Finished", "correct": false, "expired": true}};
  } else {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Feedback"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "Finished", "correct": _correct_0, "expired": false}};
  }
}

function $timeout_round(_state_0, _generation_0, _clock_0, _late_0) {
  if (_late_0) {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Feedback"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "Finished", "correct": false, "expired": true}};
  } else {
    return {$: "RushResult", "state": _state_0, "effect": {$: "NoChange"}};
  }
}

function $deadline_answer(_state_0, _generation_0, _clock_0, _correct_0, _late_0) {
  if (_late_0) {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Feedback"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "Finished", "correct": _correct_0, "expired": false}};
  } else {
    return {$: "RushResult", "state": _state_0, "effect": {$: "NoChange"}};
  }
}

function $pause_running(_generation_0, _deadline_0, _now_0, _late_0) {
  if (_late_0) {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Feedback"}, "generation": _generation_0, "clock": {$: "Running", "deadline": _deadline_0}}, "effect": {$: "Finished", "correct": false, "expired": true}};
  } else {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Paused"}, "generation": _generation_0, "clock": {$: "Stopped", "remaining": (_deadline_0 < _now_0 ? 0 : _deadline_0 - _now_0)}}, "effect": {$: "Suspended"}};
  }
}

function $resume_stopped(_generation_0, _remaining_0, _now_0, _visible_0) {
  if (_visible_0) {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Playing"}, "generation": _generation_0, "clock": {$: "Running", "deadline": nat_chk(_now_0 + _remaining_0)}}, "effect": {$: "Resumed"}};
  } else {
    return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Paused"}, "generation": _generation_0, "clock": {$: "Stopped", "remaining": _remaining_0}}, "effect": {$: "NoChange"}};
  }
}

function $current_step(_s_0, _event_0) {
  const _t_0 = _s_0["phase"];
  if (_t_0.$ === "Loading") {
    const _generation_0 = _s_0["generation"];
    const _clock_0 = _s_0["clock"];
    if (_event_0.$ === "RushLoad") {
      return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": nat_chk(_generation_0 + 1), "clock": {$: "Untimed"}}, "effect": {$: "Loaded"}};
    } else if (_event_0.$ === "RushReady") {
      const _now_0 = _event_0["now"];
      const _duration_0 = _event_0["duration"];
      return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Playing"}, "generation": _generation_0, "clock": $$start_clock(_now_0, _duration_0)}, "effect": {$: "Started"}};
    } else if (_event_0.$ === "RushFail") {
      return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Error"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "Failed"}};
    } else if (_event_0.$ === "RushComplete") {
      return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Recap"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "Recapped"}};
    } else {
      return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": _generation_0, "clock": _clock_0}, "effect": {$: "NoChange"}};
    }
  } else if (_t_0.$ === "Playing") {
    const _generation_1 = _s_0["generation"];
    const _t_1 = _s_0["clock"];
    if (_t_1.$ === "Running") {
      const _deadline_0 = _t_1["deadline"];
      if (_event_0.$ === "RushLoad") {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": nat_chk(_generation_1 + 1), "clock": {$: "Untimed"}}, "effect": {$: "Loaded"}};
      } else if (_event_0.$ === "RushAnswer") {
        const _now_1 = _event_0["now"];
        const _correct_0 = _event_0["correct"];
        return $finish_answer(_generation_1, {$: "Running", "deadline": _deadline_0}, _correct_0, $$expired({$: "Running", "deadline": _deadline_0}, _now_1));
      } else if (_event_0.$ === "RushDeadlineAnswer") {
        const _now_2 = _event_0["now"];
        const _correct_1 = _event_0["correct"];
        return $deadline_answer({$: "Rush", "phase": {$: "Playing"}, "generation": _generation_1, "clock": {$: "Running", "deadline": _deadline_0}}, _generation_1, {$: "Running", "deadline": _deadline_0}, _correct_1, $$expired({$: "Running", "deadline": _deadline_0}, _now_2));
      } else if (_event_0.$ === "RushTimeout") {
        const _now_3 = _event_0["now"];
        return $timeout_round({$: "Rush", "phase": {$: "Playing"}, "generation": _generation_1, "clock": {$: "Running", "deadline": _deadline_0}}, _generation_1, {$: "Running", "deadline": _deadline_0}, $$expired({$: "Running", "deadline": _deadline_0}, _now_3));
      } else if (_event_0.$ === "RushPause") {
        const _now_4 = _event_0["now"];
        return $pause_running(_generation_1, _deadline_0, _now_4, $$Nat_is_ge(_now_4, _deadline_0));
      } else {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Playing"}, "generation": _generation_1, "clock": {$: "Running", "deadline": _deadline_0}}, "effect": {$: "NoChange"}};
      }
    } else {
      if (_event_0.$ === "RushLoad") {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": nat_chk(_generation_1 + 1), "clock": {$: "Untimed"}}, "effect": {$: "Loaded"}};
      } else if (_event_0.$ === "RushAnswer") {
        const _now_5 = _event_0["now"];
        const _correct_2 = _event_0["correct"];
        return $finish_answer(_generation_1, _t_1, _correct_2, $$expired(_t_1, _now_5));
      } else if (_event_0.$ === "RushDeadlineAnswer") {
        const _now_6 = _event_0["now"];
        const _correct_3 = _event_0["correct"];
        return $deadline_answer({$: "Rush", "phase": {$: "Playing"}, "generation": _generation_1, "clock": _t_1}, _generation_1, _t_1, _correct_3, $$expired(_t_1, _now_6));
      } else if (_event_0.$ === "RushTimeout") {
        const _now_7 = _event_0["now"];
        return $timeout_round({$: "Rush", "phase": {$: "Playing"}, "generation": _generation_1, "clock": _t_1}, _generation_1, _t_1, $$expired(_t_1, _now_7));
      } else {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Playing"}, "generation": _generation_1, "clock": _t_1}, "effect": {$: "NoChange"}};
      }
    }
  } else if (_t_0.$ === "Paused") {
    const _generation_2 = _s_0["generation"];
    const _t_2 = _s_0["clock"];
    if (_t_2.$ === "Stopped") {
      const _remaining_0 = _t_2["remaining"];
      if (_event_0.$ === "RushLoad") {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": nat_chk(_generation_2 + 1), "clock": {$: "Untimed"}}, "effect": {$: "Loaded"}};
      } else if (_event_0.$ === "RushResume") {
        const _now_8 = _event_0["now"];
        const _visible_0 = _event_0["visible"];
        return $resume_stopped(_generation_2, _remaining_0, _now_8, _visible_0);
      } else {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Paused"}, "generation": _generation_2, "clock": {$: "Stopped", "remaining": _remaining_0}}, "effect": {$: "NoChange"}};
      }
    } else {
      if (_event_0.$ === "RushLoad") {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": nat_chk(_generation_2 + 1), "clock": {$: "Untimed"}}, "effect": {$: "Loaded"}};
      } else {
        return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Paused"}, "generation": _generation_2, "clock": _t_2}, "effect": {$: "NoChange"}};
      }
    }
  } else {
    const _generation_3 = _s_0["generation"];
    const _clock_1 = _s_0["clock"];
    if (_event_0.$ === "RushLoad") {
      return {$: "RushResult", "state": {$: "Rush", "phase": {$: "Loading"}, "generation": nat_chk(_generation_3 + 1), "clock": {$: "Untimed"}}, "effect": {$: "Loaded"}};
    } else {
      return {$: "RushResult", "state": {$: "Rush", "phase": _t_0, "generation": _generation_3, "clock": _clock_1}, "effect": {$: "NoChange"}};
    }
  }
}

function $event_generation(_event_0) {
  if (_event_0.$ === "RushLoad") {
    const _generation_0 = _event_0["generation"];
    return _generation_0;
  } else if (_event_0.$ === "RushReady") {
    const _generation_1 = _event_0["generation"];
    return _generation_1;
  } else if (_event_0.$ === "RushFail") {
    const _generation_2 = _event_0["generation"];
    return _generation_2;
  } else if (_event_0.$ === "RushAnswer") {
    const _generation_3 = _event_0["generation"];
    return _generation_3;
  } else if (_event_0.$ === "RushDeadlineAnswer") {
    const _generation_4 = _event_0["generation"];
    return _generation_4;
  } else if (_event_0.$ === "RushTimeout") {
    const _generation_5 = _event_0["generation"];
    return _generation_5;
  } else if (_event_0.$ === "RushPause") {
    const _generation_6 = _event_0["generation"];
    return _generation_6;
  } else if (_event_0.$ === "RushResume") {
    const _generation_7 = _event_0["generation"];
    return _generation_7;
  } else {
    const _generation_8 = _event_0["generation"];
    return _generation_8;
  }
}

function $guarded_step(_s_0, _event_0, _current_0) {
  if (_current_0) {
    return $current_step(_s_0, _event_0);
  } else {
    return {$: "RushResult", "state": _s_0, "effect": {$: "NoChange"}};
  }
}

function $rush_step(_s_0, _event_0) {
  const _phase_0 = _s_0["phase"];
  const _generation_0 = _s_0["generation"];
  const _clock_0 = _s_0["clock"];
  return $guarded_step({$: "Rush", "phase": _phase_0, "generation": _generation_0, "clock": _clock_0}, _event_0, $$Nat_is_eq(_generation_0, $$event_generation(_event_0)));
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $Nat_is_eq(_a_0, _b_0) {
  return $Cmp_is_eq(cmp_new(_a_0, _b_0));
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $Cmp_is_eq(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

const $$start_clock = $start_clock;
const $$expired = $expired;
const $$Nat_is_ge = $Nat_is_ge;
const $$event_generation = $event_generation;
const $$Nat_is_eq = $Nat_is_eq;export default {
  "start_clock": run_lib((a0,a1) => run_loop($start_clock(nat_in(a0),a1)), 2),
  "expired": run_lib((a0,a1) => run_loop($expired(a0,nat_in(a1))), 2),
  "finish_answer": run_lib((a0,a1,a2,a3) => run_loop($finish_answer(nat_in(a0),a1,a2,a3)), 4),
  "timeout_round": run_lib((a0,a1,a2,a3) => run_loop($timeout_round(a0,nat_in(a1),a2,a3)), 4),
  "deadline_answer": run_lib((a0,a1,a2,a3,a4) => run_loop($deadline_answer(a0,nat_in(a1),a2,a3,a4)), 5),
  "pause_running": run_lib((a0,a1,a2,a3) => run_loop($pause_running(nat_in(a0),nat_in(a1),nat_in(a2),a3)), 4),
  "resume_stopped": run_lib((a0,a1,a2,a3) => run_loop($resume_stopped(nat_in(a0),nat_in(a1),nat_in(a2),a3)), 4),
  "current_step": run_lib((a0,a1) => run_loop($current_step(a0,a1)), 2),
  "event_generation": run_lib((a0) => run_loop($event_generation(a0)), 1),
  "guarded_step": run_lib((a0,a1,a2) => run_loop($guarded_step(a0,a1,a2)), 3),
  "rush_step": run_lib((a0,a1) => run_loop($rush_step(a0,a1)), 2),
};
