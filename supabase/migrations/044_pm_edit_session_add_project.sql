-- Extend pm_edit_work_session to allow reassigning to a different project.
-- Postgres requires DROP + CREATE when the parameter list changes.

DROP FUNCTION IF EXISTS pm_edit_work_session(uuid, timestamptz, timestamptz, int, text, numeric);

CREATE OR REPLACE FUNCTION pm_edit_work_session(
  p_session_id      uuid,
  p_project_id      uuid,
  p_clocked_in_at   timestamptz,
  p_clocked_out_at  timestamptz,
  p_break_minutes   int,
  p_notes           text,
  p_mileage_miles   numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id       uuid    := auth.uid();
  v_session         work_sessions%ROWTYPE;
  v_new_job_id      uuid;
  v_gross_hours     numeric := NULL;
  v_net_hours       numeric := NULL;
  v_regular_hours   numeric := NULL;
  v_ot_1_5_hours    numeric := NULL;
  v_ot_2_0_hours    numeric := NULL;
  v_ot              record;
  v_wage            int     := NULL;
  v_labor_cents     bigint  := NULL;
  v_session_date    date;
BEGIN
  -- ── Load session ──────────────────────────────────────────────────────────
  SELECT * INTO v_session
  FROM   work_sessions
  WHERE  id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  -- ── Verify caller is PM+ in this tenant ──────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE  tenant_id = v_session.tenant_id
      AND  user_id   = v_caller_id
      AND  role      IN ('owner', 'admin', 'project_manager')
      AND  is_active = true
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- ── Resolve new project → job_id (must belong to same tenant) ────────────
  SELECT job_id INTO v_new_job_id
  FROM   projects
  WHERE  id        = p_project_id
    AND  tenant_id = v_session.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  -- ── Validate times ────────────────────────────────────────────────────────
  IF p_clocked_out_at IS NOT NULL AND p_clocked_out_at <= p_clocked_in_at THEN
    RAISE EXCEPTION 'clock_out_before_clock_in';
  END IF;

  -- ── Recompute hours (only for completed sessions) ─────────────────────────
  IF p_clocked_out_at IS NOT NULL THEN
    v_session_date := (p_clocked_in_at AT TIME ZONE 'America/Los_Angeles')::date;

    v_gross_hours := ROUND(
      EXTRACT(EPOCH FROM (p_clocked_out_at - p_clocked_in_at))::numeric / 3600.0,
      2
    );

    v_net_hours := GREATEST(0,
      ROUND(v_gross_hours - (p_break_minutes::numeric / 60.0), 2)
    );

    SELECT * INTO v_ot FROM _compute_ca_ot(v_net_hours, v_session.is_seventh_day);
    v_regular_hours := v_ot.regular_hours;
    v_ot_1_5_hours  := v_ot.ot_1_5_hours;
    v_ot_2_0_hours  := v_ot.ot_2_0_hours;

    SELECT hourly_rate_cents INTO v_wage
    FROM   employee_wages
    WHERE  user_id       = v_session.user_id
      AND  tenant_id     = v_session.tenant_id
      AND  effective_date <= v_session_date
    ORDER  BY effective_date DESC
    LIMIT  1;

    IF v_wage IS NOT NULL THEN
      v_labor_cents := ROUND(
        (v_regular_hours * v_wage)
        + (v_ot_1_5_hours * v_wage * 1.5)
        + (v_ot_2_0_hours * v_wage * 2.0)
      )::bigint;
    END IF;
  END IF;

  -- ── Persist changes ───────────────────────────────────────────────────────
  UPDATE work_sessions
  SET    project_id          = p_project_id,
         job_id              = v_new_job_id,
         clocked_in_at       = p_clocked_in_at,
         clocked_out_at      = p_clocked_out_at,
         total_break_minutes = p_break_minutes,
         notes               = p_notes,
         mileage_miles       = p_mileage_miles,
         gross_hours         = v_gross_hours,
         net_hours           = v_net_hours,
         regular_hours       = v_regular_hours,
         ot_1_5_hours        = v_ot_1_5_hours,
         ot_2_0_hours        = v_ot_2_0_hours,
         wage_snapshot_cents = COALESCE(v_wage, v_session.wage_snapshot_cents),
         labor_cost_cents    = v_labor_cents
  WHERE  id = p_session_id;

  -- ── Sync linked time_entry ────────────────────────────────────────────────
  IF v_session.time_entry_id IS NOT NULL AND v_net_hours IS NOT NULL AND v_session_date IS NOT NULL THEN
    UPDATE time_entries
    SET    project_id = p_project_id,
           job_id     = v_new_job_id,
           hours      = v_net_hours,
           date       = v_session_date
    WHERE  id = v_session.time_entry_id;
  END IF;

  RETURN jsonb_build_object(
    'session_id',       p_session_id,
    'project_id',       p_project_id,
    'job_id',           v_new_job_id,
    'net_hours',        v_net_hours,
    'regular_hours',    v_regular_hours,
    'ot_1_5_hours',     v_ot_1_5_hours,
    'ot_2_0_hours',     v_ot_2_0_hours,
    'labor_cost_cents', v_labor_cents
  );
END;
$$;
