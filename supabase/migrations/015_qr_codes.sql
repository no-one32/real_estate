-- QR codes generated from the client dashboard (QR tab of a project).
-- Shared by everyone who has access to the project.

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.complexes (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  label text not null default '',
  url text not null,
  size integer not null default 1024 check (size in (512, 1024, 2048)),
  logo text,                                   -- small center image as a PNG data URL (≤ 256 px), optional
  created_at timestamptz not null default now()
);

create index if not exists qr_codes_complex_created_idx on public.qr_codes (complex_id, created_at desc);

-- Written and read only by the server (service role), after checking project access.
alter table public.qr_codes enable row level security;
