-- ============================================================================
-- DayHop – Update für Datenbanken, in denen schon die erste Fassung von
-- schema.sql ausgeführt wurde. Bringt: Konto löschen, Melden, Blockieren.
-- Bei einer neuen Datenbank NICHT nötig: dort reicht schema.sql.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_id_fkey;

-- Wen jemand blockiert hat: dessen Nachrichten, Medien und Pushes werden ausgeblendet.
create table public.blocks (
  blocker_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Gemeldete Inhalte. Die Organisation des Hops sieht und bearbeitet sie.
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.rounds on delete cascade,
  reporter_id uuid not null references public.profiles on delete cascade default auth.uid(),
  target_kind text not null check (target_kind in ('message', 'media', 'user')),
  target_id   uuid not null,
  target_user uuid references public.profiles on delete set null,
  excerpt     text check (char_length(excerpt) <= 300),
  reason      text not null check (char_length(reason) between 1 and 200),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles on delete set null,
  unique (reporter_id, target_kind, target_id)
);
create index on public.reports (round_id);

drop function if exists public.send_push(uuid, uuid, text, text, boolean, jsonb);

-- Push über den Expo-Push-Dienst. Darf nie eine Transaktion scheitern lassen.
-- Wer die absendende Person (p_exclude) blockiert hat, bekommt deren Chat-Pushes nicht.
create or replace function public.send_push(p_round uuid, p_exclude uuid, p_title text, p_body text,
                                            p_respect_mute boolean, p_data jsonb default '{}',
                                            p_only_organizers boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch jsonb;
begin
  for v_batch in
    select jsonb_agg(jsonb_build_object(
             'to', q.token, 'title', p_title, 'body', p_body,
             'sound', 'default', 'channelId', 'default', 'priority', 'high',
             'data', p_data || jsonb_build_object('roundId', p_round)))
    from (
      select t.token, (row_number() over () - 1) / 100 as grp
      from round_members m join push_tokens t on t.user_id = m.user_id
      where m.round_id = p_round
        and m.user_id is distinct from p_exclude
        and (not p_respect_mute or not m.muted)
        and (not p_only_organizers or m.role = 'organizer')
        -- Durchsagen und Systemmeldungen (ohne Stumm-Regel) kommen trotz Blockierung an
        and (not p_respect_mute
             or not exists (select 1 from blocks b where b.blocker_id = m.user_id and b.blocked_id = p_exclude))
    ) q
    group by q.grp
  loop
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := v_batch,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end loop;
exception when others then
  raise warning 'send_push fehlgeschlagen: %', sqlerrm;
end;
$$;
revoke all on function public.send_push(uuid, uuid, text, text, boolean, jsonb, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Melden und Konto löschen
-- ----------------------------------------------------------------------------

-- Neue Meldung: Push an die Organisation des Hops
create or replace function public.on_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform send_push(new.round_id, new.reporter_id,
                    'Meldung · ' || (select name from rounds where id = new.round_id),
                    'Ein Inhalt wurde gemeldet: ' || new.reason, false,
                    jsonb_build_object('type', 'report'), true);
  return new;
end;
$$;
create trigger report_push after insert on public.reports
  for each row execute function public.on_report_insert();

-- Löscht das eigene Konto samt Anmeldedaten. Die App entfernt vorher die eigenen
-- Dateien aus dem Storage (das geht nur über die Storage-Schnittstelle).
-- Ausgaben bleiben für die Abrechnung der anderen erhalten, laufen dann aber
-- unter "Gelöschtes Konto" ohne Namen, Bild oder E-Mail.
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;

  for r in select m.round_id, m.role from round_members m where m.user_id = v_uid loop
    if (select count(*) from round_members where round_id = r.round_id) = 1 then
      delete from rounds where id = r.round_id;  -- niemand sonst dabei
    elsif r.role = 'organizer' and not exists (
            select 1 from round_members
            where round_id = r.round_id and role = 'organizer' and user_id <> v_uid) then
      -- Organisation an das dienstälteste Mitglied übergeben
      update round_members set role = 'organizer'
       where round_id = r.round_id
         and user_id = (select user_id from round_members
                        where round_id = r.round_id and user_id <> v_uid
                        order by joined_at limit 1);
    end if;
  end loop;

  delete from round_members where user_id = v_uid;
  delete from locations     where user_id = v_uid;
  delete from checkins      where user_id = v_uid;
  delete from messages      where user_id = v_uid;
  delete from media         where user_id = v_uid;
  delete from push_tokens   where user_id = v_uid;
  delete from blocks        where blocker_id = v_uid or blocked_id = v_uid;
  delete from reports       where reporter_id = v_uid;

  begin
    delete from profiles where id = v_uid;
  exception when foreign_key_violation then
    -- wird noch von Ausgaben oder Hops anderer gebraucht: anonymisieren
    update profiles set display_name = 'Gelöschtes Konto', avatar_path = null, color = '#9A9186'
     where id = v_uid;
  end;

  delete from auth.users where id = v_uid;
end;
$$;

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

create policy blocks_all on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or is_organizer(round_id));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and is_member(round_id));
create policy reports_update on public.reports for update to authenticated
  using (is_organizer(round_id)) with check (is_organizer(round_id));

alter table public.reports replica identity full;
alter publication supabase_realtime add table public.reports;

-- ----------------------------------------------------------------------------
-- Ausführungsrechte: nichts ohne Anmeldung, Trigger- und Push-Funktionen gar nicht direkt
-- ----------------------------------------------------------------------------

alter function public.distance_m(double precision, double precision, double precision, double precision) set search_path = public;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user(), public.on_checkin_insert(), public.on_message_insert(),
  public.on_report_insert(), public.send_push(uuid, uuid, text, text, boolean, jsonb, boolean) from authenticated;


-- ----------------------------------------------------------------------------
-- Absturz- und Fehlerberichte der App. Schreiben darf jede Installation (auch vor
-- der Anmeldung), lesen nur der Betreiber im Dashboard (Table Editor → client_errors).
-- ----------------------------------------------------------------------------

create table public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  fatal       boolean not null default false,
  message     text not null check (char_length(message) <= 2000),
  stack       text check (char_length(stack) <= 8000),
  context     jsonb check (pg_column_size(context) <= 4000)
);
alter table public.client_errors enable row level security;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
grant insert on public.client_errors to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Stationsfarben: Leuchtfarbe je Station, innerhalb eines Hops nur einmal vergeben
-- ----------------------------------------------------------------------------

alter table public.stations add column if not exists color text check (color ~ '^#[0-9A-Fa-f]{6}$');
create unique index if not exists stations_color_unique on public.stations (round_id, upper(color)) where color is not null;

-- Einheitlicher Check-in-Radius: alle Stationen 60 m (die App bietet keine Auswahl mehr)
alter table public.stations alter column radius_m set default 60;
update public.stations set radius_m = 60 where radius_m <> 60;

-- Auschecken direkt beim Verlassen des Check-in-Radius
create or replace function public.report_location(
  p_lat double precision, p_lng double precision,
  p_accuracy real default null, p_heading real default null, p_speed real default null,
  p_recorded_at timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_at     timestamptz := least(coalesce(p_recorded_at, now()), now());
  v_count  integer := 0;
  v_round  uuid;
  v_inside uuid;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;

  for v_round in
    select m.round_id from round_members m join rounds r on r.id = m.round_id
    where m.user_id = v_uid and m.sharing and r.status = 'aktiv'
  loop
    v_count := v_count + 1;

    insert into locations (round_id, user_id, lat, lng, accuracy, heading, speed, recorded_at)
    values (v_round, v_uid, p_lat, p_lng, p_accuracy, p_heading, p_speed, v_at)
    on conflict (round_id, user_id) do update
      set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
          heading = excluded.heading, speed = excluded.speed, recorded_at = excluded.recorded_at
      where locations.recorded_at <= excluded.recorded_at;
    -- Verspätet eingetroffene, ältere Meldung: nichts weiter tun
    if not found then continue; end if;

    -- In welcher Station steht die Person? (nur bei brauchbarer Genauigkeit)
    v_inside := null;
    if coalesce(p_accuracy, 0) <= 100 then
      select s.id into v_inside from stations s
      where s.round_id = v_round and distance_m(p_lat, p_lng, s.lat, s.lng) <= s.radius_m
      order by distance_m(p_lat, p_lng, s.lat, s.lng) limit 1;
    end if;

    -- Offenen Check-in schließen, sobald der Check-in-Radius verlassen wird. Ungenaue
    -- Messungen (über 100 m) checken niemanden aus. Wer binnen 10 Minuten zurückkommt,
    -- setzt den Besuch fort (siehe unten), statt neu gezählt zu werden.
    update checkins c set left_at = v_at
      from stations s
     where s.id = c.station_id
       and c.round_id = v_round and c.user_id = v_uid and c.left_at is null
       and c.station_id is distinct from v_inside
       and (v_inside is not null
            or (coalesce(p_accuracy, 0) <= 100 and distance_m(p_lat, p_lng, s.lat, s.lng) > s.radius_m));

    if v_inside is not null and not exists (
         select 1 from checkins where round_id = v_round and user_id = v_uid and left_at is null) then
      -- Kurz draußen gewesen? Dann den letzten Besuch fortsetzen statt neu zählen.
      update checkins set left_at = null
       where id = (select id from checkins
                   where round_id = v_round and user_id = v_uid and station_id = v_inside
                     and left_at > v_at - interval '10 minutes'
                   order by left_at desc limit 1)
      returning id into v_id;
      if v_id is null then
        insert into checkins (round_id, station_id, user_id, arrived_at, automatic)
        values (v_round, v_inside, v_uid, v_at, true);
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;
