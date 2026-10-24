-- Migration: 20261024000001_audit_log_columns.sql
-- Ensure audit_log has all fields used by staff RPCs

alter table audit_log add column if not exists staff_id text;
alter table audit_log add column if not exists branch_id text;
alter table audit_log add column if not exists entity_type text;
alter table audit_log add column if not exists entity_id text;
alter table audit_log alter column actor drop not null;
alter table audit_log alter column entity drop not null;
