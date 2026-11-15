import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMode, type OpenCheckin } from './trackingMode.ts';

const station: OpenCheckin = { station_id: 's', lat: 53.55, lng: 9.99, radius_m: 60 };
// ~1 m Länge bei 53,55° Breite ≈ 0,0000151°
const east = (m: number, accuracy: number | null = 10) => ({ latitude: 53.55, longitude: 9.99 + m * 0.0000151, accuracy });

test('nicht eingecheckt: unterwegs', () => {
  assert.equal(nextMode(null, east(0)), 'unterwegs');
});
test('eingecheckt und drin: sparen', () => {
  assert.equal(nextMode(station, east(20)), 'sparen');
  assert.equal(nextMode(station, east(55)), 'sparen');
});
test('genau gemessen draußen: sofort unterwegs', () => {
  assert.equal(nextMode(station, east(75, 15)), 'unterwegs');
});
test('schwaches GPS drinnen (150 m ungenau) bleibt im Sparmodus', () => {
  assert.equal(nextMode(station, east(90, 150)), 'sparen');
  assert.equal(nextMode(station, east(140, 150)), 'sparen');
});
test('ungenau, aber eindeutig weit weg: unterwegs', () => {
  assert.equal(nextMode(station, east(250, 150)), 'unterwegs');
});
test('kein Standort (z. B. Neustart): Check-in entscheidet', () => {
  assert.equal(nextMode(station, null), 'sparen');
  assert.equal(nextMode(null, null), 'unterwegs');
});
