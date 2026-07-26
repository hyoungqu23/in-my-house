create table if not exists public.game_room_private_player_states (
  room_code text not null references public.game_rooms_runtime(code) on delete cascade,
  user_id text not null,
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

alter table public.game_room_private_player_states enable row level security;
revoke all on public.game_room_private_player_states from anon, authenticated;

create or replace function public.commit_game_room_private_player_state(
  p_room_code text,
  p_user_id text,
  p_expected_revision bigint,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_expected_revision = 0 then
    insert into public.game_room_private_player_states (
      room_code,
      user_id,
      revision,
      payload
    )
    values (p_room_code, p_user_id, 1, p_payload)
    on conflict (room_code, user_id) do nothing;

    get diagnostics changed = row_count;
    if changed = 1 then
      return true;
    end if;
  end if;

  update public.game_room_private_player_states
  set revision = revision + 1,
      payload = p_payload,
      updated_at = now()
  where room_code = p_room_code
    and user_id = p_user_id
    and revision = p_expected_revision;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.commit_game_room_private_player_state(
  text,
  text,
  bigint,
  jsonb
) from public, anon, authenticated;
grant execute on function public.commit_game_room_private_player_state(
  text,
  text,
  bigint,
  jsonb
) to service_role;
