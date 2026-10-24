-- Keep every branch open on Saturdays until 22:00 (10 pm), including dates previously
-- listed as second- or fourth-Saturday closures.

update branches
set
  hours = jsonb_set(
    hours,
    '{6}',
    '{"open": "10:00", "close": "22:00"}'::jsonb
  ),
  holidays = coalesce(
    (
      select jsonb_agg(elem)
      from jsonb_array_elements(coalesce(holidays, '[]'::jsonb)) as elem
      where extract(dow from (elem #>> '{}')::date) <> 6
    ),
    '[]'::jsonb
  );
