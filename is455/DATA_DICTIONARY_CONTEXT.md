## Lighthouse Data Context Guide

This document summarizes the Lighthouse data model in Postgres (schema `lighthouse`), based on **Appendix A: Data Dictionary**.  
Use it as a quick reference while exploring data in `dataAnalysis.ipynb`.

---

### High-level entity overview

- **safehouses**: Physical locations where girls are housed and served.  
  - **Grain**: One row per safehouse.  
  - **Key uses**: Capacity analysis, regional distribution, linking resident cases and allocations to locations.

- **partners**: Organizations/individuals delivering services (education, operations, maintenance, etc.).  
  - **Grain**: One row per partner.  
  - **Key uses**: Partner portfolio, active vs inactive partners, regional coverage.

- **partner_assignments**: Which partners serve which safehouses and in what program area.  
  - **Grain**: One row per `(partner × safehouse × program_area)` assignment over time.  
  - **Key uses**: Mapping services to sites, understanding who is responsible for operations, education, wellbeing.

- **supporters**: Donors, volunteers, skill contributors, and partner organizations that support the work.  
  - **Grain**: One row per supporter (person or org).  
  - **Key uses**: Supporter segmentation, acquisition channels, lifecycle and first-donation timing.

- **donations**: All donation events (monetary, in-kind, time, skills, social media).  
  - **Grain**: One row per donation event.  
  - **Key uses**: Revenue and support volume, multi-channel attribution, recurring giving, link to social media.

- **in_kind_donation_items**: Item-level detail for in-kind donations.  
  - **Grain**: One row per item line within an in-kind donation.  
  - **Key uses**: What was donated (food, supplies, school materials, etc.), quantity and value in PHP.

- **donation_allocations**: How each donation’s value is allocated across safehouses and program areas.  
  - **Grain**: One row per `(donation × safehouse × program_area)` allocation.  
  - **Key uses**: Funding flows by safehouse and program area (Education, Wellbeing, Operations, etc.).

- **residents**: Case records for girls currently or formerly served.  
  - **Grain**: One row per resident.  
  - **Key uses**: Demographics, legal status, risk profile, referral sources, caseload and reintegration tracking.

- **process_recordings**: Structured counseling session notes for residents.  
  - **Grain**: One row per counseling session.  
  - **Key uses**: Session-level timeline of care, emotional trajectory, interventions, progress/concerns flags.

- **home_visitations**: Home/field visit records for residents and families.  
  - **Grain**: One row per home/field visit.  
  - **Key uses**: Family engagement, safety assessments, reintegration readiness, cooperation levels.

- **education_records**: Monthly education progress/attendance for each resident.  
  - **Grain**: One row per `(resident × record_date)` (roughly monthly).  
  - **Key uses**: Attendance, program participation, progress %, completion status, GPA-like metrics.

- **health_wellbeing_records**: Monthly physical health and wellbeing assessments.  
  - **Grain**: One row per `(resident × record_date)` (roughly monthly).  
  - **Key uses**: Weight/height/BMI, nutrition, sleep, energy, health check-ups over time.

- **intervention_plans**: Individual intervention goals and services for residents.  
  - **Grain**: One row per intervention plan (goal) per resident.  
  - **Key uses**: Plan categories (Safety, Psychosocial, Education, etc.), target values/dates, status progression.

- **incident_reports**: Safety and behavioral incident records for residents.  
  - **Grain**: One row per incident.  
  - **Key uses**: Incident type, severity, responses, resolution status/dates, follow-up needs.

- **social_media_posts**: Organization social media activity and engagement metrics.  
  - **Grain**: One row per social media post.  
  - **Key uses**: Content/performance analysis, campaign impact, linking posts to referred donations.

- **safehouse_monthly_metrics**: Pre-aggregated monthly outcome metrics per safehouse.  
  - **Grain**: One row per `(safehouse × month)`.  
  - **Key uses**: High-level trends for residents, education, health, incidents, and visitations per site.

- **public_impact_snapshots**: Public-facing aggregate impact snapshots (dashboard-ready).  
  - **Grain**: One row per month (or reporting period).  
  - **Key uses**: Storytelling/headlines, summarized metrics for donors and the public.

---

### Core keys and relationships (conceptual ER view)

- **Safehouses & Residents**
  - `safehouses.safehouse_id` ⇢ primary key for locations.
  - `residents.safehouse_id` ⇢ FK to `safehouses.safehouse_id`.
  - **Interpretation**: Each resident is assigned to a primary safehouse; safehouse capacity and occupancy can be compared with resident counts.

- **Partners & Assignments**
  - `partners.partner_id` ⇢ primary key for service partners.
  - `partner_assignments.partner_id` ⇢ FK to `partners.partner_id`.
  - `partner_assignments.safehouse_id` ⇢ FK to `safehouses.safehouse_id` (nullable for cross-site roles).
  - **Interpretation**: Partner assignments show which partners cover which safehouses and program areas (Education, Operations, etc.).

- **Supporters, Donations, and Allocations**
  - `supporters.supporter_id` ⇢ primary key for supporters.
  - `donations.supporter_id` ⇢ FK to `supporters.supporter_id`.
  - `in_kind_donation_items.donation_id` ⇢ FK to `donations.donation_id`.
  - `donation_allocations.donation_id` ⇢ FK to `donations.donation_id`.
  - `donation_allocations.safehouse_id` ⇢ FK to `safehouses.safehouse_id`.
  - `donations.referral_post_id` ⇢ FK to `social_media_posts.post_id` (when donation came via social media).
  - **Interpretation**: A supporter can make many donations; each donation can have multiple item lines (for in-kind) and be split across safehouses/program areas via allocations.

- **Residents & Care Journey Tables**
  - `residents.resident_id` ⇢ primary key for case records.
  - `process_recordings.resident_id` ⇢ FK to `residents.resident_id`.
  - `home_visitations.resident_id` ⇢ FK to `residents.resident_id`.
  - `education_records.resident_id` ⇢ FK to `residents.resident_id`.
  - `health_wellbeing_records.resident_id` ⇢ FK to `residents.resident_id`.
  - `intervention_plans.resident_id` ⇢ FK to `residents.resident_id`.
  - `incident_reports.resident_id` ⇢ FK to `residents.resident_id`.
  - **Interpretation**: These tables are all *time series* around a resident’s journey—sessions, visits, education, health, interventions, incidents.

- **Incidents & Safehouses**
  - `incident_reports.safehouse_id` ⇢ FK to `safehouses.safehouse_id`.
  - `safehouse_monthly_metrics.safehouse_id` ⇢ FK to `safehouses.safehouse_id`.
  - **Interpretation**: Incidents can be rolled up to the safehouse-month level and compared to pre-aggregated metrics in `safehouse_monthly_metrics`.

- **Social Media & Fundraising**
  - `social_media_posts.post_id` ⇢ primary key for posts.
  - `donations.referral_post_id` ⇢ FK to `social_media_posts.post_id`.
  - **Interpretation**: Enables attribution of donations back to specific posts and campaigns.

---

### Common analysis patterns

- **Case-level outcomes**
  - Join `residents` ⇢ `incident_reports`, `process_recordings`, `home_visitations`, `education_records`, `health_wellbeing_records`, `intervention_plans`.
  - Example questions:
    - How do incidents vary by `current_risk_level` and `reintegration_status`?
    - Does increased `home_visitation_count` correlate with reduced `incident_count` over time?

- **Safehouse performance**
  - Join `safehouses` ⇢ `safehouse_monthly_metrics` ⇢ resident-level time series.
  - Example questions:
    - Which safehouses have the highest `avg_education_progress` and `avg_health_score`?
    - Are higher incident months associated with higher `home_visitation_count` (responsive case work)?

- **Donor and supporter behavior**
  - Join `supporters` ⇢ `donations` ⇢ `donation_allocations` ⇢ `safehouses` and `program_area`.
  - Example questions:
    - How do donation amounts differ by `supporter_type`, `relationship_type`, and `acquisition_channel`?
    - Which program areas receive the most funding, and from which supporter segments?

- **In-kind support detail**
  - Join `donations` (in-kind) ⇢ `in_kind_donation_items` ⇢ `donation_allocations`.
  - Example questions:
    - What categories of items are most common by program area (Meals, Education, Shelter, etc.)?
    - How does in-kind value compare to monetary donations by safehouse?

- **Social media effectiveness**
  - Join `social_media_posts` ⇢ `donations` (via `referral_post_id`) and campaigns.
  - Example questions:
    - Which `post_type`, `content_topic`, or `sentiment_tone` drives the highest `donation_referrals` and `estimated_donation_value_php`?
    - How does `engagement_rate` relate to actual referral donations?

---

### Practical tips for `dataAnalysis.ipynb`

- Treat **`residents` as the central person table** and join outward to time-series tables for longitudinal analyses.
- Use **`donation_allocations`** as the bridge between money and programmatic work: it connects donors (`supporters`/`donations`) to safehouses and program areas.
- For month-level trends, start from **`safehouse_monthly_metrics`** and (if needed) reconcile with raw tables like `incident_reports`, `process_recordings`, and `home_visitations`.
- Use **`public_impact_snapshots`** as a high-level “ground truth” for what is communicated publicly; you can compare these summaries with the underlying detailed tables to validate stories and metrics.

