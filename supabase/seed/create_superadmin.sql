-- =============================================================================
-- Indigo Superadmin Seed Script
-- Run in Supabase SQL Editor.
-- Uses the EXISTING BuildersBooks tenant — never creates a second one.
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING / DO UPDATE.
-- =============================================================================

DO $$
DECLARE
  v_tenant_id   uuid;
  v_tenant_slug text := 'ggb';          -- <-- set to your BB tenant slug
  v_user_id     uuid;
  v_user_email  text := 'santosh@goodguybuilders.com';
  v_password    text := 'ChangeMe123!'; -- <-- change after first login
BEGIN

  -- -------------------------------------------------------------------
  -- 1. Find the existing BB tenant — abort if not found
  -- -------------------------------------------------------------------
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = v_tenant_slug
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant with slug "%" not found. Run: SELECT slug FROM tenants; and update v_tenant_slug above.', v_tenant_slug;
  END IF;

  RAISE NOTICE 'Using tenant: % (%)', v_tenant_slug, v_tenant_id;

  -- -------------------------------------------------------------------
  -- 2. Check if auth user already exists
  -- -------------------------------------------------------------------
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_user_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    -- 2a. Create the auth.users row
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_user_email,
      crypt(v_password, gen_salt('bf')), now(),
      now(), now(),
      jsonb_build_object(
        'provider',  'email',
        'providers', array['email'],
        'tenant_id', v_tenant_id::text
      ),
      '{}', false, '', '', '', ''
    );

    -- 2b. Create auth.identities row (required for email/password login)
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data,
      provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_email, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_user_email),
      'email', now(), now(), now()
    );

    RAISE NOTICE 'Created auth user: % (%)', v_user_email, v_user_id;
  ELSE
    -- User exists — ensure tenant_id is stamped in app_metadata
    UPDATE auth.users
    SET raw_app_meta_data =
          raw_app_meta_data || jsonb_build_object('tenant_id', v_tenant_id::text)
    WHERE id = v_user_id;
    RAISE NOTICE 'Auth user already exists — updated app_metadata: % (%)', v_user_email, v_user_id;
  END IF;

  -- -------------------------------------------------------------------
  -- 3. Create user_profile (id + email only — safest common columns)
  --    We will update with name/avatar once the exact schema is confirmed.
  -- -------------------------------------------------------------------
  INSERT INTO public.user_profiles (id, email)
  VALUES (v_user_id, v_user_email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  -- -------------------------------------------------------------------
  -- 4. Create tenant_member with owner role
  -- -------------------------------------------------------------------
  INSERT INTO public.tenant_members (
    id, tenant_id, user_id, role, is_active, joined_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_tenant_id, v_user_id,
    'owner', true, now(), now(), now()
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role      = 'owner',
        is_active = true,
        updated_at = now();

  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Done.';
  RAISE NOTICE '  Tenant  : % (%)', v_tenant_slug, v_tenant_id;
  RAISE NOTICE '  User ID : %',     v_user_id;
  RAISE NOTICE '  Email   : %',     v_user_email;
  RAISE NOTICE '  Password: %',     v_password;
  RAISE NOTICE '====================================================';

END $$;
