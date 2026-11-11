// Geldlogik. Alle Beträge sind ganze Cent, es wird nie mit Kommazahlen gerechnet.

/** "12,50", "12.50", "1.234,5", "12 €" → Cent. Ungültige Eingaben ergeben null. */
export function parseEuro(input: string): number | null {
  let s = input.replace(/[\s€]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + parseInt((m[2] ?? '').padEnd(2, '0') || '0', 10);
}

/** 123456 → "1.234,56 €" */
export function formatEuro(cents: number, withSign = false): string {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = cents < 0 ? '−' : withSign && cents > 0 ? '+' : '';
  return `${sign}${euros},${(abs % 100).toString().padStart(2, '0')} €`;
}

/** Cent → Text für ein Eingabefeld ("12,50") */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${(cents % 100).toString().padStart(2, '0')}`;
}

export type Weighted = { userId: string; weight: number };

/**
 * Teilt einen Betrag nach Gewichten auf, auf den Cent genau.
 * Jeder bekommt den abgerundeten Anteil; die übrigen Cent gehen an die größten
 * Rundungsreste. Bei Gleichstand entscheidet eine Reihenfolge, die mit `seed`
 * rotiert, damit nicht immer dieselbe Person den Extra-Cent trägt.
 */
export function splitByWeights(amountCents: number, parts: Weighted[], seed = 0): Map<string, number> {
  const active = parts.filter((p) => p.weight > 0).sort((a, b) => (a.userId < b.userId ? -1 : 1));
  const result = new Map<string, number>();
  const total = active.reduce((s, p) => s + p.weight, 0);
  if (total === 0) return result;
  const n = active.length;
  const start = ((seed % n) + n) % n;
  const rows = active.map((p, i) => {
    const exact = amountCents * p.weight;
    return { userId: p.userId, cents: Math.floor(exact / total), rest: exact % total, order: (i - start + n) % n };
  });
  let left = amountCents - rows.reduce((s, r) => s + r.cents, 0);
  for (const r of [...rows].sort((a, b) => b.rest - a.rest || a.order - b.order)) {
    if (left <= 0) break;
    r.cents += 1;
    left -= 1;
  }
  for (const r of rows) result.set(r.userId, r.cents);
  return result;
}

export function splitEqually(amountCents: number, userIds: string[], seed = 0): Map<string, number> {
  return splitByWeights(amountCents, userIds.map((userId) => ({ userId, weight: 1 })), seed);
}

type ExpenseLike = { payer_id: string; amount_cents: number; shares: { user_id: string; share_cents: number }[] };
type SettlementLike = { from_user: string; to_user: string; amount_cents: number };

/** Saldo je Person: positiv = bekommt Geld, negativ = schuldet Geld. Summe ist immer 0. */
export function computeBalances(expenses: ExpenseLike[], settlements: SettlementLike[], userIds: string[] = []): Map<string, number> {
  const b = new Map<string, number>(userIds.map((id) => [id, 0]));
  const add = (id: string, c: number) => b.set(id, (b.get(id) ?? 0) + c);
  for (const e of expenses) {
    add(e.payer_id, e.amount_cents);
    for (const s of e.shares) add(s.user_id, -s.share_cents);
  }
  for (const s of settlements) {
    add(s.from_user, s.amount_cents);
    add(s.to_user, -s.amount_cents);
  }
  return b;
}

export type Transfer = { from: string; to: string; cents: number };

/** Schlägt möglichst wenige Überweisungen vor, die alle Salden auf 0 bringen (höchstens n − 1). */
export function settleUp(balances: Map<string, number>): Transfer[] {
  const byAmount = (a: [string, number], b: [string, number]) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
  const debtors = [...balances].filter(([, c]) => c < 0).map(([id, c]) => [id, -c] as [string, number]).sort(byAmount);
  const creditors = [...balances].filter(([, c]) => c > 0).map(([id, c]) => [id, c] as [string, number]).sort(byAmount);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i][1], creditors[j][1]);
    transfers.push({ from: debtors[i][0], to: creditors[j][0], cents });
    debtors[i][1] -= cents;
    creditors[j][1] -= cents;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  return transfers;
}
