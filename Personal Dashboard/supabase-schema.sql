create table if not exists public.dashboard_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_dashboard_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dashboard_updated_at on public.dashboard_states;
create trigger trg_dashboard_updated_at
before update on public.dashboard_states
for each row execute function public.set_dashboard_updated_at();

alter table public.dashboard_states enable row level security;

drop policy if exists "Users manage own dashboard state" on public.dashboard_states;
create policy "Users manage own dashboard state"
on public.dashboard_states
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
