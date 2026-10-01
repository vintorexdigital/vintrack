drop table if exists app_classes cascade;

create or replace function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
  perform ensure_monthly_partitions('location_pings', 1, months_ahead);
end $$;
drop table if exists activity_buckets cascade;
