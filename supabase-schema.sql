-- =====================================================================
-- Plateforme Financement — Schéma Supabase (production)
-- À exécuter UNE FOIS dans Supabase → SQL Editor → New query → Run.
-- Tables : profiles, deals, documents, messages
-- Sécurité : RLS activée partout + bucket Storage privé "documents".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES (prolonge auth.users avec le rôle)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'client' check (role in ('client','consultant')),
  first_name  text,
  last_name   text,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Helper : l'utilisateur courant est-il consultant ?
create or replace function public.is_consultant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'consultant'
  );
$$;

-- Création automatique du profil à l'inscription (lit user_metadata)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. DEALS (dossiers de financement)
-- ---------------------------------------------------------------------
create table if not exists public.deals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references auth.users(id) on delete set null,
  society     text,
  contact     text,
  first_name  text,
  last_name   text,
  email       text,
  phone       text,
  besoin      text,
  objet       text,
  scenario    text,
  solution    text,
  amount      text,
  amount_num  bigint not null default 0,
  status      text   not null default 'pieces',
  consultant  text   default 'Sophie Lefèvre',
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists deals_client_id_idx on public.deals(client_id);
create index if not exists deals_status_idx    on public.deals(status);

-- ---------------------------------------------------------------------
-- 3. DOCUMENTS (pièces du dossier)
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  doc_key     text not null,
  name        text,
  description text,
  uploaded    boolean not null default false,
  file_path   text,
  file_name   text,
  file_size   text,
  created_at  timestamptz not null default now()
);
create index if not exists documents_deal_id_idx on public.documents(deal_id);

-- ---------------------------------------------------------------------
-- 4. MESSAGES (messagerie client <-> consultant)
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  sender     text not null check (sender in ('client','consultant')),
  author     text,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_deal_id_idx on public.messages(deal_id);

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.deals     enable row level security;
alter table public.documents enable row level security;
alter table public.messages  enable row level security;

-- PROFILES : chacun lit/modifie le sien ; le consultant lit tout
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select
  using (id = auth.uid() or public.is_consultant());
create policy profiles_update on public.profiles for update
  using (id = auth.uid());

-- DEALS : le client voit/modifie le sien ; le consultant voit/modifie tout
drop policy if exists deals_read   on public.deals;
drop policy if exists deals_insert on public.deals;
drop policy if exists deals_update on public.deals;
create policy deals_read   on public.deals for select
  using (client_id = auth.uid() or public.is_consultant());
create policy deals_insert on public.deals for insert
  with check (client_id = auth.uid());
create policy deals_update on public.deals for update
  using (client_id = auth.uid() or public.is_consultant());

-- DOCUMENTS : accès gouverné par le dossier parent
drop policy if exists documents_read  on public.documents;
drop policy if exists documents_write on public.documents;
create policy documents_read on public.documents for select
  using (exists (
    select 1 from public.deals d
    where d.id = deal_id and (d.client_id = auth.uid() or public.is_consultant())
  ));
create policy documents_write on public.documents for all
  using (exists (
    select 1 from public.deals d
    where d.id = deal_id and (d.client_id = auth.uid() or public.is_consultant())
  ))
  with check (exists (
    select 1 from public.deals d
    where d.id = deal_id and (d.client_id = auth.uid() or public.is_consultant())
  ));

-- MESSAGES : lecture/écriture sur les dossiers autorisés
drop policy if exists messages_read   on public.messages;
drop policy if exists messages_insert on public.messages;
create policy messages_read on public.messages for select
  using (exists (
    select 1 from public.deals d
    where d.id = deal_id and (d.client_id = auth.uid() or public.is_consultant())
  ));
create policy messages_insert on public.messages for insert
  with check (exists (
    select 1 from public.deals d
    where d.id = deal_id and (d.client_id = auth.uid() or public.is_consultant())
  ));

-- ---------------------------------------------------------------------
-- 6. STORAGE — bucket privé "documents"
--    Arborescence des fichiers : {deal_id}/{doc_key}-{nom_fichier}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists doc_storage_read   on storage.objects;
drop policy if exists doc_storage_insert on storage.objects;
drop policy if exists doc_storage_update on storage.objects;
create policy doc_storage_read on storage.objects for select
  using (
    bucket_id = 'documents' and (
      public.is_consultant() or
      exists (
        select 1 from public.deals d
        where d.client_id = auth.uid()
          and (storage.foldername(name))[1] = d.id::text
      )
    )
  );
create policy doc_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'documents' and (
      public.is_consultant() or
      exists (
        select 1 from public.deals d
        where d.client_id = auth.uid()
          and (storage.foldername(name))[1] = d.id::text
      )
    )
  );
create policy doc_storage_update on storage.objects for update
  using (
    bucket_id = 'documents' and (
      public.is_consultant() or
      exists (
        select 1 from public.deals d
        where d.client_id = auth.uid()
          and (storage.foldername(name))[1] = d.id::text
      )
    )
  );

-- ---------------------------------------------------------------------
-- 7. REALTIME — diffuser les changements (messagerie + statuts)
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.deals;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.documents; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages;  exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- 8. PROMOUVOIR UN CONSULTANT (à lancer après avoir créé son compte)
--    Remplace l'email puis exécute uniquement ces 2 lignes :
-- =====================================================================
-- update public.profiles set role = 'consultant'
-- where id = (select id from auth.users where email = 'consultant@plateformefinancement.fr');
