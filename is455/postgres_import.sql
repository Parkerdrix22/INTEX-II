-- PostgreSQL import script for Lighthouse CSV dataset.
-- Run with:
--   psql "postgresql://USER:PASS@HOST:5432/DBNAME" -f is455/postgres_import.sql

BEGIN;

CREATE SCHEMA IF NOT EXISTS lighthouse;
SET search_path TO lighthouse, public;

-- Drop children first, then parents.
DROP TABLE IF EXISTS donation_allocations;
DROP TABLE IF EXISTS in_kind_donation_items;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS partner_assignments;
DROP TABLE IF EXISTS process_recordings;
DROP TABLE IF EXISTS home_visitations;
DROP TABLE IF EXISTS education_records;
DROP TABLE IF EXISTS health_wellbeing_records;
DROP TABLE IF EXISTS intervention_plans;
DROP TABLE IF EXISTS incident_reports;
DROP TABLE IF EXISTS safehouse_monthly_metrics;
DROP TABLE IF EXISTS public_impact_snapshots;
DROP TABLE IF EXISTS residents;
DROP TABLE IF EXISTS supporters;
DROP TABLE IF EXISTS partners;
DROP TABLE IF EXISTS social_media_posts;
DROP TABLE IF EXISTS safehouses;

CREATE TABLE safehouses (
  safehouse_id BIGINT PRIMARY KEY,
  safehouse_code TEXT,
  name TEXT,
  region TEXT,
  city TEXT,
  province TEXT,
  country TEXT,
  open_date DATE,
  status TEXT,
  capacity_girls BIGINT,
  capacity_staff BIGINT,
  current_occupancy BIGINT,
  notes TEXT
);

CREATE TABLE partners (
  partner_id BIGINT PRIMARY KEY,
  partner_name TEXT,
  partner_type TEXT,
  role_type TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  region TEXT,
  status TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT
);

-- NOTE: safehouse_id is NUMERIC in CSV (values like 8.0), so FK to safehouses is omitted here.
CREATE TABLE partner_assignments (
  assignment_id BIGINT PRIMARY KEY,
  partner_id BIGINT REFERENCES partners(partner_id),
  safehouse_id NUMERIC,
  program_area TEXT,
  assignment_start DATE,
  assignment_end DATE,
  responsibility_notes TEXT,
  is_primary BOOLEAN,
  status TEXT
);

CREATE TABLE supporters (
  supporter_id BIGINT PRIMARY KEY,
  supporter_type TEXT,
  display_name TEXT,
  organization_name TEXT,
  first_name TEXT,
  last_name TEXT,
  relationship_type TEXT,
  region TEXT,
  country TEXT,
  email TEXT,
  phone TEXT,
  status TEXT,
  created_at TIMESTAMP,
  first_donation_date DATE,
  acquisition_channel TEXT
);

CREATE TABLE social_media_posts (
  post_id BIGINT PRIMARY KEY,
  platform TEXT,
  platform_post_id TEXT,
  post_url TEXT,
  created_at TIMESTAMP,
  day_of_week TEXT,
  post_hour BIGINT,
  post_type TEXT,
  media_type TEXT,
  caption TEXT,
  hashtags TEXT,
  num_hashtags BIGINT,
  mentions_count BIGINT,
  has_call_to_action BOOLEAN,
  call_to_action_type TEXT,
  content_topic TEXT,
  sentiment_tone TEXT,
  caption_length BIGINT,
  features_resident_story BOOLEAN,
  campaign_name TEXT,
  is_boosted BOOLEAN,
  boost_budget_php NUMERIC,
  impressions BIGINT,
  reach BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  click_throughs BIGINT,
  video_views NUMERIC,
  engagement_rate NUMERIC,
  profile_visits BIGINT,
  donation_referrals BIGINT,
  estimated_donation_value_php NUMERIC,
  follower_count_at_post BIGINT,
  watch_time_seconds NUMERIC,
  avg_view_duration_seconds NUMERIC,
  subscriber_count_at_post NUMERIC,
  forwards NUMERIC
);

CREATE TABLE donations (
  donation_id BIGINT PRIMARY KEY,
  supporter_id BIGINT REFERENCES supporters(supporter_id),
  donation_type TEXT,
  donation_date DATE,
  is_recurring BOOLEAN,
  campaign_name TEXT,
  channel_source TEXT,
  currency_code TEXT,
  amount NUMERIC,
  estimated_value NUMERIC,
  impact_unit TEXT,
  notes TEXT,
  referral_post_id BIGINT REFERENCES social_media_posts(post_id)
);

CREATE TABLE in_kind_donation_items (
  item_id BIGINT PRIMARY KEY,
  donation_id BIGINT REFERENCES donations(donation_id),
  item_name TEXT,
  item_category TEXT,
  quantity BIGINT,
  unit_of_measure TEXT,
  estimated_unit_value NUMERIC,
  intended_use TEXT,
  received_condition TEXT
);

CREATE TABLE donation_allocations (
  allocation_id BIGINT PRIMARY KEY,
  donation_id BIGINT REFERENCES donations(donation_id),
  safehouse_id BIGINT REFERENCES safehouses(safehouse_id),
  program_area TEXT,
  amount_allocated NUMERIC,
  allocation_date DATE,
  allocation_notes TEXT
);

CREATE TABLE residents (
  resident_id BIGINT PRIMARY KEY,
  case_control_no TEXT,
  internal_code TEXT,
  safehouse_id BIGINT REFERENCES safehouses(safehouse_id),
  case_status TEXT,
  sex TEXT,
  date_of_birth DATE,
  birth_status TEXT,
  place_of_birth TEXT,
  religion TEXT,
  case_category TEXT,
  sub_cat_orphaned BOOLEAN,
  sub_cat_trafficked BOOLEAN,
  sub_cat_child_labor BOOLEAN,
  sub_cat_physical_abuse BOOLEAN,
  sub_cat_sexual_abuse BOOLEAN,
  sub_cat_osaec BOOLEAN,
  sub_cat_cicl BOOLEAN,
  sub_cat_at_risk BOOLEAN,
  sub_cat_street_child BOOLEAN,
  sub_cat_child_with_hiv BOOLEAN,
  is_pwd BOOLEAN,
  pwd_type TEXT,
  has_special_needs BOOLEAN,
  special_needs_diagnosis TEXT,
  family_is_4ps BOOLEAN,
  family_solo_parent BOOLEAN,
  family_indigenous BOOLEAN,
  family_parent_pwd BOOLEAN,
  family_informal_settler BOOLEAN,
  date_of_admission DATE,
  age_upon_admission TEXT,
  present_age TEXT,
  length_of_stay TEXT,
  referral_source TEXT,
  referring_agency_person TEXT,
  date_colb_registered DATE,
  date_colb_obtained DATE,
  assigned_social_worker TEXT,
  initial_case_assessment TEXT,
  date_case_study_prepared DATE,
  reintegration_type TEXT,
  reintegration_status TEXT,
  initial_risk_level TEXT,
  current_risk_level TEXT,
  date_enrolled DATE,
  date_closed DATE,
  created_at TIMESTAMP,
  notes_restricted TEXT
);

CREATE TABLE process_recordings (
  recording_id BIGINT PRIMARY KEY,
  resident_id BIGINT REFERENCES residents(resident_id),
  session_date DATE,
  social_worker TEXT,
  session_type TEXT,
  session_duration_minutes BIGINT,
  emotional_state_observed TEXT,
  emotional_state_end TEXT,
  session_narrative TEXT,
  interventions_applied TEXT,
  follow_up_actions TEXT,
  progress_noted BOOLEAN,
  concerns_flagged BOOLEAN,
  referral_made BOOLEAN,
  notes_restricted TEXT
);

CREATE TABLE home_visitations (
  visitation_id BIGINT PRIMARY KEY,
  resident_id BIGINT REFERENCES residents(resident_id),
  visit_date DATE,
  social_worker TEXT,
  visit_type TEXT,
  location_visited TEXT,
  family_members_present TEXT,
  purpose TEXT,
  observations TEXT,
  family_cooperation_level TEXT,
  safety_concerns_noted BOOLEAN,
  follow_up_needed BOOLEAN,
  follow_up_notes TEXT,
  visit_outcome TEXT
);

CREATE TABLE education_records (
  education_record_id BIGINT PRIMARY KEY,
  resident_id BIGINT REFERENCES residents(resident_id),
  record_date DATE,
  education_level TEXT,
  school_name TEXT,
  enrollment_status TEXT,
  attendance_rate NUMERIC,
  progress_percent NUMERIC,
  completion_status TEXT,
  notes TEXT
);

CREATE TABLE health_wellbeing_records (
  health_record_id BIGINT PRIMARY KEY,
  resident_id BIGINT REFERENCES residents(resident_id),
  record_date DATE,
  general_health_score NUMERIC,
  nutrition_score NUMERIC,
  sleep_quality_score NUMERIC,
  energy_level_score NUMERIC,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  bmi NUMERIC,
  medical_checkup_done BOOLEAN,
  dental_checkup_done BOOLEAN,
  psychological_checkup_done BOOLEAN,
  notes TEXT
);

CREATE TABLE intervention_plans (
  plan_id BIGINT PRIMARY KEY,
  resident_id BIGINT REFERENCES residents(resident_id),
  plan_category TEXT,
  plan_description TEXT,
  services_provided TEXT,
  target_value NUMERIC,
  target_date DATE,
  status TEXT,
  case_conference_date DATE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE incident_reports (
  incident_id BIGINT PRIMARY KEY,
  resident_id BIGINT REFERENCES residents(resident_id),
  safehouse_id BIGINT REFERENCES safehouses(safehouse_id),
  incident_date DATE,
  incident_type TEXT,
  severity TEXT,
  description TEXT,
  response_taken TEXT,
  resolved BOOLEAN,
  resolution_date DATE,
  reported_by TEXT,
  follow_up_required BOOLEAN
);

CREATE TABLE safehouse_monthly_metrics (
  metric_id BIGINT PRIMARY KEY,
  safehouse_id BIGINT REFERENCES safehouses(safehouse_id),
  month_start DATE,
  month_end DATE,
  active_residents BIGINT,
  avg_education_progress NUMERIC,
  avg_health_score NUMERIC,
  process_recording_count BIGINT,
  home_visitation_count BIGINT,
  incident_count BIGINT,
  notes TEXT
);

CREATE TABLE public_impact_snapshots (
  snapshot_id BIGINT PRIMARY KEY,
  snapshot_date DATE,
  headline TEXT,
  summary_text TEXT,
  metric_payload_json TEXT,
  is_published BOOLEAN,
  published_at DATE
);

COMMIT;

-- Data load section (run in psql; uses client-side \copy).
-- If your path differs, edit the root path below.
SET search_path TO lighthouse, public;

\copy safehouses FROM 'is455/lighthouse_csv_v7/safehouses.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy partners FROM 'is455/lighthouse_csv_v7/partners.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy partner_assignments FROM 'is455/lighthouse_csv_v7/partner_assignments.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy supporters FROM 'is455/lighthouse_csv_v7/supporters.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy social_media_posts FROM 'is455/lighthouse_csv_v7/social_media_posts.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy donations FROM 'is455/lighthouse_csv_v7/donations.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy in_kind_donation_items FROM 'is455/lighthouse_csv_v7/in_kind_donation_items.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy donation_allocations FROM 'is455/lighthouse_csv_v7/donation_allocations.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy residents FROM 'is455/lighthouse_csv_v7/residents.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy process_recordings FROM 'is455/lighthouse_csv_v7/process_recordings.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy home_visitations FROM 'is455/lighthouse_csv_v7/home_visitations.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy education_records FROM 'is455/lighthouse_csv_v7/education_records.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy health_wellbeing_records FROM 'is455/lighthouse_csv_v7/health_wellbeing_records.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy intervention_plans FROM 'is455/lighthouse_csv_v7/intervention_plans.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy incident_reports FROM 'is455/lighthouse_csv_v7/incident_reports.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy safehouse_monthly_metrics FROM 'is455/lighthouse_csv_v7/safehouse_monthly_metrics.csv' WITH (FORMAT csv, HEADER true, NULL '');
\copy public_impact_snapshots FROM 'is455/lighthouse_csv_v7/public_impact_snapshots.csv' WITH (FORMAT csv, HEADER true, NULL '');
