drop table if exists audit_log cascade;
drop function if exists ensure_audit_partitions(int, int);
drop table if exists outbox, idempotency_keys, settings, sequences, roles cascade;
drop schema if exists platform cascade;
drop function if exists app_employee_id();
drop function if exists app_user_id();
drop function if exists app_tenant_id();
