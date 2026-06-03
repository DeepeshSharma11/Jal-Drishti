create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.verified_hotspot (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  loc text,
  drainage text not null default '20%',
  lat double precision not null,
  lng double precision not null,
  image_url text,
  maps_link text,
  is_verified boolean not null default true,
  source text not null default 'official',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_hotspot_lat_range check (lat between -90 and 90),
  constraint verified_hotspot_lng_range check (lng between -180 and 180),
  constraint verified_hotspot_drainage_format check (drainage ~ '^[0-9]{1,3}%$'),
  constraint verified_hotspot_source_check check (source in ('official', 'user'))
);

create table if not exists public.hotspots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  loc text,
  drainage text not null default '20%',
  lat double precision not null,
  lng double precision not null,
  image_url text,
  maps_link text,
  is_verified boolean not null default false,
  source text not null default 'user',
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotspots_lat_range check (lat between -90 and 90),
  constraint hotspots_lng_range check (lng between -180 and 180),
  constraint hotspots_drainage_format check (drainage ~ '^[0-9]{1,3}%$'),
  constraint hotspots_source_check check (source in ('official', 'user'))
);

alter table public.hotspots add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_verified_hotspot_location on public.verified_hotspot (lat, lng);
create index if not exists idx_verified_hotspot_verified on public.verified_hotspot (is_verified);
create index if not exists idx_verified_hotspot_created_at on public.verified_hotspot (created_at desc);
create unique index if not exists uq_verified_hotspot_name_location on public.verified_hotspot (name, lat, lng);

create index if not exists idx_hotspots_location on public.hotspots (lat, lng);
create index if not exists idx_hotspots_verified on public.hotspots (is_verified);
create index if not exists idx_hotspots_created_at on public.hotspots (created_at desc);
create unique index if not exists uq_hotspots_name_location on public.hotspots (name, lat, lng);

drop trigger if exists trg_verified_hotspot_updated_at on public.verified_hotspot;
create trigger trg_verified_hotspot_updated_at
before update on public.verified_hotspot
for each row execute function public.set_updated_at();

drop trigger if exists trg_hotspots_updated_at on public.hotspots;
create trigger trg_hotspots_updated_at
before update on public.hotspots
for each row execute function public.set_updated_at();

alter table public.verified_hotspot enable row level security;
alter table public.hotspots enable row level security;

drop policy if exists "verified_hotspot_public_select" on public.verified_hotspot;
create policy "verified_hotspot_public_select" on public.verified_hotspot
for select using (true);

drop policy if exists "verified_hotspot_authenticated_write" on public.verified_hotspot;
create policy "verified_hotspot_authenticated_write" on public.verified_hotspot
for all to authenticated
using (true)
with check (true);

drop policy if exists "hotspots_public_select" on public.hotspots;
create policy "hotspots_public_select" on public.hotspots
for select using (true);

drop policy if exists "hotspots_public_insert" on public.hotspots;
create policy "hotspots_public_insert" on public.hotspots
for insert to authenticated
with check (is_verified = false and source = 'user' and (user_id is null or auth.uid() = user_id));

drop policy if exists "hotspots_authenticated_update" on public.hotspots;
create policy "hotspots_authenticated_update" on public.hotspots
for update to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hotspot-images',
  'hotspot-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hotspot_images_public_read" on storage.objects;
create policy "hotspot_images_public_read" on storage.objects
for select using (bucket_id = 'hotspot-images');

drop policy if exists "hotspot_images_public_upload" on storage.objects;
create policy "hotspot_images_public_upload" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'hotspot-images');

drop policy if exists "hotspot_images_authenticated_update" on storage.objects;
create policy "hotspot_images_authenticated_update" on storage.objects
for update to authenticated
using (bucket_id = 'hotspot-images')
with check (bucket_id = 'hotspot-images');

drop policy if exists "hotspot_images_authenticated_delete" on storage.objects;
create policy "hotspot_images_authenticated_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'hotspot-images');
