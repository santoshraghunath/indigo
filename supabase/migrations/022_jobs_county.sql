-- ============================================================
-- Indigo Migration 022: Add county to jobs
-- ADDITIVE ONLY — safe to run on production.
-- ============================================================
-- Adds an Indigo-managed county column alongside the existing
-- address fields (address_line1, city, state, zip). Populated
-- by the address autocomplete (HERE Maps) at project creation.
-- BuilderBooks does not write this column.
-- ============================================================

alter table jobs
  add column if not exists county text;

comment on column jobs.county is
  'County name populated by Indigo address autocomplete (HERE Maps). '
  'Not written by BuilderBooks.';
