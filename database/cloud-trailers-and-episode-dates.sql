-- Safe additive update for existing Nexus databases. Run before deploying the API.
ALTER TABLE public.nexus_projects ADD COLUMN IF NOT EXISTS trailer text NOT NULL DEFAULT '';
ALTER TABLE public.nexus_episodes ADD COLUMN IF NOT EXISTS "releaseDate" date;
