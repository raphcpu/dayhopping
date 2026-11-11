-- ============================================================================
-- DayHop – Datenbankschema für Supabase
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- Tabellen
-- ----------------------------------------------------------------------------

-- Bewusst ohne Fremdschlüssel auf auth.users: Beim Löschen eines Kontos bleibt
-- notfalls eine anonyme Hülle ("Gelöschtes Konto") stehen, damit die
-- Kostenabrechnung der anderen weiter stimmt (siehe delete_account).
create table public.profiles (
  id           uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_path  text,
  color        text not null default '#FF5A36',
  created_at   timestamptz not null default now()
);

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  day         date not null,
  invite_code text not null unique,
  status      text not null default 'geplant' check (status in ('geplant', 'aktiv', 'beendet')),
  created_by  uuid not null references public.profiles,
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

create table public.round_members (
  round_id  uuid not null references public.rounds on delete cascade,
  user_id   uuid not null references public.profiles on delete cascade,
  role      text not null default 'member' check (role in ('organizer', 'member')),
  sharing   boolean not null default true,   -- Standort in dieser Runde teilen
  muted     boolean not null default false,  -- Chat-Pushes stumm
  joined_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
create index on public.round_members (user_id);

create table public.stations (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds on delete cascade,
  position   integer not null,
  name       text not null check (char_length(name) between 1 and 80),
  address    text,
  lat        double precision not null,
  lng        double precision not null,
  radius_m   integer not null default 60 check (radius_m between 20 and 500),
  planned_at timestamptz,
  note       text,
  created_at timestamptz not null default now()
);
create index on public.stations (round_id, position);

-- Nur die jeweils letzte Position pro Person und Runde, kein Bewegungsprofil.
create table public.locations (
  round_id    uuid not null references public.rounds on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    real,
  heading     real,
  speed       real,
  recorded_at timestamptz not null,
  primary key (round_id, user_id)
);

create table public.checkins (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds on delete cascade,
  station_id uuid not null references public.stations on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  arrived_at timestamptz not null default now(),
  left_at    timestamptz,
  automatic  boolean not null default true
);
create index on public.checkins (round_id);
-- Höchstens ein offener Check-in pro Person und Runde
create unique index checkins_one_open on public.checkins (round_id, user_id) where left_at is null;

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds on delete cascade,
  user_id    uuid references public.profiles on delete set null,
  kind       text not null default 'chat' check (kind in ('chat', 'announcement', 'system')),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.messages (round_id, created_at);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.rounds on delete cascade,
  station_id   uuid references public.stations on delete set null,
  title        text not null check (char_length(title) between 1 and 80),
  amount_cents integer not null check (amount_cents > 0),
  payer_id     uuid not null references public.profiles,
  split_mode   text not null default 'gleich' check (split_mode in ('gleich', 'anteile', 'betrag')),
  created_by   uuid not null references public.profiles,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.expenses (round_id);

create table public.expense_shares (
  expense_id  uuid not null references public.expenses on delete cascade,
  user_id     uuid not null references public.profiles,
  share_cents integer not null check (share_cents >= 0),
  weight      integer,
  primary key (expense_id, user_id)
);

-- Ausgleichszahlungen ("Anna hat Ben 12,50 € gegeben")
create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.rounds on delete cascade,
  from_user    uuid not null references public.profiles,
  to_user      uuid not null references public.profiles,
  amount_cents integer not null check (amount_cents > 0),
  created_by   uuid not null references public.profiles default auth.uid(),
  created_at   timestamptz not null default now(),
  check (from_user <> to_user)
);
create index on public.settlements (round_id);

create table public.media (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.rounds on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  station_id   uuid references public.stations on delete set null,
  kind         text not null check (kind in ('photo', 'video')),
  storage_path text not null,
  thumb_path   text,
  width        integer,
  height       integer,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);
create index on public.media (round_id, created_at);

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);

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

-- ----------------------------------------------------------------------------
-- Hilfsfunktionen
-- ----------------------------------------------------------------------------

create or replace function public.is_member(p_round uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from round_members where round_id = p_round and user_id = auth.uid());
$$;

create or replace function public.is_organizer(p_round uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from round_members
                 where round_id = p_round and user_id = auth.uid() and role = 'organizer');
$$;

create or replace function public.shares_round_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1 from round_members a join round_members b on a.round_id = b.round_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;

-- Für Storage-Regeln: Pfad beginnt mit der Runden-ID (als Text, damit nichts beim Cast scheitert)
create or replace function public.is_member_path(p_round text, p_need_organizer boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from round_members
                 where round_id::text = p_round and user_id = auth.uid()
                   and (not p_need_organizer or role = 'organizer'));
$$;

-- Entfernung in Metern (Haversine)
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))));
$$;

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
-- Profil automatisch bei Registrierung anlegen
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_colors text[] := array['#FF5A36', '#0E7C72', '#7A4CE0', '#D9860B', '#D6336C', '#2F6FDE', '#3D8B37', '#B5471B'];
  v_name   text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  insert into profiles (id, display_name, color)
  values (new.id,
          left(coalesce(v_name, split_part(new.email, '@', 1), 'Gast'), 40),
          v_colors[1 + (get_byte(decode(replace(new.id::text, '-', ''), 'hex'), 0) % 8)])
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Runden: anlegen, beitreten, verwalten
-- ----------------------------------------------------------------------------

create or replace function public.create_round(p_name text, p_day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from rounds where invite_code = v_code);
  end loop;
  insert into rounds (name, day, invite_code, created_by)
  values (trim(p_name), p_day, v_code, auth.uid()) returning id into v_id;
  insert into round_members (round_id, user_id, role) values (v_id, auth.uid(), 'organizer');
  return v_id;
end;
$$;

create or replace function public.join_round(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select id into v_id from rounds where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'Kein Hop mit diesem Code gefunden'; end if;
  insert into round_members (round_id, user_id) values (v_id, auth.uid())
  on conflict do nothing;
  if found then
    select display_name into v_name from profiles where id = auth.uid();
    insert into messages (round_id, user_id, kind, body)
    values (v_id, auth.uid(), 'system', v_name || ' ist dabei');
  end if;
  return v_id;
end;
$$;

create or replace function public.set_member_prefs(p_round uuid, p_sharing boolean, p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update round_members
     set sharing = coalesce(p_sharing, sharing), muted = coalesce(p_muted, muted)
   where round_id = p_round and user_id = auth.uid();
  -- Wer das Teilen abschaltet, verschwindet sofort von der Karte.
  if p_sharing is false then
    delete from locations where round_id = p_round and user_id = auth.uid();
    update checkins set left_at = now()
     where round_id = p_round and user_id = auth.uid() and left_at is null;
  end if;
end;
$$;

create or replace function public.set_member_role(p_round uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_organizer(p_round) then raise exception 'Nur für Organisatoren'; end if;
  if p_role = 'member' and (select count(*) from round_members
                            where round_id = p_round and role = 'organizer' and user_id <> p_user) = 0 then
    raise exception 'Mindestens ein Organisator muss bleiben';
  end if;
  update round_members set role = p_role where round_id = p_round and user_id = p_user;
end;
$$;

-- Jemanden entfernen (Organisator) oder selbst austreten
create or replace function public.remove_member(p_round uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and not is_organizer(p_round) then
    raise exception 'Nur für Organisatoren';
  end if;
  if (select count(*) from round_members
      where round_id = p_round and role = 'organizer' and user_id <> p_user) = 0
     and (select count(*) from round_members where round_id = p_round) > 1 then
    raise exception 'Mindestens ein Organisator muss bleiben';
  end if;
  delete from locations where round_id = p_round and user_id = p_user;
  update checkins set left_at = now() where round_id = p_round and user_id = p_user and left_at is null;
  delete from round_members where round_id = p_round and user_id = p_user;
end;
$$;

create or replace function public.set_round_status(p_round uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old text;
  v_name text;
begin
  if not is_organizer(p_round) then raise exception 'Nur für Organisatoren'; end if;
  select status, name into v_old, v_name from rounds where id = p_round;
  if v_old = p_status then return; end if;
  update rounds
     set status = p_status,
         started_at = case when p_status = 'aktiv' then coalesce(started_at, now()) else started_at end,
         ended_at   = case when p_status = 'beendet' then now() else null end
   where id = p_round;
  if p_status = 'aktiv' then
    insert into messages (round_id, user_id, kind, body) values (p_round, auth.uid(), 'system', 'Der Hop läuft');
    perform send_push(p_round, auth.uid(), v_name, 'Los geht''s – der Hop läuft! Öffne die App, damit dein Standort geteilt wird.', false,
                      jsonb_build_object('type', 'status'));
  elsif p_status = 'beendet' then
    -- Ortung endet mit dem Hop: Positionen löschen, offene Check-ins schließen
    delete from locations where round_id = p_round;
    update checkins set left_at = now() where round_id = p_round and left_at is null;
    insert into messages (round_id, user_id, kind, body) values (p_round, auth.uid(), 'system', 'Der Hop ist beendet');
  end if;
end;
$$;

create or replace function public.reorder_stations(p_round uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_organizer(p_round) then raise exception 'Nur für Organisatoren'; end if;
  update stations s set position = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.round_id = p_round;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ortung und automatische Check-ins
-- Die App ruft im Hintergrund nur diese eine Funktion auf. Rückgabe: Anzahl der
-- laufenden Hops, in denen die Person ihren Standort teilt (0 = Ortung beenden).
-- ----------------------------------------------------------------------------

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

    -- Offenen Check-in schließen, wenn die Station verlassen wurde. 40 m Puffer
    -- plus Messungenauigkeit verhindern Flattern am Rand.
    update checkins c set left_at = v_at
      from stations s
     where s.id = c.station_id
       and c.round_id = v_round and c.user_id = v_uid and c.left_at is null
       and c.station_id is distinct from v_inside
       and (v_inside is not null
            or distance_m(p_lat, p_lng, s.lat, s.lng) > s.radius_m + 40 + least(coalesce(p_accuracy, 0), 60));

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

-- Manueller Check-in (p_station) bzw. Check-out (p_station = null)
create or replace function public.manual_checkin(p_round uuid, p_station uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_round) then raise exception 'Kein Mitglied'; end if;
  update checkins set left_at = now()
   where round_id = p_round and user_id = auth.uid() and left_at is null
     and station_id is distinct from p_station;
  if p_station is not null and not exists (
       select 1 from checkins where round_id = p_round and user_id = auth.uid() and left_at is null) then
    if not exists (select 1 from stations where id = p_station and round_id = p_round) then
      raise exception 'Station gehört nicht zu diesem Hop';
    end if;
    insert into checkins (round_id, station_id, user_id, automatic)
    values (p_round, p_station, auth.uid(), false);
  end if;
end;
$$;

-- Systemnachricht im Chat bei jedem neuen Check-in
create or replace function public.on_checkin_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into messages (round_id, user_id, kind, body)
  select new.round_id, new.user_id, 'system', p.display_name || ' ist da: ' || s.name
  from profiles p, stations s where p.id = new.user_id and s.id = new.station_id;
  return new;
end;
$$;
create trigger checkin_announce after insert on public.checkins
  for each row execute function public.on_checkin_insert();

-- ----------------------------------------------------------------------------
-- Chat: Push bei neuen Nachrichten
-- ----------------------------------------------------------------------------

create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_round text;
  v_name  text;
begin
  if new.kind = 'system' then return new; end if;
  select name into v_round from rounds where id = new.round_id;
  select display_name into v_name from profiles where id = new.user_id;
  if new.kind = 'announcement' then
    perform send_push(new.round_id, new.user_id, '📣 Durchsage · ' || v_round, left(new.body, 180), false,
                      jsonb_build_object('type', 'announcement'));
  else
    perform send_push(new.round_id, new.user_id, coalesce(v_name, 'Jemand') || ' · ' || v_round, left(new.body, 180), true,
                      jsonb_build_object('type', 'chat'));
  end if;
  return new;
end;
$$;
create trigger message_push after insert on public.messages
  for each row execute function public.on_message_insert();

-- ----------------------------------------------------------------------------
-- Kosten
-- ----------------------------------------------------------------------------

-- p_shares: [{"user_id": "...", "cents": 417, "weight": 1}, ...]
-- Die Summe der Anteile muss auf den Cent genau dem Betrag entsprechen.
create or replace function public.save_expense(
  p_round uuid, p_id uuid, p_title text, p_amount_cents integer, p_payer uuid,
  p_station uuid, p_split_mode text, p_shares jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id  uuid := p_id;
  v_sum bigint;
  v_n   integer;
begin
  if not is_member(p_round) then raise exception 'Kein Mitglied'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Betrag muss größer als 0 sein'; end if;

  select coalesce(sum((e ->> 'cents')::bigint), 0), count(*)
    into v_sum, v_n from jsonb_array_elements(p_shares) e;
  if v_n = 0 then raise exception 'Mindestens eine Person muss beteiligt sein'; end if;
  if v_sum <> p_amount_cents then
    raise exception 'Die Anteile (% Cent) ergeben nicht den Betrag (% Cent)', v_sum, p_amount_cents;
  end if;
  if exists (select 1 from jsonb_array_elements(p_shares) e where (e ->> 'cents')::bigint < 0) then
    raise exception 'Anteile dürfen nicht negativ sein';
  end if;
  if not exists (select 1 from round_members where round_id = p_round and user_id = p_payer) then
    raise exception 'Zahlende Person ist kein Mitglied';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shares) e
             where not exists (select 1 from round_members m
                               where m.round_id = p_round and m.user_id = (e ->> 'user_id')::uuid)) then
    raise exception 'Beteiligte Person ist kein Mitglied';
  end if;

  if v_id is null then
    insert into expenses (round_id, station_id, title, amount_cents, payer_id, split_mode, created_by)
    values (p_round, p_station, trim(p_title), p_amount_cents, p_payer, p_split_mode, auth.uid())
    returning id into v_id;
  else
    if not exists (select 1 from expenses where id = v_id and round_id = p_round
                   and (created_by = auth.uid() or payer_id = auth.uid() or is_organizer(p_round))) then
      raise exception 'Diese Ausgabe darfst du nicht ändern';
    end if;
    delete from expense_shares where expense_id = v_id;
  end if;

  insert into expense_shares (expense_id, user_id, share_cents, weight)
  select v_id, (e ->> 'user_id')::uuid, (e ->> 'cents')::integer, (e ->> 'weight')::integer
  from jsonb_array_elements(p_shares) e;

  if p_id is null then
    perform send_push(p_round, auth.uid(), 'Neue Ausgabe · ' || (select name from rounds where id = p_round),
                      trim(p_title) || ' – ' || replace(to_char(p_amount_cents / 100.0, 'FM999999990.00'), '.', ',') || ' €',
                      true, jsonb_build_object('type', 'expense'));
  else
    -- Auslöser für Realtime: Anteile haben sich geändert
    update expenses set station_id = p_station, title = trim(p_title), amount_cents = p_amount_cents,
                        payer_id = p_payer, split_mode = p_split_mode, updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_expense(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from expenses e
   where e.id = p_id and (e.created_by = auth.uid() or e.payer_id = auth.uid() or is_organizer(e.round_id));
  if not found then raise exception 'Diese Ausgabe darfst du nicht löschen'; end if;
end;
$$;

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

-- ----------------------------------------------------------------------------
-- Zugriffsregeln (Row Level Security)
-- Alles ist rundenprivat: Lesen nur für Mitglieder der jeweiligen Runde.
-- Tabellen ohne Schreibregel werden ausschließlich über die Funktionen oben geändert.
-- ----------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.rounds         enable row level security;
alter table public.round_members  enable row level security;
alter table public.stations       enable row level security;
alter table public.locations      enable row level security;
alter table public.checkins       enable row level security;
alter table public.messages       enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements    enable row level security;
alter table public.media          enable row level security;
alter table public.push_tokens    enable row level security;
alter table public.blocks         enable row level security;
alter table public.reports        enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (shares_round_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy rounds_read on public.rounds for select to authenticated using (is_member(id));
create policy rounds_update on public.rounds for update to authenticated
  using (is_organizer(id)) with check (is_organizer(id));
create policy rounds_delete on public.rounds for delete to authenticated using (is_organizer(id));

create policy members_read on public.round_members for select to authenticated using (is_member(round_id));

create policy stations_read on public.stations for select to authenticated using (is_member(round_id));
create policy stations_insert on public.stations for insert to authenticated with check (is_organizer(round_id));
create policy stations_update on public.stations for update to authenticated
  using (is_organizer(round_id)) with check (is_organizer(round_id));
create policy stations_delete on public.stations for delete to authenticated using (is_organizer(round_id));

create policy locations_read on public.locations for select to authenticated using (is_member(round_id));
create policy checkins_read on public.checkins for select to authenticated using (is_member(round_id));

create policy messages_read on public.messages for select to authenticated using (is_member(round_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (user_id = auth.uid() and is_member(round_id)
              and (kind = 'chat' or (kind = 'announcement' and is_organizer(round_id))));
create policy messages_delete on public.messages for delete to authenticated
  using (kind <> 'system' and (user_id = auth.uid() or is_organizer(round_id)));

create policy expenses_read on public.expenses for select to authenticated using (is_member(round_id));
create policy shares_read on public.expense_shares for select to authenticated
  using (exists (select 1 from expenses e where e.id = expense_id and is_member(e.round_id)));

create policy settlements_read on public.settlements for select to authenticated using (is_member(round_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (created_by = auth.uid() and is_member(round_id)
              and (from_user = auth.uid() or to_user = auth.uid() or is_organizer(round_id)));
create policy settlements_delete on public.settlements for delete to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or is_organizer(round_id));

create policy media_read on public.media for select to authenticated using (is_member(round_id));
create policy media_insert on public.media for insert to authenticated
  with check (user_id = auth.uid() and is_member(round_id));
create policy media_delete on public.media for delete to authenticated
  using (user_id = auth.uid() or is_organizer(round_id));

create policy tokens_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocks_all on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or is_organizer(round_id));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and is_member(round_id));
create policy reports_update on public.reports for update to authenticated
  using (is_organizer(round_id)) with check (is_organizer(round_id));

-- Ein Gerät gehört immer zum zuletzt angemeldeten Konto
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language sql security definer set search_path = public as $$
  insert into push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
$$;

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------

alter table public.rounds        replica identity full;
alter table public.round_members replica identity full;
alter table public.stations      replica identity full;
alter table public.locations     replica identity full;
alter table public.checkins      replica identity full;
alter table public.messages      replica identity full;
alter table public.expenses      replica identity full;
alter table public.settlements   replica identity full;
alter table public.media         replica identity full;
alter table public.reports       replica identity full;

alter publication supabase_realtime add table
  public.rounds, public.round_members, public.stations, public.locations, public.checkins,
  public.messages, public.expenses, public.settlements, public.media, public.reports;

-- ----------------------------------------------------------------------------
-- Storage: Collage (privat, Pfad <runde>/<person>/<datei>) und Avatare (öffentlich)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('media', 'media', false), ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy media_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_member_path((storage.foldername(name))[1]));
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_member_path((storage.foldername(name))[1])
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[2] = auth.uid()::text
                                  or public.is_member_path((storage.foldername(name))[1], true)));

create policy avatar_objects_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatar_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
