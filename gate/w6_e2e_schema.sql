CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE event_type AS ENUM ('hackathon','buildathon','datathon','game_jam','ideathon','innovation_challenge','ai_challenge','data_science_competition','coding_competition','security_ctf','hardware_challenge','startup_challenge','open_innovation_challenge','designathon','quant_competition','robotics_competition','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE event_status AS ENUM ('ANNOUNCED','REGISTRATION_UPCOMING','REGISTRATION_OPEN','REGISTRATION_CLOSED','UPCOMING','ONGOING','SUBMISSIONS_OPEN','JUDGING','RESULTS_PENDING','COMPLETED','CANCELLED','POSTPONED','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE event_format AS ENUM ('ONLINE','IN_PERSON','HYBRID','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE source_ingestion_mode AS ENUM ('API','RSS','SITEMAP','STATIC_HTML','BROWSER','SEARCH_DISCOVERY','MANUAL','PARTNER','DISCOVERY_ONLY','BLOCKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE source_health AS ENUM ('HEALTHY','DEGRADED','BROKEN','BLOCKED','PERMISSION_REQUIRED','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crawl_run_status AS ENUM ('RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fetch_status AS ENUM ('PENDING','FETCHED','UNCHANGED','FAILED','SKIPPED','BLOCKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE extraction_method AS ENUM ('API','JSON_LD','EMBEDDED_JSON','DETERMINISTIC','LLM','MANUAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE eligibility_result AS ENUM ('ELIGIBLE','INELIGIBLE','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conflict_severity AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE review_state AS ENUM ('OPEN','IN_REVIEW','RESOLVED','DISMISSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, domain text,
  source_family text, source_type text, ingestion_mode source_ingestion_mode NOT NULL,
  permission_status text, health source_health NOT NULL DEFAULT 'UNKNOWN', active boolean NOT NULL DEFAULT true,
  priority smallint NOT NULL DEFAULT 50, UNIQUE(domain,source_family)
);
CREATE TABLE crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES sources(id),
  status crawl_run_status NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  discovered_count integer NOT NULL DEFAULT 0, fetched_count integer NOT NULL DEFAULT 0,
  parsed_count integer NOT NULL DEFAULT 0, valid_event_count integer NOT NULL DEFAULT 0,
  unique_event_count integer NOT NULL DEFAULT 0
);
CREATE TABLE fetch_attempts (
  id bigserial PRIMARY KEY, crawl_run_id uuid REFERENCES crawl_runs(id), source_id uuid REFERENCES sources(id),
  requested_url text NOT NULL, final_url text, status fetch_status NOT NULL, http_status integer,
  content_type text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE raw_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid REFERENCES sources(id),
  fetch_attempt_id bigint REFERENCES fetch_attempts(id), url text NOT NULL, canonical_url text NOT NULL,
  http_status integer, content_type text, content_hash char(64) NOT NULL, extracted_text text,
  fetched_at timestamptz NOT NULL, parser_status text, UNIQUE(canonical_url,content_hash)
);
CREATE TABLE hackathons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL, normalized_name text NOT NULL,
  subtitle text, short_description text, full_description text, event_type event_type NOT NULL DEFAULT 'hackathon',
  is_hackathon_like boolean NOT NULL DEFAULT true, status event_status NOT NULL DEFAULT 'UNKNOWN', format event_format NOT NULL DEFAULT 'UNKNOWN',
  official_url text, registration_url text, application_url text, registration_close_at timestamptz,
  start_at timestamptz, end_at timestamptz, last_verified_at timestamptz, source_count integer NOT NULL DEFAULT 0,
  quality_score numeric(5,2), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_event_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid REFERENCES sources(id), hackathon_id uuid REFERENCES hackathons(id),
  raw_document_id uuid REFERENCES raw_documents(id), source_event_id text, url text NOT NULL, normalized_url text NOT NULL,
  UNIQUE(source_id,normalized_url)
);
CREATE TABLE source_observations (
  id bigserial PRIMARY KEY, hackathon_id uuid REFERENCES hackathons(id), source_event_ref_id uuid REFERENCES source_event_refs(id),
  source_id uuid REFERENCES sources(id), raw_document_id uuid REFERENCES raw_documents(id), field_path text NOT NULL,
  value_json jsonb NOT NULL, normalized_value_json jsonb, extraction_method extraction_method NOT NULL,
  extraction_confidence numeric(5,4), evidence_text text, method_version text, observed_at timestamptz NOT NULL
);
CREATE TABLE canonical_field_selections (
  id bigserial PRIMARY KEY, hackathon_id uuid NOT NULL REFERENCES hackathons(id), field_path text NOT NULL,
  selected_observation_id bigint NOT NULL REFERENCES source_observations(id), policy_version text NOT NULL,
  score numeric(8,6), active boolean NOT NULL DEFAULT true
);
CREATE TABLE review_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_type text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
  severity conflict_severity NOT NULL DEFAULT 'MEDIUM', state review_state NOT NULL DEFAULT 'OPEN', payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE, display_name text, timezone text, country_code char(2)
);
CREATE TABLE recommendation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), hackathon_id uuid NOT NULL REFERENCES hackathons(id),
  eligibility_result eligibility_result NOT NULL, score numeric(7,4), model_version text NOT NULL,
  positive_reasons jsonb NOT NULL DEFAULT '[]'::jsonb, negative_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_hash char(64), profile_version integer, event_snapshot_hash char(64), components jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE canonical_changes (
  id bigserial PRIMARY KEY, hackathon_id uuid NOT NULL REFERENCES hackathons(id), field_path text NOT NULL, change_type text NOT NULL,
  old_value_json jsonb, new_value_json jsonb, meaningful boolean NOT NULL DEFAULT true, detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), alert_rule_id uuid,
  hackathon_id uuid REFERENCES hackathons(id), canonical_change_id bigint REFERENCES canonical_changes(id),
  alert_type text NOT NULL, dedup_key text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz, UNIQUE(user_id,dedup_key)
);
CREATE TABLE hackathon_search_documents (
  hackathon_id uuid PRIMARY KEY REFERENCES hackathons(id) ON DELETE CASCADE,
  plain_text text NOT NULL, document tsvector NOT NULL, indexed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hackathon_search_documents_gin_idx ON hackathon_search_documents USING gin(document);
CREATE OR REPLACE FUNCTION w6_e2e_refresh_search() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active THEN
    INSERT INTO hackathon_search_documents(hackathon_id,plain_text,document,indexed_at)
      VALUES(NEW.id,concat_ws(' ',NEW.name,NEW.subtitle,NEW.short_description,NEW.full_description),to_tsvector('simple',concat_ws(' ',NEW.name,NEW.subtitle,NEW.short_description,NEW.full_description)),now())
      ON CONFLICT(hackathon_id) DO UPDATE SET plain_text=excluded.plain_text,document=excluded.document,indexed_at=now();
  ELSE
    DELETE FROM hackathon_search_documents WHERE hackathon_id=NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER w6_e2e_search_trg AFTER INSERT OR UPDATE OF name,subtitle,short_description,full_description,is_active ON hackathons FOR EACH ROW EXECUTE FUNCTION w6_e2e_refresh_search();
