-- One name per item (D054, product owner 2026-10-13). Screens show a single Name,
-- Location and Points name; both language columns keep the same text so every
-- reader (players, exports, Excel) stays unchanged. Existing items keep their
-- Arabic text, falling back to English. Renames are not score changes, so manual
-- tie orders are kept.
alter table public.teams disable trigger phase6_teams_invalidate;

update public.events set
  name_en = coalesce(nullif(btrim(name_ar),''), name_en),
  name_ar = coalesce(nullif(btrim(name_ar),''), name_en),
  currency_en_one = coalesce(nullif(btrim(currency_ar_plural),''), currency_en_other),
  currency_en_other = coalesce(nullif(btrim(currency_ar_plural),''), currency_en_other),
  currency_ar_one = coalesce(nullif(btrim(currency_ar_plural),''), currency_en_other),
  currency_ar_two = coalesce(nullif(btrim(currency_ar_plural),''), currency_en_other),
  currency_ar_plural = coalesce(nullif(btrim(currency_ar_plural),''), currency_en_other);

update public.teams set
  name_en = left(coalesce(nullif(btrim(name_ar),''), name_en), 80),
  name_ar = left(coalesce(nullif(btrim(name_ar),''), name_en), 80);

alter table public.teams enable trigger phase6_teams_invalidate;

update public.games set
  name_en = coalesce(nullif(btrim(name_ar),''), name_en),
  name_ar = coalesce(nullif(btrim(name_ar),''), name_en),
  location_en = coalesce(nullif(btrim(location_ar),''), location_en),
  location_ar = coalesce(nullif(btrim(location_ar),''), location_en);

update public.rounds set
  name_en = coalesce(nullif(btrim(name_ar),''), name_en),
  name_ar = coalesce(nullif(btrim(name_ar),''), name_en)
where coalesce(name_en,'') <> '' or coalesce(name_ar,'') <> '';

update public.members set
  full_name_en = coalesce(nullif(btrim(full_name_ar),''), full_name_en),
  full_name_ar = coalesce(nullif(btrim(full_name_ar),''), full_name_en);
