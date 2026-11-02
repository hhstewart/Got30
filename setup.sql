-- Got 30? database setup. Paste all of this into Supabase's SQL Editor and click Run.
-- It creates one table for tracker contacts and locks it so each person only ever sees their own.

create table if not exists public.contacts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_user_idx on public.contacts (user_id);

alter table public.contacts enable row level security;

create policy "Read own contacts"   on public.contacts for select to authenticated using (auth.uid() = user_id);
create policy "Add own contacts"    on public.contacts for insert to authenticated with check (auth.uid() = user_id);
create policy "Edit own contacts"   on public.contacts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own contacts" on public.contacts for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.contacts to authenticated;
