-- DEMO DATA for the "villas-ajyad" analytics pages (Traffic + Property).
-- Run after 015 and 016. Safe to run once; every demo row is easy to remove (see the end of the file).
--   · 4 demo QR codes (labels start with "Demo ·")
--   · ~2,400 tour visits over the last 90 days (visitor ids start with "demo-")
--     sources ≈ Direct 40% · QR 24% · Instagram 16% · Facebook 12% · WhatsApp/Google 8%
--   · villa views and favorites, with a few popular villas and a long tail
-- No leads (contacts) are created, so no fake people appear in Contacts or Notifications.

do $$
declare
  cx uuid;
  site text := 'https://ajyad.axis-studio.com';   -- only used inside the demo QR links
  q1 uuid; q2 uuid; q3 uuid; q4 uuid;
  n_units int;
begin
  select id into cx from public.complexes where slug = 'villas-ajyad';
  if cx is null then raise exception 'Project villas-ajyad not found'; end if;

  if exists (select 1 from public.complex_visits where complex_id = cx and visitor_id like 'demo-%') then
    raise notice 'Demo data already present: nothing done.';
    return;
  end if;

  insert into public.qr_codes (complex_id, label, url, size, created_at)
    values (cx, 'Demo · Sales office flyer', site || '/c/villas-ajyad?src=qr', 1024, now() - interval '88 days') returning id into q1;
  insert into public.qr_codes (complex_id, label, url, size, created_at)
    values (cx, 'Demo · Billboard King Fahd Rd', site || '/c/villas-ajyad?src=qr', 2048, now() - interval '70 days') returning id into q2;
  insert into public.qr_codes (complex_id, label, url, size, created_at)
    values (cx, 'Demo · Brochure', site || '/c/villas-ajyad?src=qr', 1024, now() - interval '45 days') returning id into q3;
  insert into public.qr_codes (complex_id, label, url, size, created_at)
    values (cx, 'Demo · Expo stand', site || '/c/villas-ajyad?src=qr', 512, now() - interval '20 days') returning id into q4;

  -- visits: more recent days are busier; ~950 devices so some people come back
  insert into public.complex_visits (complex_id, visitor_id, created_at, source, device, os, city, country, duration_s, qr_id)
  select
    cx,
    'demo-' || lpad(floor(power(r_vis, 1.3) * 950)::int::text, 6, '0'),
    now() - (power(r_day, 1.25) * interval '90 days') - (random() * interval '20 hours'),
    src,
    dev,
    case dev
      when 'mobile' then case when r_os < 0.58 then 'iOS' else 'Android' end
      when 'tablet' then case when r_os < 0.8 then 'iOS' else 'Android' end
      else case when r_os < 0.72 then 'Windows' else 'macOS' end
    end,
    (array['Khamis Mushait','Abha','Riyadh','Jeddah','Dammam','Najran','Jazan','Mecca','Medina'])[1 + floor(power(r_city, 1.8) * 9)::int],
    'SA',
    case when r_dur < 0.12 then floor(random() * 9)::int else 20 + floor(power(random(), 1.7) * 900)::int end,
    case when src = 'qr' then case when r_qr < 0.42 then q1 when r_qr < 0.70 then q2 when r_qr < 0.88 then q3 else q4 end end
  from (
    select
      random() as r_vis, random() as r_day, random() as r_os, random() as r_city, random() as r_dur, random() as r_qr,
      case
        when r_src < 0.40 then 'direct' when r_src < 0.64 then 'qr' when r_src < 0.80 then 'instagram'
        when r_src < 0.92 then 'facebook' when r_src < 0.96 then 'whatsapp' else 'google'
      end as src,
      case when r_dev < 0.64 then 'mobile' when r_dev < 0.92 then 'desktop' else 'tablet' end as dev
    from (select g, random() as r_src, random() as r_dev from generate_series(1, 2400) g) s0
  ) s;

  -- a fixed "popularity order" of the villas: the first ones get most of the attention
  create temporary table demo_units on commit drop as
    select display_id, row_number() over (order by random()) as rn
    from public.units where complex_id = cx;
  select count(*) into n_units from demo_units;
  if n_units = 0 then raise notice 'No villas in this project: only visits were created.'; return; end if;

  -- villa views: 0–5 per visit (not for quick exits)
  insert into public.unit_events (complex_id, visit_id, visitor_id, unit_display_id, kind, duration_s, created_at)
  select v.complex_id, v.id, v.visitor_id, u.display_id, 'view', 15 + floor(random() * 220)::int, v.created_at + random() * interval '8 minutes'
  from public.complex_visits v
  cross join lateral generate_series(1, floor(random() * 6 + 0 * v.id)::int) k
  cross join lateral (select 1 + least(n_units - 1, floor(power(random(), 1.7) * n_units + 0 * k)::int) as rn) pick
  join demo_units u on u.rn = pick.rn
  where v.complex_id = cx and v.visitor_id like 'demo-%' and v.duration_s >= 10;

  -- favorites: about 1 visit in 5 likes 1–3 villas, strongly skewed to the popular ones
  insert into public.unit_events (complex_id, visit_id, visitor_id, unit_display_id, kind, duration_s, created_at)
  select v.complex_id, v.id, v.visitor_id, u.display_id, 'favorite', 0, v.created_at + random() * interval '10 minutes'
  from public.complex_visits v
  cross join lateral generate_series(1, (case when random() < 0.2 then 1 + floor(random() * 3) else 0 end + 0 * v.id)::int) k
  cross join lateral (select 1 + least(n_units - 1, floor(power(random(), 1.5) * n_units + 0 * k)::int) as rn) pick
  join demo_units u on u.rn = pick.rn
  where v.complex_id = cx and v.visitor_id like 'demo-%' and v.duration_s >= 10;
end $$;

-- ---------------------------------------------------------------------------
-- To REMOVE all demo data later, run:
--
-- delete from public.unit_events   where visitor_id like 'demo-%';
-- delete from public.complex_visits where visitor_id like 'demo-%';
-- delete from public.qr_codes       where label like 'Demo ·%';
-- ---------------------------------------------------------------------------
