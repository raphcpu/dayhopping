import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBalances, formatEuro, parseEuro, settleUp, splitByWeights, splitEqually } from './money.ts';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

test('parseEuro versteht deutsche Eingaben', () => {
  assert.equal(parseEuro('12,50'), 1250);
  assert.equal(parseEuro('12,5'), 1250);
  assert.equal(parseEuro('12'), 1200);
  assert.equal(parseEuro('12.50'), 1250);
  assert.equal(parseEuro('1.234,56 €'), 123456);
  assert.equal(parseEuro('1.234'), 123400);
  assert.equal(parseEuro('0,07'), 7);
  assert.equal(parseEuro('19,99'), 1999);
  assert.equal(parseEuro('12,345'), null);
  assert.equal(parseEuro('abc'), null);
  assert.equal(parseEuro(''), null);
  assert.equal(parseEuro('-5'), null);
});

test('formatEuro', () => {
  assert.equal(formatEuro(123456), '1.234,56 €');
  assert.equal(formatEuro(7), '0,07 €');
  assert.equal(formatEuro(-1250), '−12,50 €');
  assert.equal(formatEuro(500, true), '+5,00 €');
});

test('gleiche Aufteilung geht immer centgenau auf', () => {
  assert.deepEqual([...splitEqually(1000, ['a', 'b', 'c']).values()].sort(), [333, 333, 334]);
  assert.deepEqual([...splitEqually(100, ['a', 'b', 'c', 'd']).values()], [25, 25, 25, 25]);
  assert.deepEqual([...splitEqually(1, ['a', 'b', 'c']).values()].sort(), [0, 0, 1]);
  for (let amount = 1; amount <= 2000; amount += 7) {
    for (let n = 1; n <= 9; n++) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`);
      const parts = splitEqually(amount, ids, amount);
      assert.equal(sum(parts), amount);
      const v = [...parts.values()];
      assert.ok(Math.max(...v) - Math.min(...v) <= 1);
    }
  }
});

test('der Extra-Cent wandert mit dem Seed', () => {
  const who = (seed: number) => [...splitEqually(1000, ['a', 'b', 'c'], seed)].find(([, c]) => c === 334)![0];
  assert.deepEqual([who(0), who(1), who(2), who(3)], ['a', 'b', 'c', 'a']);
});

test('Aufteilung nach Anteilen', () => {
  const p = splitByWeights(1000, [{ userId: 'a', weight: 2 }, { userId: 'b', weight: 1 }]);
  assert.deepEqual([p.get('a'), p.get('b')], [667, 333]);
  const q = splitByWeights(999, [{ userId: 'a', weight: 3 }, { userId: 'b', weight: 2 }, { userId: 'c', weight: 0 }]);
  assert.equal(sum(q), 999);
  assert.equal(q.has('c'), false);
  for (let amount = 1; amount < 500; amount += 13) {
    const r = splitByWeights(amount, [{ userId: 'a', weight: 5 }, { userId: 'b', weight: 3 }, { userId: 'c', weight: 1 }], amount);
    assert.equal(sum(r), amount);
  }
});

test('Salden und Ausgleich', () => {
  const expenses = [
    { payer_id: 'anna', amount_cents: 3000, shares: [{ user_id: 'anna', share_cents: 1000 }, { user_id: 'ben', share_cents: 1000 }, { user_id: 'cem', share_cents: 1000 }] },
    { payer_id: 'ben', amount_cents: 1000, shares: [{ user_id: 'anna', share_cents: 500 }, { user_id: 'ben', share_cents: 500 }] },
  ];
  const b = computeBalances(expenses, [], ['anna', 'ben', 'cem', 'dana']);
  assert.deepEqual(Object.fromEntries(b), { anna: 1500, ben: -500, cem: -1000, dana: 0 });
  assert.equal(sum(b), 0);
  const t = settleUp(b);
  assert.deepEqual(t, [{ from: 'cem', to: 'anna', cents: 1000 }, { from: 'ben', to: 'anna', cents: 500 }]);

  const after = computeBalances(expenses, [{ from_user: 'cem', to_user: 'anna', amount_cents: 1000 }]);
  assert.deepEqual(settleUp(after), [{ from: 'ben', to: 'anna', cents: 500 }]);
});

test('Ausgleich bringt beliebige Salden auf 0', () => {
  let x = 42;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648);
  for (let round = 0; round < 200; round++) {
    const n = 2 + (rnd() % 8);
    const b = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      const c = (rnd() % 20001) - 10000;
      b.set(`u${i}`, c);
      total += c;
    }
    b.set(`u${n - 1}`, -total);
    const transfers = settleUp(b);
    assert.ok(transfers.length <= n - 1);
    for (const t of transfers) {
      assert.ok(t.cents > 0);
      b.set(t.from, b.get(t.from)! + t.cents);
      b.set(t.to, b.get(t.to)! - t.cents);
    }
    assert.ok([...b.values()].every((c) => c === 0));
  }
});
