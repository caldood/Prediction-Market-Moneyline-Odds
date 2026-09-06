/*
 * ODDS|CALC — pure odds math and parsers.
 *
 * Plain script (no build step): exposes `Odds` on the global object for the
 * browser and on `module.exports` for Node, so the same file backs both the
 * page and the test suite.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Odds = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // American odds are never smaller than ±100. The upper bound is generous so a
  // 1¢ prediction-market contract (+9900) still round-trips.
  const MIN_ABS = 100;
  const MAX_ABS = 10000;

  // ── CORE CONVERSIONS ─────────────────────────────────────────────────────
  function impliedProb(a) {
    return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
  }
  function toDecimal(a) {
    return a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
  }
  function probToDecimal(p) { return 1 / p; }
  function decimalToProb(d) { return 1 / d; }
  // p ≤ 0.5 → positive odds; p > 0.5 → negative odds. Returns a float; callers
  // round for display. p = 0.5 → +100.
  function probToAmerican(p) {
    return p > 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
  }
  function decimalToAmerican(d) {
    return d >= 2 ? (d - 1) * 100 : -100 / (d - 1);
  }

  // Best bookmaker-style fraction for x ≥ 0, in order of preference:
  //   1. a familiar small denominator (≤ 12) within `relTol` of x  (1.91 → 10/11)
  //   2. an exact match up to maxDen                               (-105 → 20/21)
  //   3. the smallest denominator within `relTol`
  //   4. the closest fraction found
  // so -110 gives 10/11 rather than 91/100.
  function bestFraction(x, maxDen, relTol) {
    maxDen = maxDen || 100;
    relTol = relTol == null ? 0.005 : relTol;
    let familiar = null, exact = null, within = null, best = null;
    for (let den = 1; den <= maxDen; den++) {
      const num = Math.round(x * den);
      if (num < 1) continue;
      const err = Math.abs(x - num / den);
      const ok = err <= relTol * x;
      if (!familiar && den <= 12 && ok) familiar = { num, den };
      if (!exact && err < 1e-9) exact = { num, den };
      if (!within && ok) within = { num, den };
      if (!best || err < best.err) best = { num, den, err };
    }
    const pick = familiar || exact || within || best;
    if (!pick) return { num: 0, den: 1 };
    const g = gcd(pick.num, pick.den);
    return { num: pick.num / g, den: pick.den / g };
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function fractional(a) {
    const f = bestFraction(toDecimal(a) - 1);
    return f.num + '/' + f.den;
  }
  function fractionalFromProb(p) {
    const f = bestFraction(probToDecimal(p) - 1);
    return f.num + '/' + f.den;
  }

  // ── VIG ──────────────────────────────────────────────────────────────────
  function overround(probs) { return probs.reduce((s, p) => s + p, 0); }
  // Proportional (multiplicative) de-vig.
  function removeVig(probs) {
    const t = overround(probs);
    return probs.map(p => p / t);
  }
  // Single-line de-vig under an assumed book vig, expressed as overround − 1
  // (0.0476 for a -110/-110 market). Equivalent to removeVig when the vig is
  // the market's true overround.
  function fairFromHold(raw, hold) { return raw / (1 + hold); }

  // ── EDGE / KELLY ─────────────────────────────────────────────────────────
  // Binary contract priced at `price` (0–1) paying $1. `p` is your fair prob.
  function kellyYes(p, price) { return (p - price) / (1 - price); }
  function kellyNo(p, price)  { return (price - p) / price; }
  // Expected return per $1 staked on YES.
  function evYes(p, price)    { return p / price - 1; }
  function evNo(p, price)     { return (1 - p) / (1 - price) - 1; }

  // ── LABELS ───────────────────────────────────────────────────────────────
  function profile(a) {
    if (a === 100 || a === -100) return 'EVEN MONEY';
    if (a <= -1000) return 'MEGA FAVORITE';
    if (a <= -400)  return 'HEAVY FAVORITE';
    if (a <= -250)  return 'STRONG FAVORITE';
    if (a <= -175)  return 'FAVORITE';
    if (a <= -130)  return 'MODERATE FAVORITE';
    if (a <= -115)  return 'SLIGHT FAVORITE';
    if (a <  115)   return "PICK'EM / NEAR EVEN";
    if (a <= 130)   return 'SLIGHT UNDERDOG';
    if (a <= 175)   return 'MODERATE UNDERDOG';
    if (a <= 250)   return 'UNDERDOG';
    if (a <= 400)   return 'BIG UNDERDOG';
    if (a <  1000)  return 'LONG SHOT';
    return 'MEGA LONG SHOT';
  }

  // ── FORMATTING ───────────────────────────────────────────────────────────
  function formatAmerican(a) {
    let r = Math.round(a);
    if (r === -100) r = 100;
    return (r > 0 ? '+' : '') + r;
  }
  // Fixed decimals with trailing zeros trimmed: trimNum(61.5, 2) → "61.5".
  function trimNum(x, decimals) {
    return String(parseFloat(x.toFixed(decimals)));
  }

  // ── SLIDER / STEP SCALE ──────────────────────────────────────────────────
  // American odds have a hole between -100 and +100. This "linear" scale
  // closes it: +100 ↔ 0, +105 ↔ 5, -105 ↔ -5, so sliders and arrow keys never
  // land on invalid odds.
  function americanToLinear(a) { return a > 0 ? a - 100 : a + 100; }
  function linearToAmerican(v) { return v >= 0 ? v + 100 : v - 100; }
  function stepAmerican(a, delta) {
    const lim = MAX_ABS - 100;
    const v = Math.max(-lim, Math.min(lim, americanToLinear(a) + delta));
    return linearToAmerican(v);
  }

  // ── PARSERS ──────────────────────────────────────────────────────────────
  // Each returns { val } on success, { err } on failure, or { partial: true }
  // while the user is mid-keystroke.
  function parseAmerican(raw) {
    const s = String(raw).trim();
    if (!s || s === '+' || s === '-') return { partial: true };
    if (!/^[+-]?\d+$/.test(s)) return { err: 'Enter American odds, e.g. +150 or -200' };
    const n = parseInt(s, 10);
    if (Math.abs(n) < MIN_ABS) return { err: 'American odds are always at least ±100' };
    if (Math.abs(n) > MAX_ABS) return { err: `Range: -${MAX_ABS} to +${MAX_ABS}` };
    return { val: n };
  }
  function parseDecimal(raw) {
    const s = String(raw).trim().replace(/x$/i, '');
    if (!s || s === '.') return { partial: true };
    if (!/^\d*\.?\d*$/.test(s)) return { err: 'Enter decimal odds, e.g. 2.50' };
    const d = parseFloat(s);
    if (isNaN(d) || d <= 1) return { err: 'Decimal odds must be greater than 1.00' };
    if (d > 101) return { err: 'Decimal odds above 101.00 are out of range' };
    return { val: d };
  }
  function parseProbPct(raw) {
    const s = String(raw).trim().replace(/%$/, '').trim();
    if (!s || s === '.') return { partial: true };
    if (!/^\d*\.?\d*$/.test(s)) return { err: 'Enter a win probability in percent, e.g. 62.5' };
    const v = parseFloat(s);
    if (isNaN(v) || v <= 0 || v >= 100) return { err: 'Probability must be between 0% and 100%' };
    if (v < 100 / (MAX_ABS + 100) * 100 || v > MAX_ABS / (MAX_ABS + 100) * 100) {
      return { err: 'Probability out of supported range (0.99%–99.01%)' };
    }
    return { val: v / 100 };
  }
  // Accepts "0.62", ".62", "62", "62¢", "62c", "62%", "$0.62". Values above 1
  // are read as cents / percent.
  function parsePrice(raw) {
    const s = String(raw).trim().replace(/[$¢c%\s]/gi, '');
    if (!s || s === '.') return { partial: true };
    if (!/^\d*\.?\d*$/.test(s)) return { err: 'Enter a price like 0.62 or 62¢' };
    let v = parseFloat(s);
    if (isNaN(v)) return { err: 'Enter a price like 0.62 or 62¢' };
    if (v > 1) v = v / 100;
    if (v <= 0 || v >= 1) return { err: 'Price must be between 0 and 1 (1¢–99¢)' };
    if (v < 100 / (MAX_ABS + 100) || v > MAX_ABS / (MAX_ABS + 100)) {
      return { err: 'Price out of supported range (0.0099–0.9901)' };
    }
    return { val: v };
  }

  // ── CLOCK ────────────────────────────────────────────────────────────────
  // New York time with the correct EST/EDT label.
  const nyFmt = typeof Intl !== 'undefined' && Intl.DateTimeFormat
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
      })
    : null;
  function nyClock(date) {
    if (!nyFmt) return date.toTimeString().slice(0, 8);
    // Some engines render midnight as "24:00:00"; normalise to "00".
    return nyFmt.format(date).replace(/^24:/, '00:');
  }

  return {
    MIN_ABS, MAX_ABS,
    impliedProb, toDecimal, probToDecimal, decimalToProb, probToAmerican, decimalToAmerican,
    bestFraction, fractional, fractionalFromProb,
    overround, removeVig, fairFromHold,
    kellyYes, kellyNo, evYes, evNo,
    profile, formatAmerican, trimNum,
    americanToLinear, linearToAmerican, stepAmerican,
    parseAmerican, parseDecimal, parseProbPct, parsePrice,
    nyClock,
  };
});
