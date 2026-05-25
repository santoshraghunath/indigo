-- =============================================================================
-- Indigo Sample Project Data — GGB Tenant
-- Run in Supabase SQL Editor.
-- Does NOT insert into `customers` — uses existing BB customer records.
-- Creates: jobs → projects → phases → milestones
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING.
-- =============================================================================

DO $$
DECLARE
  v_tenant_id   uuid := '94019f53-f9fa-436b-8071-3b956eb596a4';
  v_pm_user_id  uuid;
  v_customer_id uuid;

  -- Job IDs
  j1 uuid := gen_random_uuid();
  j2 uuid := gen_random_uuid();
  j3 uuid := gen_random_uuid();
  j4 uuid := gen_random_uuid();
  j5 uuid := gen_random_uuid();

  -- Project IDs
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  p4 uuid := gen_random_uuid();
  p5 uuid := gen_random_uuid();

  -- Phase IDs
  ph1a uuid := gen_random_uuid();
  ph1b uuid := gen_random_uuid();
  ph1c uuid := gen_random_uuid();
  ph3a uuid := gen_random_uuid();
  ph3b uuid := gen_random_uuid();

BEGIN

  -- -----------------------------------------------------------------------
  -- 0. Resolve PM user
  -- -----------------------------------------------------------------------
  SELECT id INTO v_pm_user_id
  FROM auth.users
  WHERE email = 'santosh@goodguybuilders.com'
  LIMIT 1;

  IF v_pm_user_id IS NULL THEN
    RAISE EXCEPTION 'PM user santosh@goodguybuilders.com not found. Run create_superadmin.sql first.';
  END IF;

  RAISE NOTICE 'PM user: %', v_pm_user_id;

  -- -----------------------------------------------------------------------
  -- 1. Resolve an existing customer for this tenant
  --    (customers is a BB table — we use what's already there)
  -- -----------------------------------------------------------------------
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION
      'No customers found for tenant %. '
      'Please add at least one customer in BuildersBooks first, then re-run this script.',
      v_tenant_id;
  END IF;

  RAISE NOTICE 'Using customer_id: %', v_customer_id;

  -- -----------------------------------------------------------------------
  -- 2. Jobs
  -- -----------------------------------------------------------------------
  INSERT INTO public.jobs (
    id, tenant_id, job_number, job_name, customer_id,
    status, job_type,
    start_date, target_completion,
    contract_amount_cents, current_contract_cents, contract_value_cents,
    address_line1, city, state, zip, job_address,
    description, notes, internal_notes,
    has_construction_loan, pm_user_id,
    permit_number, permit_issued_date, permit_expiry_date,
    lender_name, loan_amount_cents,
    package_name, tags
  ) VALUES
    -- 1. Hernandez Residence — Active Custom, construction loan, phases defined
    (j1, v_tenant_id, 'GGB-2025-001', 'Hernandez Residence — Full Remodel', v_customer_id,
     'active', 'custom',
     '2025-02-10', '2025-11-30',
     48500000, 51200000, 48500000,
     '1842 Westwood Blvd', 'Los Angeles', 'CA', '90024',
     '1842 Westwood Blvd, Los Angeles, CA 90024',
     'Full gut renovation of 3,200 sq ft single-family residence. Includes new kitchen, two full bathroom remodels, master suite addition, and complete HVAC replacement.',
     'Client prefers morning site visits. Code compliance review in progress.',
     'Watch permit timeline — city has been slow on inspections.',
     true, v_pm_user_id,
     'BLD-2025-04412', '2025-01-28', '2026-01-27',
     'Pacific Premier Bank', 62000000,
     'Premium Interior', ARRAY['remodel', 'addition', 'hvac']),

    -- 2. Johnson Kitchen & Bath — Active Express
    (j2, v_tenant_id, 'GGB-2025-002', 'Johnson Kitchen & Bath Renovation', v_customer_id,
     'active', 'express',
     '2025-04-01', '2025-07-15',
     6250000, 6250000, 6250000,
     '327 Oak Knoll Ave', 'Pasadena', 'CA', '91103',
     '327 Oak Knoll Ave, Pasadena, CA 91103',
     'Kitchen full remodel and two bathroom updates. New cabinetry, countertops, tile, fixtures throughout.',
     'Materials ordered — cabinets arrive May 12.',
     null,
     false, v_pm_user_id,
     null, null, null,
     null, null,
     'Express Kitchen', ARRAY['kitchen', 'bath', 'express']),

    -- 3. Martinez ADU — Active Custom, construction loan, phases defined
    (j3, v_tenant_id, 'GGB-2025-003', 'Martinez Detached ADU', v_customer_id,
     'active', 'custom',
     '2025-03-15', '2025-12-20',
     29500000, 31800000, 29500000,
     '4418 Kenneth Rd', 'Glendale', 'CA', '91205',
     '4418 Kenneth Rd, Glendale, CA 91205',
     'New detached ADU, 1,100 sq ft, 2BR/1BA. Includes separate utility meters, covered parking, and landscaped separation from main house.',
     'Client wants weekly photo updates sent to client portal.',
     'Subcontractor bids for framing still pending.',
     true, v_pm_user_id,
     'ADU-2025-00887', '2025-02-20', '2026-02-19',
     'First Republic Bank', 37500000,
     'ADU Standard', ARRAY['adu', 'new-construction']),

    -- 4. Thompson Estate — Bidding
    (j4, v_tenant_id, 'GGB-2025-004', 'Thompson Estate — New Construction', v_customer_id,
     'bidding', 'custom',
     null, null,
     185000000, null, null,
     '750 Loma Vista Dr', 'Beverly Hills', 'CA', '90210',
     '750 Loma Vista Dr, Beverly Hills, CA 90210',
     'Custom 6,400 sq ft estate on 0.8 acre lot. Full scope includes pool house, detached garage, smart home integration, and custom millwork throughout.',
     'Bid review meeting scheduled for June 3. Architect: Tanner & Associates.',
     'High-value client — flag for priority scheduling if bid accepted.',
     false, v_pm_user_id,
     null, null, null,
     null, null,
     'Estate Premium', ARRAY['new-construction', 'luxury', 'pool']),

    -- 5. Wong Bathroom — Complete Express
    (j5, v_tenant_id, 'GGB-2024-047', 'Wong Master Bathroom Remodel', v_customer_id,
     'complete', 'express',
     '2024-10-07', '2024-12-15',
     3875000, 3875000, 3875000,
     '2211 N Frederic St', 'Burbank', 'CA', '91502',
     '2211 N Frederic St, Burbank, CA 91502',
     'Master bathroom gut renovation. Walk-in shower, freestanding tub, heated floors, custom vanity.',
     'Final punch list cleared Dec 12. Client signed off.',
     null,
     false, v_pm_user_id,
     null, null, null,
     null, null,
     'Express Bath', ARRAY['bath', 'express'])

  ON CONFLICT (id) DO NOTHING;

  -- -----------------------------------------------------------------------
  -- 3. Projects (thin join table)
  -- -----------------------------------------------------------------------
  INSERT INTO public.projects (id, tenant_id, job_id, created_by)
  VALUES
    (p1, v_tenant_id, j1, v_pm_user_id),
    (p2, v_tenant_id, j2, v_pm_user_id),
    (p3, v_tenant_id, j3, v_pm_user_id),
    (p4, v_tenant_id, j4, v_pm_user_id),
    (p5, v_tenant_id, j5, v_pm_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- -----------------------------------------------------------------------
  -- 4. Phases — Hernandez (p1)
  -- -----------------------------------------------------------------------
  INSERT INTO public.project_phases (id, project_id, tenant_id, name, sequence, status, color, start_date, end_date)
  VALUES
    (ph1a, p1, v_tenant_id, 'Demo & Rough-In',      1, 'complete',     '#16a34a', '2025-02-10', '2025-04-15'),
    (ph1b, p1, v_tenant_id, 'Framing & MEP',         2, 'in_progress',  '#6366f1', '2025-04-16', '2025-07-01'),
    (ph1c, p1, v_tenant_id, 'Finishes & Close-Out',  3, 'not_started',  '#d1d5db', '2025-07-02', '2025-11-30')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.milestones (
    id, project_id, tenant_id, phase_id, name, status, sequence,
    due_date, completed_date,
    is_client_visible, requires_client_approval, triggers_draw_request, triggers_invoice
  ) VALUES
    (gen_random_uuid(), p1, v_tenant_id, ph1a, 'Demolition Complete',          'complete',     1,  '2025-02-28', '2025-02-27', true,  false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1a, 'Rough Plumbing Inspection',    'complete',     2,  '2025-03-20', '2025-03-22', false, false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1a, 'Rough Electrical Inspection',  'complete',     3,  '2025-04-05', '2025-04-08', false, false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1a, 'Foundation Draw Request',      'complete',     4,  '2025-04-10', '2025-04-10', true,  true,  true,  true),
    (gen_random_uuid(), p1, v_tenant_id, ph1b, 'Framing Complete',             'complete',     5,  '2025-05-15', '2025-05-18', true,  false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1b, 'HVAC Rough-In',                'in_progress',  6,  '2025-06-01', null,         false, false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1b, 'Insulation & Drywall',         'not_started',  7,  '2025-06-20', null,         false, false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1b, 'Framing Draw Request',         'not_started',  8,  '2025-06-25', null,         true,  true,  true,  true),
    (gen_random_uuid(), p1, v_tenant_id, ph1c, 'Tile & Flooring',              'not_started',  9,  '2025-08-15', null,         false, false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1c, 'Cabinetry Install',            'not_started', 10,  '2025-09-01', null,         true,  false, false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1c, 'Final Inspection',             'not_started', 11,  '2025-11-10', null,         true,  true,  false, false),
    (gen_random_uuid(), p1, v_tenant_id, ph1c, 'Final Draw & Completion',      'not_started', 12,  '2025-11-30', null,         true,  true,  true,  true)
  ON CONFLICT (id) DO NOTHING;

  -- -----------------------------------------------------------------------
  -- 5. Phases — Martinez ADU (p3)
  -- -----------------------------------------------------------------------
  INSERT INTO public.project_phases (id, project_id, tenant_id, name, sequence, status, color, start_date, end_date)
  VALUES
    (ph3a, p3, v_tenant_id, 'Site Work & Foundation', 1, 'complete',    '#16a34a', '2025-03-15', '2025-05-10'),
    (ph3b, p3, v_tenant_id, 'Framing & Enclosure',    2, 'in_progress', '#6366f1', '2025-05-11', '2025-08-30')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.milestones (
    id, project_id, tenant_id, phase_id, name, status, sequence,
    due_date, completed_date,
    is_client_visible, requires_client_approval, triggers_draw_request, triggers_invoice
  ) VALUES
    (gen_random_uuid(), p3, v_tenant_id, ph3a, 'Site Grading Complete',    'complete',    1, '2025-03-25', '2025-03-26', false, false, false, false),
    (gen_random_uuid(), p3, v_tenant_id, ph3a, 'Foundation Poured',        'complete',    2, '2025-04-15', '2025-04-18', true,  false, false, false),
    (gen_random_uuid(), p3, v_tenant_id, ph3a, 'Foundation Inspection',    'complete',    3, '2025-04-30', '2025-05-02', false, false, false, false),
    (gen_random_uuid(), p3, v_tenant_id, ph3a, 'Foundation Draw Request',  'complete',    4, '2025-05-05', '2025-05-06', true,  true,  true,  true),
    (gen_random_uuid(), p3, v_tenant_id, ph3b, 'Framing Started',          'complete',    5, '2025-05-20', '2025-05-21', true,  false, false, false),
    (gen_random_uuid(), p3, v_tenant_id, ph3b, 'Roof Sheathing',           'in_progress', 6, '2025-06-15', null,         false, false, false, false),
    (gen_random_uuid(), p3, v_tenant_id, ph3b, 'Windows & Doors',          'not_started', 7, '2025-07-10', null,         true,  false, false, false),
    (gen_random_uuid(), p3, v_tenant_id, ph3b, 'Weathertight Inspection',  'not_started', 8, '2025-08-01', null,         false, false, false, false)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Seed complete.';
  RAISE NOTICE '  Tenant    : %', v_tenant_id;
  RAISE NOTICE '  PM        : %', v_pm_user_id;
  RAISE NOTICE '  Customer  : % (existing BB record)', v_customer_id;
  RAISE NOTICE '  Jobs      : GGB-2025-001, 002, 003, 004 and GGB-2024-047';
  RAISE NOTICE '  Projects  : 5 linked';
  RAISE NOTICE '  Phases    : 5 with milestones on Hernandez + Martinez ADU';
  RAISE NOTICE '====================================================';

END $$;
