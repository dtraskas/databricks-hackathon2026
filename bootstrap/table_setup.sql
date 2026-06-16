CREATE OR REPLACE TABLE workspace.l1_facility_info.facility_core_details
select
  unique_id as Reference_ID,
  name as Organization_name,
  description as Organisation_description,
  facilityTypeId as Organization_Facility_type,
  operatorTypeId as Organization_Operator_type,
  organization_type as Organization_type,
  officialPhone as Office_phone,
  email as Email,
  officialWebsite as Organization_Website,
  yearEstablished,
  facebookLink as Facebook_link,
  address_line1 as Address_line1,
  address_line2 as Address_line2,
  address_line3 as Address_line3,
  address_city as City,
  address_stateOrRegion as State,
  address_zipOrPostcode as Zipcode,
  address_country as Country,
  address_countryCode as Country_code,
  Coalesce(numberDoctors, '0') as Number_of_doctors,
  coalesce(capacity, '0') as Capacity,
  b.circlename,
  b.regionname,
  b.divisionname,
  b.officename,
  b.pincode,
  b.officetype,
  b.district,
  b.statename,
  a.latitude,
  a.longitude
from
  workspace.datalake_dev.facilities A
    left outer join workspace.datalake_dev.india_post_pincode_directory B
      on cast(substr(a.longitude, 1, 4) as string) = cast(substr(B.longitude, 1, 4) as string)
      and cast(substr(a.longitude, 1, 4) as string) = cast(substr(B.longitude, 1, 4) as string)
      and B.latitude != 'NA'
      and B.longitude != 'NA'
;


CREATE OR REPLACE TABLE workspace.l1_facility_info.ContactDetails
SELECT
  unique_id,
  'PhoneNumber' as Type,
  posexplode(split(phone_numbers, ',')) AS (q_index, q_block)
FROM
  workspace.datalake_dev.facilities

;


Insert into workspace.l1_facility_info.ContactDetails
  SELECT
    unique_id,
    'WebSites' as Type,
    posexplode(split(websites, ',')) AS (q_index, q_block)
  FROM
    workspace.datalake_dev.facilities;
;

CREATE OR REPLACE TABLE workspace.l1_facility_info.Specialities
SELECT
  unique_id,
  'Speciality' as Type,
  posexplode(split(specialties, ',')) AS (q_index, q_block)
FROM
  workspace.datalake_dev.facilities
;

CREATE OR REPLACE TABLE workspace.l1_facility_info.procedure as
SELECT
  unique_id,
  'Procedure' as Type,
  posexplode(split(procedure, ',')) AS (q_index, q_block)
FROM
  workspace.datalake_dev.facilities
;

CREATE OR REPLACE TABLE workspace.l1_facility_info.Equipment as
SELECT
  unique_id,
  'Equipment' as Type,
  posexplode(split(equipment, ',')) AS (q_index, q_block)
FROM
  workspace.datalake_dev.facilities

;


CREATE OR REPLACE TABLE workspace.l1_facility_info.Capability as
SELECT
  unique_id,
  'Capability' as Type,
  posexplode(split(Capability, ',')) AS (q_index, q_block)
FROM
  workspace.datalake_dev.facilities

;


CREATE OR REPLACE TABLE workspace.l1_facility_info.facility_core_details_enriched AS
SELECT
  A.*,
  CASE
    WHEN
      Email IS NULL
      OR TRIM(Email) = 'null'
    THEN
      '❌ Missing'
    WHEN
      NOT RLIKE(Email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
    THEN
      '❌ Invalid Format'
    ELSE '✅ Valid'
  END AS email_status,
  CASE
    WHEN
      TRIM(Office_phone) = 'null'
      OR Office_phone IS NULL
    THEN
      '❌ Missing'
    WHEN
      substr(Office_phone, 1, 3) = '+91'
      AND length(Office_phone) = 13
    THEN
      '✅ Valid'
    ELSE '❌ Invalid Format'
  END AS office_phone_status,
  CASE
    WHEN
      statename IS NULL
      OR TRIM(statename) = 'null'
    THEN
      '❌ Missing'
    ELSE '✅ Valid'
  END AS state_status,
  CASE
    WHEN yearEstablished IS NULL THEN '❌ Missing'
    ELSE '✅ Valid'
  END AS year_established_status,
  CASE
    WHEN Address_line1 IS NULL THEN '❌ Missing'
    ELSE '✅ Valid'
  END AS address_line1_status,
  CASE
    WHEN cast(Zipcode as string) <> cast(pincode as string) THEN '❌ Invalid Postcode'
    ELSE '✅ Valid'
  END AS pincode_status,
  CASE
    WHEN Organization_name IS NULL THEN '❌ Missing'
    ELSE '✅ Valid'
  END AS organization_name_status
FROM
  workspace.l1_facility_info.facility_core_details A
;


CREATE OR REPLACE TABLE workspace.l1_facility_info.Final_Facility_score_view
SELECT
  A.Reference_ID,
  A.Organization_name,
  A.State,
  A.Zipcode,
  concat(a.Reference_ID, current_date) as Case_ID,
  contradiction_score,
  b.issue_tags as Issue_value,
  contradiction_explanation,
  capability,
  completeness_score,
  evidence_score,
  consistency_score,
  geospatial_score,
  final_risk_score
from
  workspace.l1_facility_info.facility_core_details_enriched A
    left outer join workspace.l1_facility_info.contradiction_signals b
      ON b.unique_id = a.Reference_ID
    left outer join workspace.l1_facility_info.facility_readiness_gold C
      ON c.unique_id = Reference_ID

WITH facility AS (
  SELECT
    Reference_ID                 AS facility_id,
    ANY_VALUE(Organization_name) AS name,
    ANY_VALUE(State)             AS state
  FROM workspace.l1_facility_info.final_facility_score_view
  GROUP BY Reference_ID
)
SELECT
  c.contradiction_id                                     AS id,
  c.facility_id                                          AS facility_id,
  f.name                                                 AS name,
  f.state                                                AS state,
  c.confidence                                           AS severity,
  concat_ws(' — ', c.contradiction_code, c.explanation)  AS whats_wrong,
  c.severity                                             AS priority
FROM workspace.results.facility_contradictions c
JOIN facility f ON f.facility_id = c.facility_id