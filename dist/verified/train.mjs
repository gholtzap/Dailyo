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

function $max_guesses() {
  return 6;
}

function $stop_eq(_a_0, _b_0) {
  if (_a_0.$ === "None") {
    if (_b_0.$ === "None") {
      return true;
    } else {
      return false;
    }
  } else {
    const _x_0 = _a_0["value"];
    if (_b_0.$ === "Some") {
      const _y_0 = _b_0["value"];
      return $String_eq(_x_0, _y_0);
    } else {
      return false;
    }
  }
}

function $leg_eq(_a_0, _b_0) {
  const _ar_0 = _a_0["route"];
  const _at_0 = _a_0["to"];
  const _br_0 = _b_0["route"];
  const _bt_0 = _b_0["to"];
  return $Bool_and($$String_eq(_ar_0, _br_0), $$stop_eq(_at_0, _bt_0));
}

function $legs_eq(_a_0, _b_0) {
  if (_a_0.$ === "Nil") {
    if (_b_0.$ === "Nil") {
      return true;
    } else {
      return false;
    }
  } else {
    const _ah_0 = _a_0["head"];
    const _at_0 = _a_0["tail"];
    if (_b_0.$ === "Con") {
      const _bh_0 = _b_0["head"];
      const _bt_0 = _b_0["tail"];
      return $Bool_and($$leg_eq(_ah_0, _bh_0), $$legs_eq(_at_0, _bt_0));
    } else {
      return false;
    }
  }
}

function $without_guess_put(_h_0, _t_0, _same_0) {
  if (_same_0) {
    return _t_0;
  } else {
    return {$: "Con", "head": _h_0, "tail": _t_0};
  }
}

function $without_guess(_xs_0, _draft_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return $without_guess_put(_h_0, $$without_guess(_t_0, _draft_0), $$legs_eq(_h_0, _draft_0));
  }
}

function $remove_leg(_xs_0, _index_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    if (_index_0 == 0) {
      return _t_0;
    } else {
      const _p_0 = (_index_0 - 1);
      return {$: "Con", "head": _h_0, "tail": $$remove_leg(_t_0, _p_0)};
    }
  }
}

function $drop_last(_xs_0) {
  const _x_0 = $$List_length(_xs_0);
  return $List_take(_xs_0, (_x_0 < 1 ? 0 : _x_0 - 1));
}

function $empty_guesses(_gs_0) {
  return $Maybe_default(_gs_0, {$: "Nil"});
}

function $truth(_b_0) {
  return $Maybe_default(_b_0, false);
}

function $choose(_yes_0, _no_0, _condition_0) {
  if (_condition_0) {
    return _yes_0;
  } else {
    return _no_0;
  }
}

function $train_add(_s_0, _leg_0, _allowed_0) {
  const _phase_0 = _s_0["phase"];
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _guesses_0 = _s_0["guesses"];
  const _assisted_0 = _s_0["assisted"];
  const _skipped_0 = _s_0["skipped"];
  const _result_0 = _s_0["result"];
  if (_allowed_0) {
    return {$: "Some", "value": {$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": $$List_append(_legs_0, {$: "Con", "head": _leg_0, "tail": {$: "Nil"}}), "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}};
  } else {
    return {$: "None"};
  }
}

function $train_remove(_s_0, _index_0, _allowed_0) {
  const _phase_0 = _s_0["phase"];
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _guesses_0 = _s_0["guesses"];
  const _assisted_0 = _s_0["assisted"];
  const _skipped_0 = _s_0["skipped"];
  const _result_0 = _s_0["result"];
  if (_allowed_0) {
    return {$: "Some", "value": {$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": $$remove_leg(_legs_0, _index_0), "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}};
  } else {
    return {$: "None"};
  }
}

function $train_continue(_s_0, _route_0, _leg_0, _prefix_0) {
  const _phase_0 = _s_0["phase"];
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _guesses_0 = _s_0["guesses"];
  const _assisted_0 = _s_0["assisted"];
  const _skipped_0 = _s_0["skipped"];
  const _result_0 = _s_0["result"];
  if (_leg_0.$ === "Some") {
    const _t_0 = _leg_0["value"];
    const _r_0 = _t_0["route"];
    const _to_0 = _t_0["to"];
    const _x_0 = $$List_length(_legs_0);
    return $train_add({$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}, {$: "Leg", "route": _r_0, "to": _to_0}, $$Bool_and($$Bool_and((_x_0 < 5), $$String_eq(_route_0, _r_0)), $$legs_eq(_legs_0, _prefix_0)));
  } else {
    return {$: "None"};
  }
}

function $last_eq_option(_last_0, _draft_0) {
  if (_last_0.$ === "None") {
    return false;
  } else {
    const _xs_0 = _last_0["value"];
    return $legs_eq(_xs_0, _draft_0);
  }
}

function $last_eq(_gs_0, _draft_0) {
  return $last_eq_option($$List_last(_gs_0), _draft_0);
}

function $train_submit_result(_s_0, _draft_0, _gs_0, _valid_0, _result_0) {
  const _phase_0 = _s_0["phase"];
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _assisted_0 = _s_0["assisted"];
  const _skipped_0 = _s_0["skipped"];
  const _old_0 = _s_0["result"];
  const _x_0 = $$Nat_is_eq($$List_length(_gs_0), $$max_guesses());
  return $choose({$: "Train", "phase": {$: "Revealed"}, "challenge": _challenge_0, "legs": _draft_0, "guesses": {$: "Some", "value": _gs_0}, "assisted": _assisted_0, "skipped": _skipped_0, "result": {$: "Some", "value": _result_0}}, {$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": {$: "Some", "value": _gs_0}, "assisted": _assisted_0, "skipped": _skipped_0, "result": _old_0}, (_valid_0 || _x_0));
}

function $train_submit(_s_0, _draft_0, _valid_0, _result_0, _allowed_0) {
  const _phase_0 = _s_0["phase"];
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _guesses_0 = _s_0["guesses"];
  const _assisted_0 = _s_0["assisted"];
  const _skipped_0 = _s_0["skipped"];
  const _old_0 = _s_0["result"];
  if (_allowed_0) {
    const _next_0 = $$List_append($$without_guess($$empty_guesses(_guesses_0), _draft_0), {$: "Con", "head": _draft_0, "tail": {$: "Nil"}});
    return {$: "Some", "value": $$train_submit_result({$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _old_0}, _draft_0, _next_0, _valid_0, _result_0)};
  } else {
    return {$: "None"};
  }
}

function $planning_step(_s_0, _event_0) {
  const _phase_0 = _s_0["phase"];
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _guesses_0 = _s_0["guesses"];
  const _assisted_0 = _s_0["assisted"];
  const _skipped_0 = _s_0["skipped"];
  const _result_0 = _s_0["result"];
  if (_event_0.$ === "Show") {
    const _r_0 = _event_0["result"];
    return {$: "Some", "value": {$: "Train", "phase": {$: "Revealed"}, "challenge": _challenge_0, "legs": {$: "Nil"}, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": {$: "Some", "value": true}, "result": {$: "Some", "value": _r_0}}};
  } else if (_event_0.$ === "Hint") {
    return {$: "Some", "value": {$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": {$: "Some", "value": true}, "skipped": _skipped_0, "result": _result_0}};
  } else if (_event_0.$ === "Continue") {
    const _route_0 = _event_0["route"];
    const _leg_0 = _event_0["leg"];
    const _prefix_0 = _event_0["prefix"];
    return $train_continue({$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}, _route_0, _leg_0, _prefix_0);
  } else if (_event_0.$ === "Add") {
    const _t_0 = _event_0["leg"];
    const _route_1 = _t_0["route"];
    const _to_0 = _t_0["to"];
    const _x_0 = $$List_length(_legs_0);
    return $train_add({$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}, {$: "Leg", "route": _route_1, "to": _to_0}, $$Bool_and($$Bool_not($$String_is_empty(_route_1)), (_x_0 < 6)));
  } else if (_event_0.$ === "Remove") {
    const _index_0 = _event_0["index"];
    const _x_1 = $$List_length(_legs_0);
    return $train_remove({$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}, _index_0, (_index_0 < _x_1));
  } else if (_event_0.$ === "Submit") {
    const _draft_0 = _event_0["draft"];
    const _valid_0 = _event_0["valid"];
    const _r_1 = _event_0["result"];
    const _x_2 = $$List_length($$empty_guesses(_guesses_0));
    const _x_3 = $$max_guesses();
    return $train_submit({$: "Train", "phase": _phase_0, "challenge": _challenge_0, "legs": _legs_0, "guesses": _guesses_0, "assisted": _assisted_0, "skipped": _skipped_0, "result": _result_0}, _draft_0, _valid_0, _r_1, $$Bool_and($$Bool_and($$Bool_and((_x_2 < _x_3), $$Bool_not($$List_is_empty(_draft_0))), $$Nat_is_le($$List_length(_draft_0), 6)), $$Bool_not($$last_eq($$empty_guesses(_guesses_0), _draft_0))));
  } else {
    return {$: "None"};
  }
}

function $retry_step(_s_0, _valid_0) {
  const _challenge_0 = _s_0["challenge"];
  const _legs_0 = _s_0["legs"];
  const _guesses_0 = _s_0["guesses"];
  const _skipped_0 = _s_0["skipped"];
  return $choose({$: "Some", "value": {$: "Train", "phase": {$: "Planning"}, "challenge": _challenge_0, "legs": $$drop_last(_legs_0), "guesses": {$: "Some", "value": {$: "Con", "head": _legs_0, "tail": {$: "Nil"}}}, "assisted": {$: "Some", "value": true}, "skipped": {$: "None"}, "result": {$: "None"}}}, {$: "None"}, $$Bool_and($$Bool_and($$Bool_and($$Bool_not(_valid_0), $$Bool_not($$truth(_skipped_0))), $$List_is_empty($$empty_guesses(_guesses_0))), $$Bool_not($$List_is_empty(_legs_0))));
}

function $train_step(_s_0, _event_0) {
  const _t_0 = _s_0["phase"];
  if (_t_0.$ === "Revealed") {
    const _c_0 = _s_0["challenge"];
    const _ls_0 = _s_0["legs"];
    const _gs_0 = _s_0["guesses"];
    const _a_0 = _s_0["assisted"];
    const _k_0 = _s_0["skipped"];
    const _r_0 = _s_0["result"];
    if (_event_0.$ === "Retry") {
      const _valid_0 = _event_0["valid"];
      return $retry_step({$: "Train", "phase": {$: "Revealed"}, "challenge": _c_0, "legs": _ls_0, "guesses": _gs_0, "assisted": _a_0, "skipped": _k_0, "result": _r_0}, _valid_0);
    } else if (_event_0.$ === "Finish") {
      return {$: "Some", "value": {$: "Train", "phase": {$: "Complete"}, "challenge": _c_0, "legs": _ls_0, "guesses": _gs_0, "assisted": _a_0, "skipped": _k_0, "result": _r_0}};
    } else if (_event_0.$ === "Next") {
      const _next_0 = _event_0["challenge"];
      return {$: "Some", "value": {$: "Train", "phase": {$: "Planning"}, "challenge": _next_0, "legs": {$: "Nil"}, "guesses": {$: "None"}, "assisted": {$: "None"}, "skipped": {$: "None"}, "result": {$: "None"}}};
    } else {
      return {$: "None"};
    }
  } else if (_t_0.$ === "Planning") {
    const _c_1 = _s_0["challenge"];
    const _ls_1 = _s_0["legs"];
    const _gs_1 = _s_0["guesses"];
    const _a_1 = _s_0["assisted"];
    const _k_1 = _s_0["skipped"];
    const _r_1 = _s_0["result"];
    if (_event_0.$ === "Next") {
      const _next_1 = _event_0["challenge"];
      return {$: "Some", "value": {$: "Train", "phase": {$: "Planning"}, "challenge": _next_1, "legs": {$: "Nil"}, "guesses": {$: "None"}, "assisted": {$: "None"}, "skipped": {$: "None"}, "result": {$: "None"}}};
    } else {
      return $planning_step({$: "Train", "phase": {$: "Planning"}, "challenge": _c_1, "legs": _ls_1, "guesses": _gs_1, "assisted": _a_1, "skipped": _k_1, "result": _r_1}, _event_0);
    }
  } else {
    return {$: "None"};
  }
}

function $String_eq(_a_0, _b_0) {
  return $Cmp_is_eq($$String_order(_a_0, _b_0));
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $List_take(_xs_0, _n_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    if (_n_0 == 0) {
      return {$: "Nil"};
    } else {
      const _p_0 = (_n_0 - 1);
      return {$: "Con", "head": _h_0, "tail": $$List_take(_t_0, _p_0)};
    }
  }
}

function $List_length(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk($$List_length(_t_0) + 1);
  }
}

function $Maybe_default(_m_0, _d_0) {
  if (_m_0.$ === "None") {
    return _d_0;
  } else {
    const _x_0 = _m_0["value"];
    return _x_0;
  }
}

function $List_append(_xs_0, _ys_0) {
  if (_xs_0.$ === "Nil") {
    return _ys_0;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Con", "head": _h_0, "tail": $$List_append(_t_0, _ys_0)};
  }
}

function $List_last(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Some", "value": $$List_last_go(_t_0, _h_0)};
  }
}

function $Nat_is_eq(_a_0, _b_0) {
  return $Cmp_is_eq(cmp_new(_a_0, _b_0));
}

function $Bool_not(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

function $String_is_empty(_s_0) {
  if (_s_0 === "") {
    return true;
  } else {
    return false;
  }
}

function $List_is_empty(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return true;
  } else {
    return false;
  }
}

function $Nat_is_le(_a_0, _b_0) {
  return $Cmp_is_le(cmp_new(_a_0, _b_0));
}

function $Cmp_is_eq(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $String_order(_a_0, _b_0) {
  return $String_order_go(_a_0, _b_0, {$: "EQ"});
}

function $List_last_go($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _last_0 = $1;
      if (_xs_0.$ === "Nil") {
        return _last_0;
      } else {
        const _h_0 = _xs_0["head"];
        const _t_0 = _xs_0["tail"];
        $0 = _t_0;
        $1 = _h_0;
        continue;
      }
    }
  }
}

function $Cmp_is_le(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $String_order_go($0, $1, $2) {
  for (;;) {
    {
      const _a_0 = $0;
      const _b_0 = $1;
      const _c_0 = $2;
      if (_a_0 === "") {
        if (_b_0 !== "") {
          if (_c_0.$ === "EQ") {
            return {$: "LT"};
          } else {
            return _c_0;
          }
        } else {
          return _c_0;
        }
      } else {
        const _t_1 = _a_0.slice(0, char_len(_a_0));
        const _x_0 = char_code(_t_1);
        const _t_2 = _a_0.slice(char_len(_a_0));
        if (_b_0 === "") {
          if (_c_0.$ === "EQ") {
            return {$: "GT"};
          } else {
            return _c_0;
          }
        } else {
          const _t_3 = _b_0.slice(0, char_len(_b_0));
          const _y_0 = char_code(_t_3);
          const _t2_0 = _b_0.slice(char_len(_b_0));
          if (_c_0.$ === "EQ") {
            $0 = _t_2;
            $1 = _t2_0;
            $2 = cmp_new(_x_0, _y_0);
            continue;
          } else {
            return _c_0;
          }
        }
      }
    }
  }
}

const $$String_eq = $String_eq;
const $$stop_eq = $stop_eq;
const $$leg_eq = $leg_eq;
const $$legs_eq = $legs_eq;
const $$without_guess = $without_guess;
const $$remove_leg = $remove_leg;
const $$List_length = $List_length;
const $$List_append = $List_append;
const $$Bool_and = $Bool_and;
const $$List_last = $List_last;
const $$max_guesses = $max_guesses;
const $$Nat_is_eq = $Nat_is_eq;
const $$empty_guesses = $empty_guesses;
const $$train_submit_result = $train_submit_result;
const $$String_is_empty = $String_is_empty;
const $$Bool_not = $Bool_not;
const $$List_is_empty = $List_is_empty;
const $$Nat_is_le = $Nat_is_le;
const $$last_eq = $last_eq;
const $$drop_last = $drop_last;
const $$truth = $truth;
const $$String_order = $String_order;
const $$List_take = $List_take;
const $$List_last_go = $List_last_go;export default {
  "max_guesses": run_lib(() => run_loop($max_guesses()), 0),
  "stop_eq": run_lib((a0,a1) => run_loop($stop_eq(a0,a1)), 2),
  "leg_eq": run_lib((a0,a1) => run_loop($leg_eq(a0,a1)), 2),
  "legs_eq": run_lib((a0,a1) => run_loop($legs_eq(a0,a1)), 2),
  "without_guess_put": run_lib((a0,a1,a2) => run_loop($without_guess_put(a0,a1,a2)), 3),
  "without_guess": run_lib((a0,a1) => run_loop($without_guess(a0,a1)), 2),
  "remove_leg": run_lib((a0,a1) => run_loop($remove_leg(a0,nat_in(a1))), 2),
  "drop_last": run_lib((a0) => run_loop($drop_last(a0)), 1),
  "empty_guesses": run_lib((a0) => run_loop($empty_guesses(a0)), 1),
  "truth": run_lib((a0) => run_loop($truth(a0)), 1),
  "choose": run_lib((a0,a1,a2) => run_loop($choose(a0,a1,a2)), 3),
  "train_add": run_lib((a0,a1,a2) => run_loop($train_add(a0,a1,a2)), 3),
  "train_remove": run_lib((a0,a1,a2) => run_loop($train_remove(a0,nat_in(a1),a2)), 3),
  "train_continue": run_lib((a0,a1,a2,a3) => run_loop($train_continue(a0,str_in(a1),a2,a3)), 4),
  "last_eq_option": run_lib((a0,a1) => run_loop($last_eq_option(a0,a1)), 2),
  "last_eq": run_lib((a0,a1) => run_loop($last_eq(a0,a1)), 2),
  "train_submit_result": run_lib((a0,a1,a2,a3,a4) => run_loop($train_submit_result(a0,a1,a2,a3,a4)), 5),
  "train_submit": run_lib((a0,a1,a2,a3,a4) => run_loop($train_submit(a0,a1,a2,a3,a4)), 5),
  "planning_step": run_lib((a0,a1) => run_loop($planning_step(a0,a1)), 2),
  "retry_step": run_lib((a0,a1) => run_loop($retry_step(a0,a1)), 2),
  "train_step": run_lib((a0,a1) => run_loop($train_step(a0,a1)), 2),
};
