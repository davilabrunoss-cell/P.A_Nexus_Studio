-- Private application data. The Render backend connects as postgres; the Data API has no policies.
CREATE TABLE IF NOT EXISTS public.nexus_users (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  password text NOT NULL, role text NOT NULL CHECK (role IN ('viewer','producer'))
);
CREATE TABLE IF NOT EXISTS public.nexus_sessions (
  token text PRIMARY KEY, "userId" text NOT NULL REFERENCES public.nexus_users(id) ON DELETE CASCADE,
  expires bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.nexus_profiles (
  id text PRIMARY KEY, "userId" text NOT NULL REFERENCES public.nexus_users(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.nexus_projects (
  id text PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '',
  genre text NOT NULL, genres jsonb NOT NULL DEFAULT '["Aventura"]',
  rating text NOT NULL DEFAULT 'L', year integer NOT NULL,
  "releaseDate" date, "scheduledDate" date, cover text NOT NULL DEFAULT '',
  banner text NOT NULL DEFAULT '', trailer text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published')),
  featured boolean NOT NULL DEFAULT false, demo boolean NOT NULL DEFAULT false,
  created timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nexus_seasons (
  id text PRIMARY KEY, "projectId" text NOT NULL REFERENCES public.nexus_projects(id) ON DELETE CASCADE,
  number integer NOT NULL, title text NOT NULL, cover text NOT NULL DEFAULT '',
  UNIQUE ("projectId", number)
);
CREATE TABLE IF NOT EXISTS public.nexus_episodes (
  id text PRIMARY KEY, "seasonId" text NOT NULL REFERENCES public.nexus_seasons(id) ON DELETE CASCADE,
  number integer NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
  cover text NOT NULL DEFAULT '', video text NOT NULL DEFAULT '', duration integer NOT NULL DEFAULT 0,
  "releaseDate" date,
  UNIQUE ("seasonId", number)
);
CREATE TABLE IF NOT EXISTS public.nexus_favorites (
  "profileId" text NOT NULL REFERENCES public.nexus_profiles(id) ON DELETE CASCADE,
  "projectId" text NOT NULL REFERENCES public.nexus_projects(id) ON DELETE CASCADE,
  PRIMARY KEY ("profileId", "projectId")
);
CREATE TABLE IF NOT EXISTS public.nexus_progress (
  "profileId" text NOT NULL REFERENCES public.nexus_profiles(id) ON DELETE CASCADE,
  "episodeId" text NOT NULL REFERENCES public.nexus_episodes(id) ON DELETE CASCADE,
  seconds double precision NOT NULL, duration double precision NOT NULL,
  updated timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("profileId", "episodeId")
);
CREATE INDEX IF NOT EXISTS nexus_sessions_expires_idx ON public.nexus_sessions(expires);
CREATE INDEX IF NOT EXISTS nexus_episodes_season_idx ON public.nexus_episodes("seasonId", number);
CREATE INDEX IF NOT EXISTS nexus_seasons_project_idx ON public.nexus_seasons("projectId", number);
CREATE INDEX IF NOT EXISTS nexus_projects_schedule_idx ON public.nexus_projects("scheduledDate") WHERE status='draft';

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['nexus_users','nexus_sessions','nexus_profiles','nexus_projects','nexus_seasons','nexus_episodes','nexus_favorites','nexus_progress'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('nexus-media', 'nexus-media', false, 52428800,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
ON CONFLICT (id) DO NOTHING;
