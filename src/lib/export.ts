import { shareHtmlAsPdf, shareTextFile } from './exportShare';
import { formatDateTime, formatDay, formatDuration, formatTime } from './format';
import { computeBalances, formatEuro, settleUp } from './money';
import { memberStats, stationStats } from './stats';
import type { Checkin, Expense, Member, Round, Settlement, Station } from './types';

export type ExportData = {
  round: Round; members: Member[]; stations: Station[]; checkins: Checkin[];
  expenses: Expense[]; settlements: Settlement[];
};

const fileName = (round: Round, suffix: string) =>
  `DayHop-${round.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}-${suffix}`;

function nameOf(d: ExportData) {
  const map = new Map(d.members.map((m) => [m.user_id, m.profile.display_name]));
  return (id: string | null) => (id && map.get(id)) || 'Ehemaliges Mitglied';
}

// Semikolon und BOM, damit Excel die Datei auf Deutsch direkt richtig öffnet.
function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const euroCsv = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)},${(Math.abs(cents) % 100).toString().padStart(2, '0')}`;


export function costsCsv(d: ExportData): string {
  const name = nameOf(d);
  const stationName = new Map(d.stations.map((s) => [s.id, s.name]));
  const ids = allUserIds(d);
  const rows: (string | number)[][] = [
    ['Datum', 'Ausgabe', 'Station', 'Bezahlt von', 'Betrag (EUR)', ...ids.map((id) => `Anteil ${name(id)}`)],
  ];
  for (const e of [...d.expenses].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const share = new Map(e.shares.map((s) => [s.user_id, s.share_cents]));
    rows.push([
      formatDateTime(e.created_at), e.title, (e.station_id && stationName.get(e.station_id)) || '', name(e.payer_id),
      euroCsv(e.amount_cents), ...ids.map((id) => euroCsv(share.get(id) ?? 0)),
    ]);
  }
  rows.push([]);
  rows.push(['Ausgleichszahlungen (erledigt)']);
  rows.push(['Datum', 'Von', 'An', 'Betrag (EUR)']);
  for (const s of d.settlements) rows.push([formatDateTime(s.created_at), name(s.from_user), name(s.to_user), euroCsv(s.amount_cents)]);
  rows.push([]);
  rows.push(['Saldo']);
  rows.push(['Person', 'Saldo (EUR)']);
  const balances = computeBalances(d.expenses, d.settlements, ids);
  for (const id of ids) rows.push([name(id), euroCsv(balances.get(id) ?? 0)]);
  rows.push([]);
  rows.push(['Offene Überweisungen']);
  rows.push(['Von', 'An', 'Betrag (EUR)']);
  for (const t of settleUp(balances)) rows.push([name(t.from), name(t.to), euroCsv(t.cents)]);
  return toCsv(rows);
}

export function visitsCsv(d: ExportData): string {
  const name = nameOf(d);
  const stationName = new Map(d.stations.map((s) => [s.id, s.name]));
  const rows: (string | number)[][] = [['Station', 'Person', 'Ankunft', 'Abschied', 'Dauer (Min.)', 'Check-in']];
  for (const c of [...d.checkins].sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))) {
    rows.push([
      stationName.get(c.station_id) ?? '', name(c.user_id), formatDateTime(c.arrived_at),
      c.left_at ? formatDateTime(c.left_at) : '',
      c.left_at ? Math.round((new Date(c.left_at).getTime() - new Date(c.arrived_at).getTime()) / 60000) : '',
      c.automatic ? 'automatisch' : 'manuell',
    ]);
  }
  return toCsv(rows);
}

function allUserIds(d: ExportData): string[] {
  const ids = new Set(d.members.map((m) => m.user_id));
  for (const e of d.expenses) {
    ids.add(e.payer_id);
    for (const s of e.shares) ids.add(s.user_id);
  }
  for (const s of d.settlements) {
    ids.add(s.from_user);
    ids.add(s.to_user);
  }
  return [...ids];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function reportHtml(d: ExportData): string {
  const name = nameOf(d);
  const ids = allUserIds(d);
  const balances = computeBalances(d.expenses, d.settlements, ids);
  const transfers = settleUp(balances);
  const total = d.expenses.reduce((s, e) => s + e.amount_cents, 0);
  const stationName = new Map(d.stations.map((s) => [s.id, s.name]));
  const sStats = stationStats(d.stations, d.checkins);
  const mStats = memberStats(d.members, d.checkins);
  const row = (cells: string[], cls = '') => `<tr class="${cls}">${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const head = (cells: string[]) => `<tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr>`;
  const num = (s: string) => `<span class="num">${s}</span>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1E1B16; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 22pt; margin: 0; } h2 { font-size: 13pt; margin: 22px 0 6px; color: #C63F1F; }
  .sub { color: #7B7265; margin: 2px 0 0; }
  table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 9pt; color: #7B7265; font-weight: 600; border-bottom: 1.5px solid #1E1B16; padding: 4px 6px; }
  td { padding: 5px 6px; border-bottom: 0.5px solid #E7DDCD; vertical-align: top; }
  .num { display: block; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sum td { font-weight: 700; border-top: 1.5px solid #1E1B16; border-bottom: none; }
  .small { font-size: 9pt; color: #7B7265; }
  tr { page-break-inside: avoid; }
  </style></head><body>
  <h1>${esc(d.round.name)}</h1>
  <p class="sub">${formatDay(d.round.day)} · ${d.members.length} Personen · ${d.stations.length} Stationen</p>

  <h2>Route</h2>
  <table>${head(['#', 'Station', 'Geplant', 'Besucht von', 'Ø Aufenthalt'])}
  ${sStats.map((s, i) => row([String(i + 1), `${esc(s.station.name)}${s.station.address ? `<div class="small">${esc(s.station.address)}</div>` : ''}`,
      s.station.planned_at ? formatTime(s.station.planned_at) : '–', `${s.visitors.length} von ${d.members.length}`,
      s.avgStayMs != null ? formatDuration(s.avgStayMs) : '–'])).join('')}</table>

  <h2>Besuche je Person</h2>
  <table>${head(['Person', 'Stationen', 'Zeit in Stationen'])}
  ${mStats.map((m) => row([esc(name(m.userId)), `${m.visited} von ${d.stations.length}`, formatDuration(m.totalStayMs)])).join('')}</table>

  <h2>Ausgaben</h2>
  ${d.expenses.length === 0 ? '<p class="small">Keine Ausgaben erfasst.</p>' : `<table>${head(['Ausgabe', 'Bezahlt von', 'Aufgeteilt auf', num('Betrag')])}
  ${[...d.expenses].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => row([
      `${esc(e.title)}<div class="small">${formatDateTime(e.created_at)}${e.station_id && stationName.get(e.station_id) ? ' · ' + esc(stationName.get(e.station_id)!) : ''}</div>`,
      esc(name(e.payer_id)),
      `<span class="small">${e.shares.filter((s) => s.share_cents > 0).map((s) => `${esc(name(s.user_id))} ${formatEuro(s.share_cents)}`).join(', ')}</span>`,
      num(formatEuro(e.amount_cents))])).join('')}
  ${row(['Gesamt', '', '', num(formatEuro(total))], 'sum')}</table>`}

  <h2>Salden</h2>
  <table>${head(['Person', num('Bezahlt'), num('Eigener Anteil'), num('Saldo')])}
  ${ids.map((id) => {
    const paid = d.expenses.filter((e) => e.payer_id === id).reduce((s, e) => s + e.amount_cents, 0);
    const share = d.expenses.reduce((s, e) => s + (e.shares.find((x) => x.user_id === id)?.share_cents ?? 0), 0);
    return row([esc(name(id)), num(formatEuro(paid)), num(formatEuro(share)), num(formatEuro(balances.get(id) ?? 0, true))]);
  }).join('')}</table>
  ${d.settlements.length ? `<p class="small">Bereits ausgeglichen: ${d.settlements.map((s) => `${esc(name(s.from_user))} → ${esc(name(s.to_user))} ${formatEuro(s.amount_cents)}`).join(' · ')}</p>` : ''}

  <h2>Wer überweist wem?</h2>
  ${transfers.length === 0 ? '<p>Alles ausgeglichen.</p>' : `<table>${head(['Von', 'An', num('Betrag')])}
  ${transfers.map((t) => row([esc(name(t.from)), esc(name(t.to)), num(formatEuro(t.cents))])).join('')}</table>`}

  <p class="small" style="margin-top:28px">Erstellt mit DayHop am ${formatDateTime(new Date().toISOString())}</p>
  </body></html>`;
}

export const sharePdf = (d: ExportData) => shareHtmlAsPdf(`${fileName(d.round, 'Bericht')}.pdf`, reportHtml(d));

export const shareCostsCsv = (d: ExportData) => shareTextFile(`${fileName(d.round, 'Kosten')}.csv`, costsCsv(d), 'text/csv');
export const shareVisitsCsv = (d: ExportData) => shareTextFile(`${fileName(d.round, 'Besuche')}.csv`, visitsCsv(d), 'text/csv');
