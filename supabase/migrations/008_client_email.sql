-- Adds an optional email address to client records.
alter table public.clients add column if not exists email text;
