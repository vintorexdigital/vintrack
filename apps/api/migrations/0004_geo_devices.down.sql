drop table if exists devices cascade;
alter table punches drop column if exists fence_matched;
drop table if exists geo_fences cascade;
