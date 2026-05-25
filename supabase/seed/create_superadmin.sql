-- =============================================================================
-- Indigo Superadmin Seed Script
-- Run once in Supabase SQL Editor to create the first GGB owner account.
-- Safe to run multiple times — uses ON CONFLICT DO NOTHING throughout.
-- =============================================================================

DO $$
DECLARE
  v_tenant_id   uuid;
  v_user_id     uuid := gen_random_uuid();
  v_user_email  text := 'santosh@goodguybuilders.com';
  v_password    text := 'ChangeMe123!';   -- <-- change before running in prod
BEGIN

  -- -------------------------------------------------------------------
  -- 1. Create or reuse the GGB tenant
  -- -------------------------------------------------------------------
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = 'ggb'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (id, name, slug, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Good Guy Builders', 'ggb', now(), now())
    RETURNING id INTO v_tenant_id;
    RAISE NOTICE 'Created tenant: %', v_tenant_id;
  ELSE
    RAISE NOTICE 'Using existing tenant: %', v_tenant_id;
  END IF;

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
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_user_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      now(),
      now(),
      jsonb_build_object(
        'provider',   'email',
        'providers',  array['email'],
        'tenant_id',  v_tenant_id::text
      ),
      jsonb_build_object('full_name', 'Santosh Raghunath'),
      false,
      '', '', '', ''
    );

    -- 2b. Create the auth.identities row (required for email login)
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_email,
      v_user_id,
      jsonb_build_object(
        'sub',   v_user_id::text,
        'email', v_user_email
      ),
      'email',
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Created auth user: % (%)', v_user_email, v_user_id;
  ELSE
    -- User exists — make sure app_metadata has tenant_id
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('tenant_id', v_tenant_id::text)
    WHERE id = v_user_id;
    RAISE NOTICE 'Auth user already exists: % (%)', v_user_email, v_user_id;
  END IF;

  -- -------------------------------------------------------------------
  -- 3. Create or update user_profile
  -- -------------------------------------------------------------------
  INSERT INTO public.user_profiles (id, email, full_name, created_at, updated_at)
  VALUES (v_user_id, v_user_email, 'Santosh Raghunath', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET full_name  = EXCLUDED.full_name,
        updated_at = now();

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
    SET role       = 'owner',
        is_active  = true,
        updated_at = now();

  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Superadmin setup complete.';
  RAISE NOTICE '  Tenant ID : %', v_tenant_id;
  RAISE NOTICE '  User ID   : %', v_user_id;
  RAISE NOTICE '  Email     : %', v_user_email;
  RAISE NOTICE '  Password  : %  (change this!)', v_password;
  RAISE NOTICE '====================================================';

END $$;
