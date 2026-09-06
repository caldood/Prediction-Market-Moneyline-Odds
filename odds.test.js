const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('./odds.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

test('implied probability', () => {
  close(O.impliedProb(100), 0.5);
  close(O.impliedProb(-100), 0.5);
  close(O.impliedProb(150), 0.4);
  close(O.impliedProb(-200), 2 / 3);
  close(O.impliedProb(-110), 110 / 210);
});

test('decimal and american round-trip', () => {
  close(O.toDecimal(150), 2.5);
  close(O.toDecimal(-200), 1.5);
  for (const a of [-1000, -250, -110, -100, 100, 120, 350, 9900]) {
    close(O.decimalToAmerican(O.toDecimal(a)), a === -100 ? 100 : a, 1e-9);
    close(O.probToAmerican(O.impliedProb(a)), a === -100 ? 100 : a, 1e-9);
  }
});

test('probability to american picks the right side of even', () => {
  close(O.probToAmerican(0.5), 100);
  close(O.probToAmerican(0.62), -163.157894736842, 1e-9);
  close(O.probToAmerican(0.4), 150);
  assert.equal(O.formatAmerican(O.probToAmerican(0.62)), '-163');
  assert.equal(O.formatAmerican(-100), '+100');
  assert.equal(O.formatAmerican(-100.4), '+100');
});

test('fractional odds use bookmaker-style small denominators', () => {
  assert.equal(O.fractional(-110), '10/11');
  assert.equal(O.fractional(-105), '20/21');
  assert.equal(O.fractional(-200), '1/2');
  assert.equal(O.fractional(-150), '2/3');
  assert.equal(O.fractional(150), '3/2');
  assert.equal(O.fractional(100), '1/1');
  assert.equal(O.fractional(-1000), '1/10');
  assert.equal(O.fractional(-10000), '1/100');
  assert.equal(O.fractional(9900), '99/1');
  assert.equal(O.fractional(-137), '8/11');
  // Rounded decimals still map back to the familiar fraction.
  assert.equal(O.fractionalFromProb(O.decimalToProb(1.91)), '10/11');
  assert.equal(O.fractionalFromProb(0.62), '19/31');
});

test('vig removal is proportional', () => {
  const pA = O.impliedProb(-110), pB = O.impliedProb(-110);
  close(O.overround([pA, pB]), 220 / 210);
  const [fA, fB] = O.removeVig([pA, pB]);
  close(fA, 0.5); close(fB, 0.5);
  close(O.fairFromHold(pA, 220 / 210 - 1), 0.5);
  const three = O.removeVig([0.5, 0.3, 0.25]);
  close(three.reduce((s, x) => s + x, 0), 1);
});

test('kelly and expected value for binary contracts', () => {
  close(O.kellyYes(0.6, 0.5), 0.2);
  close(O.kellyNo(0.4, 0.5), 0.2);
  close(O.evYes(0.6, 0.5), 0.2);
  close(O.evNo(0.4, 0.5), 0.2);
  assert.ok(O.kellyYes(0.4, 0.5) < 0);
});

test('profile labels are consistent and cover the range', () => {
  assert.equal(O.profile(100), 'EVEN MONEY');
  assert.equal(O.profile(-100), 'EVEN MONEY');
  assert.equal(O.profile(-110), "PICK'EM / NEAR EVEN");
  assert.equal(O.profile(110), "PICK'EM / NEAR EVEN");
  assert.equal(O.profile(150), 'MODERATE UNDERDOG');
  assert.equal(O.profile(-150), 'MODERATE FAVORITE');
  assert.equal(O.profile(-500), 'HEAVY FAVORITE');
  assert.equal(O.profile(500), 'LONG SHOT');
  assert.equal(O.profile(1000), 'MEGA LONG SHOT');
  assert.equal(O.profile(-1000), 'MEGA FAVORITE');
});

test('linear scale closes the -100/+100 gap', () => {
  assert.equal(O.linearToAmerican(0), 100);
  assert.equal(O.linearToAmerican(-1), -101);
  assert.equal(O.americanToLinear(-100), 0);
  assert.equal(O.stepAmerican(-105, 5), 100);
  assert.equal(O.stepAmerican(100, -5), -105);
  assert.equal(O.stepAmerican(-100, 5), 105);
  assert.equal(O.stepAmerican(9998, 50), 10000);
  assert.equal(O.stepAmerican(-9998, -50), -10000);
  for (let v = -900; v <= 900; v++) {
    assert.ok(Math.abs(O.linearToAmerican(v)) >= 100, `slider value ${v} maps to invalid odds`);
  }
});

test('parseAmerican rejects invalid odds', () => {
  assert.deepEqual(O.parseAmerican('+150'), { val: 150 });
  assert.deepEqual(O.parseAmerican('150'), { val: 150 });
  assert.deepEqual(O.parseAmerican('-100'), { val: -100 });
  assert.deepEqual(O.parseAmerican('-'), { partial: true });
  assert.deepEqual(O.parseAmerican(''), { partial: true });
  assert.ok(O.parseAmerican('0').err);
  assert.ok(O.parseAmerican('-50').err);
  assert.ok(O.parseAmerican('+99').err);
  assert.ok(O.parseAmerican('-10001').err);
  assert.ok(O.parseAmerican('abc').err);
  assert.ok(O.parseAmerican('1e3').err);
  assert.ok(O.parseAmerican('150.5').err);
});

test('parsePrice accepts cents, percent, and decimals', () => {
  close(O.parsePrice('0.62').val, 0.62);
  close(O.parsePrice('.62').val, 0.62);
  close(O.parsePrice('62').val, 0.62);
  close(O.parsePrice('62¢').val, 0.62);
  close(O.parsePrice('62c').val, 0.62);
  close(O.parsePrice('62%').val, 0.62);
  close(O.parsePrice('$0.62').val, 0.62);
  assert.deepEqual(O.parsePrice(''), { partial: true });
  assert.ok(O.parsePrice('0').err);
  assert.ok(O.parsePrice('1').err);
  assert.ok(O.parsePrice('100').err);
  assert.ok(O.parsePrice('-0.5').err);
});

test('parseDecimal and parseProbPct', () => {
  close(O.parseDecimal('2.5').val, 2.5);
  close(O.parseDecimal('1.91x').val, 1.91);
  assert.ok(O.parseDecimal('1').err);
  assert.ok(O.parseDecimal('0.5').err);
  assert.deepEqual(O.parseDecimal('.'), { partial: true });
  close(O.parseProbPct('62.5').val, 0.625);
  close(O.parseProbPct('40%').val, 0.4);
  assert.ok(O.parseProbPct('0').err);
  assert.ok(O.parseProbPct('100').err);
});

test('clock reports New York time with EST/EDT', () => {
  const winter = O.nyClock(new Date('2026-01-15T17:00:00Z'));
  const summer = O.nyClock(new Date('2026-07-15T17:00:00Z'));
  assert.equal(winter, '12:00:00 EST');
  assert.equal(summer, '13:00:00 EDT');
  const midnight = O.nyClock(new Date('2026-01-15T05:00:00Z'));
  assert.equal(midnight, '00:00:00 EST');
});

test('trimNum drops trailing zeros', () => {
  assert.equal(O.trimNum(61.5, 2), '61.5');
  assert.equal(O.trimNum(0.62, 4), '0.62');
  assert.equal(O.trimNum(40, 2), '40');
});
