-- Only the backend's dedicated database role can read/write app tables.
GRANT USAGE ON SCHEMA public TO nexus_app;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['nexus_users','nexus_sessions','nexus_profiles','nexus_projects','nexus_seasons','nexus_episodes','nexus_favorites','nexus_progress'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO nexus_app', t);
    EXECUTE format('CREATE POLICY nexus_app_backend ON public.%I FOR ALL TO nexus_app USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
