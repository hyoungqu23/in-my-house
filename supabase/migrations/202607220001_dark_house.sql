create extension if not exists pgcrypto;

create table if not exists public.game_rooms_runtime (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  revision bigint not null default 0 check (revision >= 0),
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_rooms_runtime_expires_idx
  on public.game_rooms_runtime (expires_at);

create table if not exists public.room_events (
  id bigint generated always as identity primary key,
  room_code text not null references public.game_rooms_runtime(code) on delete cascade,
  version bigint not null,
  event_type text not null default 'ROOM_CHANGED',
  created_at timestamptz not null default now()
);

create index if not exists room_events_room_version_idx
  on public.room_events (room_code, version desc);

alter table public.game_rooms_runtime enable row level security;
alter table public.room_events enable row level security;

revoke all on public.game_rooms_runtime from anon, authenticated;
revoke all on public.room_events from anon, authenticated;
grant select on public.room_events to authenticated;

create policy "room members read secret-free events"
on public.room_events
for select
to authenticated
using (
  exists (
    select 1
    from public.game_rooms_runtime room
    where room.code = room_events.room_code
      and (
        room.snapshot ->> 'hostUserId' = auth.uid()::text
        or exists (
          select 1
          from jsonb_array_elements(room.snapshot -> 'players') player
          where player ->> 'userId' = auth.uid()::text
        )
      )
  )
);

create or replace function public.commit_game_room(
  p_code text,
  p_expected_revision bigint,
  p_snapshot jsonb,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
  public_version bigint;
begin
  update public.game_rooms_runtime
  set snapshot = p_snapshot,
      revision = revision + 1,
      expires_at = p_expires_at,
      updated_at = now()
  where code = p_code
    and revision = p_expected_revision;

  get diagnostics changed = row_count;
  if changed = 0 then
    return false;
  end if;

  public_version := coalesce((p_snapshot ->> 'version')::bigint, 0);
  insert into public.room_events(room_code, version, event_type)
  values (p_code, public_version, 'ROOM_CHANGED');
  return true;
end;
$$;

revoke all on function public.commit_game_room(text, bigint, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.commit_game_room(text, bigint, jsonb, timestamptz) to service_role;

create or replace function public.cleanup_expired_game_rooms()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  delete from public.game_rooms_runtime where expires_at < now() - interval '24 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_expired_game_rooms() from public, anon, authenticated;
grant execute on function public.cleanup_expired_game_rooms() to service_role;

do $$
begin
  alter publication supabase_realtime add table public.room_events;
exception
  when duplicate_object then null;
end $$;
