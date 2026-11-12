// Prüft schema.sql in einem eingebetteten Postgres (PGlite): Zugriffsregeln, Auto-Check-in, Kosten, Push.
// Supabase-eigene Teile (auth, storage, pg_net, Realtime) sind hier nur als Attrappen vorhanden.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage; create schema net;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table net.calls (url text, body jsonb);
create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as $$ insert into net.calls values (url, body); select 1::bigint $$;
create publication supabase_realtime;
`);
// Mit SCHEMA_V1=<Datei> wird der Update-Pfad geprüft: alte Fassung + update-von-version-1.sql
const read = (f) => fs.readFileSync(f, 'utf8').replace(/create extension[^;]*;/g, '');
if (process.env.SCHEMA_V1) {
  await db.exec(`alter table auth.users add primary key (id)`).catch(() => {});
  await db.exec(read(process.env.SCHEMA_V1));
  await db.exec(read(new URL('../update-von-version-1.sql', import.meta.url)));
} else {
  await db.exec(read(new URL('../schema.sql', import.meta.url)));
}
await db.exec(`grant usage on schema public, auth, storage to authenticated; grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated; revoke all on function public.send_push(uuid, uuid, text, text, boolean, jsonb, boolean) from public, anon, authenticated;`);
const mk = async (n) => (await q(`insert into auth.users(email, raw_user_meta_data) values ($1, $2) returning id`, [n + '@x.de', { display_name: n }]))[0].id;
const [anna, ben, cem, eve] = [await mk('Anna'), await mk('Ben'), await mk('Cem'), await mk('Eve')];
const as = async (uid) => { await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`); };
const ok = (c, m) => { if (!c) { console.error('FEHLER:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const fails = async (fn, m) => { try { await fn(); ok(false, m); } catch (e) { ok(true, m + ' → ' + e.message); } };

console.log(await q(`select display_name, color from profiles`));
await as(anna);
const round = (await q(`select create_round('Sommerhop', '2026-07-04') as id`))[0].id;
const code = (await q(`select invite_code from rounds`))[0].invite_code;
ok(/^[A-Z2-9]{6}$/.test(code), 'Einladungscode ' + code);
await as(ben); await q(`select join_round($1)`, [code.toLowerCase()]);
await q(`select register_push_token('ExponentPushToken[ben]', 'ios')`);
await as(cem); await q(`select join_round($1)`, [code]); await q(`select join_round($1)`, [code]);
await q(`select register_push_token('ExponentPushToken[cem]', 'android')`);
ok((await q(`select count(*)::int c from round_members`))[0].c === 3, '3 Mitglieder, doppelter Beitritt ignoriert');
await as(eve);
ok((await q(`select count(*)::int c from rounds`))[0].c === 0, 'Fremde sehen die Runde nicht');
ok((await q(`select count(*)::int c from profiles`))[0].c === 1, 'Fremde sehen nur ihr eigenes Profil');
await fails(() => q(`insert into messages(round_id,user_id,body) values ($1,$2,'hi')`, [round, eve]), 'Fremde können nicht schreiben');
await as(ben);
await fails(() => q(`insert into stations(round_id,position,name,lat,lng) values ($1,1,'X',1,1)`, [round]), 'Mitglied kann keine Station anlegen');
await fails(() => q(`insert into messages(round_id,user_id,kind,body) values ($1,$2,'announcement','x')`, [round, ben]), 'Mitglied kann keine Durchsage senden');
await as(anna);
const s1 = (await q(`insert into stations(round_id,position,name,lat,lng) values ($1,1,'Café Elbe',53.5500,9.9900) returning id`, [round]))[0].id;
const s2 = (await q(`insert into stations(round_id,position,name,lat,lng) values ($1,2,'Bar Alster',53.5600,10.0000) returning id`, [round]))[0].id;
await q(`select reorder_stations($1, $2)`, [round, [s2, s1]]);
ok((await q(`select name from stations order by position`))[0].name === 'Bar Alster', 'Stationen umsortiert');
await q(`select reorder_stations($1, $2)`, [round, [s1, s2]]);

await as(anna);
ok((await q(`select status from rounds where id = $1`, [round]))[0].status === 'aktiv', 'Neuer Hop ist sofort aktiv');
await as(ben);
const t = (m) => new Date(Date.now() - (60 - m) * 60000).toISOString();
const rep = async (lat, lng, acc, m) => (await q(`select report_location($1,$2,$3,null,null,$4)`, [lat, lng, acc, t(m)]))[0].report_location;
ok(await rep(53.5500, 9.9902, 10, 0) === 1, 'Ortung zählt 1 laufenden Hop');
let c = await q(`select * from checkins`);
ok(c.length === 1 && c[0].station_id === s1 && c[0].left_at === null, 'Auto-Check-in Station 1');
await rep(53.5500, 9.9903, 10, 1);
ok((await q(`select count(*)::int c from checkins`))[0].c === 1, 'Kein doppelter Check-in');
await rep(53.5500, 9.9905, 10, 2); // ~33 m: noch im Radius
ok((await q(`select left_at from checkins`))[0].left_at === null, 'Innerhalb des Radius bleibt eingecheckt');
await rep(53.5500, 9.9912, 10, 2.5); // ~80 m: Radius verlassen
ok((await q(`select left_at from checkins`))[0].left_at !== null, 'Auto-Check-out direkt beim Verlassen des Radius (80 m)');
await rep(53.5500, 9.9930, 10, 3); // ~200 m
ok((await q(`select left_at from checkins`))[0].left_at !== null, 'Auto-Check-out bei 200 m');
await rep(53.5500, 9.9901, 10, 5);
c = await q(`select * from checkins`);
ok(c.length === 1 && c[0].left_at === null, 'Rückkehr binnen 10 min setzt Besuch fort');
await rep(53.5500, 9.9901, 500, 6);
ok((await q(`select left_at from checkins`))[0].left_at === null, 'Ungenaue Position (500 m) checkt nicht aus');
await rep(53.5600, 10.0000, 10, 30);
c = await q(`select station_id, left_at from checkins order by arrived_at`);
ok(c.length === 2 && c[0].left_at !== null && c[1].station_id === s2 && c[1].left_at === null, 'Wechsel zu Station 2');
await rep(53.5500, 9.9901, 10, 20); // veraltete Meldung
ok(Math.abs((await q(`select lat from locations`))[0].lat - 53.56) < 1e-9, 'Veraltete Position überschreibt nicht');
await q(`select manual_checkin($1, $2)`, [round, s1]);
c = await q(`select station_id, automatic from checkins where left_at is null`);
ok(c.length === 1 && c[0].station_id === s1 && c[0].automatic === false, 'Manueller Check-in');
await q(`select manual_checkin($1, null)`, [round]);
ok((await q(`select count(*)::int c from checkins where left_at is null`))[0].c === 0, 'Manueller Check-out');
console.log((await q(`select kind, body from messages order by created_at`)).map((m) => m.kind + ': ' + m.body));

await q(`insert into messages(round_id,user_id,body) values ($1,$2,'Wo seid ihr?')`, [round, ben]);
await as(cem); await q(`select set_member_prefs($1, null, true)`, [round]);
await as(ben); await q(`insert into messages(round_id,user_id,body) values ($1,$2,'Hallo?')`, [round, ben]);
await as(anna); await q(`insert into messages(round_id,user_id,kind,body) values ($1,$2,'announcement','Weiter gehts')`, [round, anna]);
await db.exec('reset role');
console.log((await q(`select body from net.calls`)).map((r) => r.body.map((m) => `${m.to} | ${m.title} | ${m.body}`)));

await as(ben);
const sh = (o) => JSON.stringify(Object.entries(o).map(([user_id, cents]) => ({ user_id, cents, weight: 1 })));
await fails(() => q(`select save_expense($1,null,'Pizza',1000,$2,null,'gleich',$3::jsonb)`, [round, ben, sh({ [anna]: 333, [ben]: 333, [cem]: 333 })]), 'Summe 999 ≠ 1000 abgelehnt');
await fails(() => q(`select save_expense($1,null,'Pizza',1000,$2,null,'gleich',$3::jsonb)`, [round, ben, sh({ [eve]: 1000 })]), 'Nichtmitglied als Beteiligte abgelehnt');
const ex = (await q(`select save_expense($1,null,'Pizza',1000,$2,$4,'gleich',$3::jsonb) as id`, [round, ben, sh({ [anna]: 334, [ben]: 333, [cem]: 333 }), s1]))[0].id;
await as(cem);
await fails(() => q(`select save_expense($1,$4,'Pizza',900,$2,null,'gleich',$3::jsonb)`, [round, ben, sh({ [cem]: 900 }), ex]), 'Fremde Ausgabe ändern abgelehnt');
await fails(() => q(`select delete_expense($1)`, [ex]), 'Fremde Ausgabe löschen abgelehnt');
await fails(() => q(`insert into settlements(round_id,from_user,to_user,amount_cents) values ($1,$2,$3,5)`, [round, anna, ben]), 'Fremden Ausgleich eintragen abgelehnt');
await q(`insert into settlements(round_id,from_user,to_user,amount_cents) values ($1,$2,$3,333)`, [round, cem, ben]);
await as(anna);
await q(`select save_expense($1,$4,'Pizza groß',1200,$2,null,'betrag',$3::jsonb)`, [round, ben, sh({ [anna]: 600, [ben]: 600 }), ex]);
ok((await q(`select sum(share_cents)::int s, count(*)::int n from expense_shares`))[0].s === 1200, 'Organisatorin ändert Ausgabe, Anteile ersetzt');


// --- Blockieren, Melden, Konto löschen ---
await db.exec('reset role; delete from net.calls;');
await as(cem); await q(`select set_member_prefs($1, null, false)`, [round]);
await q(`insert into blocks(blocker_id, blocked_id) values ($1, $2)`, [cem, ben]);
await fails(() => q(`insert into blocks(blocker_id, blocked_id) values ($1, $2)`, [ben, cem]), 'Blockierung im Namen anderer abgelehnt');
await as(ben); const spam = (await q(`insert into messages(round_id,user_id,body) values ($1,$2,'Nervige Nachricht') returning id`, [round, ben]))[0].id;
ok((await q(`select count(*)::int c from blocks`))[0].c === 0, 'Blockierungen anderer sind unsichtbar');
await db.exec('reset role');
ok((await q(`select count(*)::int c from net.calls`))[0].c === 0, 'Kein Chat-Push an Person, die blockiert hat');
await as(cem);
await q(`insert into reports(round_id, target_kind, target_id, target_user, excerpt, reason) values ($1,'message',$2,$3,'Nervige Nachricht','Spam')`, [round, spam, ben]);
await fails(() => q(`insert into reports(round_id, target_kind, target_id, reason) values ($1,'message',$2,'Spam')`, [round, spam]), 'Doppelte Meldung abgelehnt');
await as(eve);
await fails(() => q(`insert into reports(round_id, target_kind, target_id, reason) values ($1,'message',$2,'x')`, [round, spam]), 'Fremde können nichts melden');
await as(ben); ok((await q(`select count(*)::int c from reports`))[0].c === 0, 'Gemeldete Person sieht die Meldung nicht');
await fails(async () => { const r = await db.query(`update reports set resolved_at = now()`); if (r.affectedRows === 0) throw new Error('0 Zeilen'); }, 'Mitglied kann Meldung nicht schließen');
await as(anna); ok((await q(`select count(*)::int c from reports where resolved_at is null`))[0].c === 1, 'Organisatorin sieht die Meldung');
await q(`update reports set resolved_at = now(), resolved_by = $1`, [anna]);
await db.exec('reset role');
const rp = (await q(`select body from net.calls`)).flatMap((r) => r.body);
ok(rp.length === 0 || rp.every((m) => /Meldung/.test(m.title)), 'Meldungs-Push nur an Organisation (hier ohne Gerät: ' + rp.length + ')');

// Konto löschen: Dana ist allein in einem Hop, organisiert einen zweiten mit Eve und hat dort eine Ausgabe
const dana = await mk('Dana');
await as(dana);
const solo = (await q(`select create_round('Solo', '2026-08-01') as id`))[0].id;
const duo = (await q(`select create_round('Duo', '2026-08-02') as id`))[0].id;
const duoCode = (await q(`select invite_code from rounds where id = $1`, [duo]))[0].invite_code;
await as(eve); await q(`select join_round($1)`, [duoCode]);
await as(dana);
await q(`select save_expense($1,null,'Eis',500,$2,null,'gleich',$3::jsonb)`, [duo, dana, sh({ [dana]: 250, [eve]: 250 })]);
await q(`insert into messages(round_id,user_id,body) values ($1,$2,'Tschüss')`, [duo, dana]);
await q(`select delete_account()`);
await db.exec('reset role');
ok((await q(`select count(*)::int c from auth.users where id = $1`, [dana]))[0].c === 0, 'Anmeldedaten gelöscht');
ok((await q(`select count(*)::int c from rounds where id = $1`, [solo]))[0].c === 0, 'Hop ohne weitere Mitglieder gelöscht');
ok((await q(`select role from round_members where round_id = $1 and user_id = $2`, [duo, eve]))[0].role === 'organizer', 'Organisation an verbleibendes Mitglied übergeben');
ok((await q(`select count(*)::int c from messages where user_id = $1`, [dana]))[0].c === 0, 'Nachrichten gelöscht');
ok((await q(`select display_name from profiles where id = $1`, [dana]))[0].display_name === 'Gelöschtes Konto', 'Profil anonymisiert, Ausgabe bleibt für die Abrechnung');
ok((await q(`select count(*)::int c from expenses where round_id = $1`, [duo]))[0].c === 1, 'Ausgabe der anderen bleibt erhalten');
const finn = await mk('Finn');
await as(finn); await q(`select create_round('Kurz', '2026-08-03')`); await q(`select delete_account()`);
await db.exec('reset role');
ok((await q(`select count(*)::int c from profiles where id = $1`, [finn]))[0].c === 0, 'Konto ohne Abhängigkeiten restlos gelöscht');

await db.exec('reset role; grant all on storage.objects to authenticated;'); await db.exec(`insert into storage.objects(bucket_id,name) values ('media','${round}/${ben}/a.jpg')`);
await as(eve); ok((await q(`select count(*)::int c from storage.objects`))[0].c === 0, 'Collage-Dateien für Fremde unsichtbar');
await as(cem); ok((await q(`select count(*)::int c from storage.objects`))[0].c === 1, 'Collage-Dateien für Mitglieder sichtbar');
await fails(() => q(`insert into storage.objects(bucket_id,name) values ('media',$1)`, [`${round}/${ben}/b.jpg`]), 'Upload in fremden Ordner abgelehnt');
await fails(() => q(`select set_round_status($1,'beendet')`, [round]), 'Mitglied kann Hop nicht beenden');
await fails(() => q(`select remove_member($1,$2)`, [round, ben]), 'Mitglied kann niemanden entfernen');
await as(anna);
await fails(() => q(`select remove_member($1,$2)`, [round, anna]), 'Letzte Organisatorin kann nicht austreten');
await q(`select set_member_role($1,$2,'organizer')`, [round, ben]);
await q(`select set_round_status($1,'beendet')`, [round]);
ok((await q(`select count(*)::int c from locations`))[0].c === 0, 'Positionen nach Ende gelöscht');
await as(ben); ok((await q(`select report_location(53.55, 9.99, 10)`))[0].report_location === 0, 'Nach Ende keine Ortung mehr');
await as(anna); await q(`select remove_member($1,$2)`, [round, anna]);
ok((await q(`select count(*)::int c from rounds`))[0].c === 0, 'Nach Austritt kein Zugriff mehr');
