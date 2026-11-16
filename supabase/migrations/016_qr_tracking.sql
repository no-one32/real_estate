-- Which QR code brought each visit (codes made on the client dashboard's QR tab).
-- Run after 015_qr_codes.sql.

alter table public.complex_visits
  add column if not exists qr_id uuid references public.qr_codes (id) on delete set null;

create index if not exists complex_visits_qr_idx on public.complex_visits (qr_id) where qr_id is not null;
