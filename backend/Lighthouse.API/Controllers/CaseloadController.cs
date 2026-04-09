using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/caseload")]
[Authorize(Roles = "Admin,Staff")]
public class CaseloadController(AppDbContext dbContext) : ControllerBase
{
    private static readonly HashSet<string> AllowedCaseStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Active", "Closed", "Transferred",
    };

    private static readonly HashSet<string> AllowedSexes = new(StringComparer.OrdinalIgnoreCase) { "F", "M" };

    private static readonly HashSet<string> AllowedCaseCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "Neglected", "Surrendered", "Foundling", "Abandoned",
    };

    private static readonly HashSet<string> AllowedReferralSources = new(StringComparer.OrdinalIgnoreCase)
    {
        "NGO", "Government Agency", "Court Order", "Self-Referral", "Community", "Police",
    };

    private static readonly HashSet<string> AllowedReintegrationTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Foster Care", "Family Reunification", "None", "Independent Living",
        "Adoption (Domestic)", "Adoption (Inter-Country)",
    };

    private static readonly HashSet<string> AllowedReintegrationStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "In Progress", "Completed", "On Hold", "Not Started",
    };

    [HttpGet("safehouses")]
    public async Task<IActionResult> GetSafehousesForCaseload()
    {
        var rows = await dbContext.Safehouses
            .AsNoTracking()
            .OrderBy(s => s.Id)
            .Select(s => new { id = s.Id, name = s.Name })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpGet("residents")]
    public async Task<IActionResult> GetResidents()
    {
        try
        {
            // Prefer lighthouse schema because the project dataset (CSV) maps to lighthouse.residents.
            var rows = await dbContext.Database.SqlQueryRaw<CaseloadResidentRow>(
                """
                SELECT
                    r.resident_id AS "Id",
                    COALESCE(r.internal_code, CONCAT('Girl #', r.resident_id::text)) AS "DisplayName",
                    r.case_control_no AS "CaseControlNo",
                    r.case_status AS "CaseStatus",
                    r.safehouse_id AS "SafehouseId",
                    s.name AS "SafehouseName",
                    r.assigned_social_worker AS "AssignedSocialWorker",
                    r.date_of_admission AS "DateAdmitted",
                    r.date_closed AS "DateClosed"
                FROM lighthouse.residents r
                LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id
                ORDER BY r.date_of_admission DESC NULLS LAST, r.case_control_no
                """)
                .ToListAsync();

            return Ok(rows);
        }
        catch
        {
            // Fallback for local DBs that only have the app's default EF tables.
            var rows = await dbContext.Residents
                .AsNoTracking()
                .Select(resident => new CaseloadResidentRow
                {
                    Id = resident.Id,
                    DisplayName = $"Girl {resident.CaseControlNo}",
                    CaseControlNo = resident.CaseControlNo,
                    CaseStatus = resident.CaseStatus,
                    SafehouseId = resident.SafehouseId,
                    SafehouseName = dbContext.Safehouses
                        .Where(safehouse => safehouse.Id == resident.SafehouseId)
                        .Select(safehouse => safehouse.Name)
                        .FirstOrDefault(),
                    AssignedSocialWorker = resident.AssignedSocialWorker,
                    DateAdmitted = resident.DateAdmitted,
                    DateClosed = resident.DateClosed,
                })
                .OrderByDescending(row => row.DateAdmitted ?? DateTime.MinValue)
                .ThenBy(row => row.CaseControlNo)
                .ToListAsync();

            return Ok(rows);
        }
    }

    [HttpGet("residents/{residentId:int}")]
    public async Task<IActionResult> GetResidentDetail(int residentId)
    {
        try
        {
            var row = await dbContext.Database.SqlQueryRaw<ResidentDetailRow>(
                """
                SELECT
                    r.resident_id AS "Id",
                    COALESCE(r.internal_code, CONCAT('Girl #', r.resident_id::text)) AS "DisplayName",
                    r.case_control_no AS "CaseControlNo",
                    r.case_status AS "CaseStatus",
                    r.safehouse_id AS "SafehouseId",
                    s.name AS "SafehouseName",
                    r.sex AS "Sex",
                    r.date_of_birth AS "DateOfBirth",
                    r.place_of_birth AS "PlaceOfBirth",
                    r.religion AS "Religion",
                    r.case_category AS "CaseCategory",
                    r.assigned_social_worker AS "AssignedSocialWorker",
                    r.referral_source AS "ReferralSource",
                    r.date_of_admission AS "DateAdmitted",
                    r.date_closed AS "DateClosed",
                    r.reintegration_type AS "ReintegrationType",
                    r.reintegration_status AS "ReintegrationStatus",
                    r.notes_restricted AS "NotesRestricted",
                    edu.education_level AS "EducationGrade",
                    edu.school_name AS "SchoolName",
                    (LOWER(COALESCE(edu.enrollment_status, '')) = 'enrolled') AS "IsEnrolled"
                FROM lighthouse.residents r
                LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id
                LEFT JOIN LATERAL (
                    SELECT
                        er.education_level,
                        er.school_name,
                        er.enrollment_status
                    FROM lighthouse.education_records er
                    WHERE er.resident_id = r.resident_id
                    ORDER BY er.record_date DESC NULLS LAST, er.education_record_id DESC
                    LIMIT 1
                ) edu ON TRUE
                WHERE r.resident_id = {0}
                LIMIT 1
                """, residentId)
                .FirstOrDefaultAsync();

            if (row is null) return NotFound(new { message = "Resident not found." });
            return Ok(row);
        }
        catch
        {
            var row = await dbContext.Residents
                .AsNoTracking()
                .Where(resident => resident.Id == residentId)
                .Select(resident => new ResidentDetailRow
                {
                    Id = resident.Id,
                    DisplayName = $"Girl {resident.CaseControlNo}",
                    CaseControlNo = resident.CaseControlNo,
                    CaseStatus = resident.CaseStatus,
                    SafehouseId = resident.SafehouseId,
                    SafehouseName = dbContext.Safehouses
                        .Where(safehouse => safehouse.Id == resident.SafehouseId)
                        .Select(safehouse => safehouse.Name)
                        .FirstOrDefault(),
                    AssignedSocialWorker = resident.AssignedSocialWorker,
                    DateAdmitted = resident.DateAdmitted,
                    DateClosed = resident.DateClosed,
                })
                .FirstOrDefaultAsync();

            if (row is null) return NotFound(new { message = "Resident not found." });
            return Ok(row);
        }
    }

    [HttpPost("residents")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateResident([FromBody] CreateResidentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CaseControlNo))
            return BadRequest(new { message = "Case control number is required." });
        if (string.IsNullOrWhiteSpace(request.InternalCode))
            return BadRequest(new { message = "Resident code is required." });
        if (string.IsNullOrWhiteSpace(request.CaseStatus))
            return BadRequest(new { message = "Case status is required." });
        if (request.SafehouseId is null or < 1)
            return BadRequest(new { message = "Select a safehouse." });
        if (request.DateOfBirth is null)
            return BadRequest(new { message = "Date of birth is required." });
        if (request.DateAdmitted is null)
            return BadRequest(new { message = "Date of admission is required." });
        if (string.IsNullOrWhiteSpace(request.Sex) || !AllowedSexes.Contains(request.Sex.Trim()))
            return BadRequest(new { message = "Sex must be F or M." });
        if (string.IsNullOrWhiteSpace(request.PlaceOfBirth))
            return BadRequest(new { message = "Place of birth is required." });
        if (string.IsNullOrWhiteSpace(request.Religion))
            return BadRequest(new { message = "Religion is required." });
        if (string.IsNullOrWhiteSpace(request.CaseCategory) || !AllowedCaseCategories.Contains(request.CaseCategory.Trim()))
            return BadRequest(new { message = "Choose a valid case category." });
        if (string.IsNullOrWhiteSpace(request.ReferralSource) || !AllowedReferralSources.Contains(request.ReferralSource.Trim()))
            return BadRequest(new { message = "Choose a valid referral source." });
        if (string.IsNullOrWhiteSpace(request.ReintegrationType) || !AllowedReintegrationTypes.Contains(request.ReintegrationType.Trim()))
            return BadRequest(new { message = "Choose a valid reintegration type." });
        if (string.IsNullOrWhiteSpace(request.ReintegrationStatus) || !AllowedReintegrationStatuses.Contains(request.ReintegrationStatus.Trim()))
            return BadRequest(new { message = "Choose a valid reintegration status." });
        if (!AllowedCaseStatuses.Contains(request.CaseStatus.Trim()))
            return BadRequest(new { message = "Choose a valid case status (Active, Closed, or Transferred)." });

        var statusNorm = request.CaseStatus.Trim();
        var closedNorm = statusNorm.Equals("Closed", StringComparison.OrdinalIgnoreCase)
            || statusNorm.Equals("Transferred", StringComparison.OrdinalIgnoreCase);
        if (closedNorm && request.DateClosed is null)
            return BadRequest(new { message = "Date closed is required for Closed or Transferred cases." });

        var dateOfBirth = NormalizeToUtc(request.DateOfBirth.Value);
        var dateAdmitted = NormalizeToUtc(request.DateAdmitted.Value);
        var dateClosed = request.DateClosed.HasValue ? NormalizeToUtc(request.DateClosed.Value) : (DateTime?)null;

        try
        {
            var newId = await NextLighthouseIdAsync("residents", "resident_id");
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.residents (
                    resident_id,
                    case_control_no,
                    internal_code,
                    safehouse_id,
                    case_status,
                    sex,
                    date_of_birth,
                    place_of_birth,
                    religion,
                    case_category,
                    assigned_social_worker,
                    referral_source,
                    date_of_admission,
                    date_closed,
                    reintegration_type,
                    reintegration_status,
                    created_at
                ) VALUES (
                    {0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}, {12}, {13}, {14}, {15}, {16}
                )
                """,
                newId,
                request.CaseControlNo.Trim(),
                request.InternalCode.Trim(),
                request.SafehouseId,
                request.CaseStatus.Trim(),
                request.Sex.Trim(),
                dateOfBirth,
                request.PlaceOfBirth.Trim(),
                request.Religion.Trim(),
                request.CaseCategory.Trim(),
                string.IsNullOrWhiteSpace(request.AssignedSocialWorker) ? null : request.AssignedSocialWorker.Trim(),
                request.ReferralSource.Trim(),
                dateAdmitted,
                dateClosed,
                request.ReintegrationType.Trim(),
                request.ReintegrationStatus.Trim(),
                DateTime.UtcNow);

            return Ok(new { message = "Resident created.", residentId = newId });
        }
        catch
        {
            var resident = new Data.Entities.Resident
            {
                CaseControlNo = request.CaseControlNo.Trim(),
                CaseStatus = request.CaseStatus.Trim(),
                SafehouseId = request.SafehouseId,
                AssignedSocialWorker = string.IsNullOrWhiteSpace(request.AssignedSocialWorker)
                    ? null
                    : request.AssignedSocialWorker.Trim(),
                DateAdmitted = dateAdmitted,
                DateClosed = dateClosed,
            };
            dbContext.Residents.Add(resident);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Resident created.", residentId = resident.Id });
        }
    }

    [HttpPut("residents/{residentId:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateResidentDetail(int residentId, [FromBody] UpdateResidentDetailRequest request)
    {
        var dob = request.DateOfBirth.HasValue ? NormalizeToUtc(request.DateOfBirth.Value) : (DateTime?)null;
        var admitted = request.DateAdmitted.HasValue ? NormalizeToUtc(request.DateAdmitted.Value) : (DateTime?)null;
        var closed = request.DateClosed.HasValue ? NormalizeToUtc(request.DateClosed.Value) : (DateTime?)null;

        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                UPDATE lighthouse.residents
                SET case_status = {0},
                    safehouse_id = {1},
                    sex = {2},
                    date_of_birth = {3},
                    place_of_birth = {4},
                    religion = {5},
                    case_category = {6},
                    assigned_social_worker = {7},
                    referral_source = {8},
                    date_of_admission = {9},
                    date_closed = {10},
                    reintegration_type = {11},
                    reintegration_status = {12}
                WHERE resident_id = {13}
                """,
                request.CaseStatus,
                request.SafehouseId,
                request.Sex,
                dob,
                request.PlaceOfBirth,
                request.Religion,
                request.CaseCategory,
                request.AssignedSocialWorker,
                request.ReferralSource,
                admitted,
                closed,
                request.ReintegrationType,
                request.ReintegrationStatus,
                residentId);

            if (affected == 0) return NotFound(new { message = "Resident not found." });
            return Ok(new { message = "Resident profile updated." });
        }
        catch
        {
            var resident = await dbContext.Residents.FirstOrDefaultAsync(r => r.Id == residentId);
            if (resident is null) return NotFound(new { message = "Resident not found." });
            resident.CaseStatus = request.CaseStatus ?? resident.CaseStatus;
            resident.SafehouseId = request.SafehouseId;
            resident.AssignedSocialWorker = request.AssignedSocialWorker;
            resident.DateAdmitted = admitted;
            resident.DateClosed = closed;
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Resident profile updated." });
        }
    }

    [HttpGet("residents/{residentId:int}/health-wellbeing")]
    public async Task<IActionResult> GetHealthWellbeingDashboard(int residentId)
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<HealthWellbeingRow>(
                """
                SELECT
                    h.record_date AS "RecordDate",
                    h.general_health_score AS "GeneralHealthScore",
                    h.nutrition_score AS "NutritionScore",
                    h.sleep_quality_score AS "SleepQualityScore",
                    h.energy_level_score AS "EnergyLevelScore",
                    h.height_cm AS "HeightCm",
                    h.weight_kg AS "WeightKg",
                    h.bmi AS "Bmi",
                    h.medical_checkup_done AS "MedicalCheckupDone",
                    h.dental_checkup_done AS "DentalCheckupDone",
                    h.psychological_checkup_done AS "PsychologicalCheckupDone",
                    h.notes AS "Notes"
                FROM lighthouse.health_wellbeing_records h
                WHERE h.resident_id = {0}
                ORDER BY h.record_date DESC
                """,
                residentId)
                .ToListAsync();

            var latest = rows.FirstOrDefault();
            return Ok(new HealthWellbeingDashboardResponse
            {
                Latest = latest is null ? null : new HealthWellbeingSummaryRow
                {
                    RecordDate = latest.RecordDate,
                    GeneralHealthScore = latest.GeneralHealthScore,
                    NutritionScore = latest.NutritionScore,
                    SleepQualityScore = latest.SleepQualityScore,
                    EnergyLevelScore = latest.EnergyLevelScore,
                    HeightCm = latest.HeightCm,
                    WeightKg = latest.WeightKg,
                    Bmi = latest.Bmi,
                    MedicalCheckupDone = latest.MedicalCheckupDone,
                    DentalCheckupDone = latest.DentalCheckupDone,
                    PsychologicalCheckupDone = latest.PsychologicalCheckupDone,
                    Notes = latest.Notes,
                },
                TotalRecords = rows.Count,
                MedicalDoneCount = rows.Count(r => r.MedicalCheckupDone == true),
                DentalDoneCount = rows.Count(r => r.DentalCheckupDone == true),
                PsychologicalDoneCount = rows.Count(r => r.PsychologicalCheckupDone == true),
                Recent = rows.Take(6).ToList(),
            });
        }
        catch
        {
            return Ok(new HealthWellbeingDashboardResponse
            {
                Latest = null,
                TotalRecords = 0,
                MedicalDoneCount = 0,
                DentalDoneCount = 0,
                PsychologicalDoneCount = 0,
                Recent = [],
            });
        }
    }

    [HttpDelete("residents/{residentId:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteResident(int residentId)
    {
        try
        {
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM lighthouse.process_recordings WHERE resident_id = {0}", residentId);
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM lighthouse.home_visitations WHERE resident_id = {0}", residentId);
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM lighthouse.incident_reports WHERE resident_id = {0}", residentId);
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM lighthouse.intervention_plans WHERE resident_id = {0}", residentId);
            var affected = await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM lighthouse.residents WHERE resident_id = {0}", residentId);
            if (affected == 0) return NotFound(new { message = "Resident not found." });
            return Ok(new { message = "Resident deleted." });
        }
        catch
        {
            var resident = await dbContext.Residents.FirstOrDefaultAsync(r => r.Id == residentId);
            if (resident is null) return NotFound(new { message = "Resident not found." });
            var processRows = dbContext.ProcessRecordings.Where(r => r.ResidentId == residentId);
            var homeRows = dbContext.HomeVisitations.Where(r => r.ResidentId == residentId);
            dbContext.ProcessRecordings.RemoveRange(processRows);
            dbContext.HomeVisitations.RemoveRange(homeRows);
            dbContext.Residents.Remove(resident);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Resident deleted." });
        }
    }

    [HttpGet("residents/{residentId:int}/incident-reports")]
    public async Task<IActionResult> GetIncidentReports(int residentId)
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<IncidentReportRow>(
                """
                SELECT
                    ROW_NUMBER() OVER (ORDER BY ir.incident_date DESC, ir.incident_id DESC) AS "Id",
                    ir.ctid::text AS "RecordKey",
                    ir.resident_id AS "ResidentId",
                    ir.safehouse_id AS "SafehouseId",
                    ir.incident_date AS "IncidentDate",
                    ir.incident_type AS "IncidentType",
                    ir.severity AS "Severity",
                    ir.description AS "Description",
                    ir.response_taken AS "ResponseTaken",
                    ir.resolved AS "Resolved",
                    ir.resolution_date AS "ResolutionDate",
                    ir.reported_by AS "ReportedBy",
                    ir.follow_up_required AS "FollowUpRequired"
                FROM lighthouse.incident_reports ir
                WHERE ir.resident_id = {0}
                ORDER BY ir.incident_date DESC, ir.incident_id DESC
                """,
                residentId)
                .ToListAsync();
            return Ok(rows);
        }
        catch
        {
            return Ok(new List<IncidentReportRow>());
        }
    }

    [HttpGet("residents/{residentId:int}/intervention-plans")]
    public async Task<IActionResult> GetInterventionPlans(int residentId)
    {
        var rows = await dbContext.Database.SqlQueryRaw<InterventionPlanRow>(
            """
            SELECT
                ROW_NUMBER() OVER (ORDER BY ip.created_at DESC NULLS LAST, ip.plan_id DESC) AS "Id",
                ip.ctid::text AS "RecordKey",
                ip.resident_id AS "ResidentId",
                ip.plan_category AS "PlanCategory",
                ip.plan_description AS "PlanDescription",
                ip.services_provided AS "ServicesProvided",
                ip.target_value AS "TargetValue",
                ip.target_date AS "TargetDate",
                ip.status AS "Status",
                ip.case_conference_date AS "CaseConferenceDate",
                ip.created_at AS "CreatedAt",
                ip.updated_at AS "UpdatedAt"
            FROM lighthouse.intervention_plans ip
            WHERE ip.resident_id = {0}
            ORDER BY ip.created_at DESC NULLS LAST, ip.plan_id DESC
            """,
            residentId)
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost("residents/{residentId:int}/intervention-plans")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddInterventionPlan(int residentId, [FromBody] CreateInterventionPlanRequest request)
    {
        var targetDateUtc = request.TargetDate.HasValue ? NormalizeToUtc(request.TargetDate.Value) : (DateTime?)null;
        var caseConferenceDateUtc = request.CaseConferenceDate.HasValue
            ? NormalizeToUtc(request.CaseConferenceDate.Value)
            : (DateTime?)null;

        try
        {
            var (idColumn, idIsGenerated) = await GetLighthousePrimaryKeyInfoAsync("intervention_plans");
            if (!string.IsNullOrWhiteSpace(idColumn) && !idIsGenerated)
            {
                var newId = await NextLighthouseIdAsync("intervention_plans", idColumn);
                var insertSql =
                    "INSERT INTO lighthouse.intervention_plans " +
                    $"({idColumn}, resident_id, plan_category, plan_description, services_provided, target_value, target_date, status, case_conference_date, created_at, updated_at) " +
                    "VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10})";
                await dbContext.Database.ExecuteSqlRawAsync(
                    insertSql,
                    newId,
                    residentId,
                    request.PlanCategory,
                    request.PlanDescription,
                    request.ServicesProvided,
                    request.TargetValue,
                    targetDateUtc,
                    request.Status,
                    caseConferenceDateUtc,
                    DateTime.UtcNow,
                    DateTime.UtcNow);
            }
            else
            {
                await dbContext.Database.ExecuteSqlRawAsync(
                    """
                    INSERT INTO lighthouse.intervention_plans
                        (resident_id, plan_category, plan_description, services_provided, target_value, target_date, status, case_conference_date, created_at, updated_at)
                    VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9})
                    """,
                    residentId,
                    request.PlanCategory,
                    request.PlanDescription,
                    request.ServicesProvided,
                    request.TargetValue,
                    targetDateUtc,
                    request.Status,
                    caseConferenceDateUtc,
                    DateTime.UtcNow,
                    DateTime.UtcNow);
            }
            return Ok(new { message = "Intervention plan saved." });
        }
        catch
        {
            // Compatibility fallback for environments where intervention_plans
            // does not include created_at/updated_at columns.
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.intervention_plans
                    (resident_id, plan_category, plan_description, services_provided, target_value, target_date, status, case_conference_date)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7})
                """,
                residentId,
                request.PlanCategory,
                request.PlanDescription,
                request.ServicesProvided,
                request.TargetValue,
                targetDateUtc,
                request.Status,
                caseConferenceDateUtc);
            return Ok(new { message = "Intervention plan saved." });
        }
    }

    [HttpPut("residents/{residentId:int}/intervention-plans/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateInterventionPlan(int residentId, string recordKey, [FromBody] UpdateInterventionPlanRequest request)
    {
        var targetDateUtc = request.TargetDate.HasValue ? NormalizeToUtc(request.TargetDate.Value) : (DateTime?)null;
        var caseConferenceDateUtc = request.CaseConferenceDate.HasValue
            ? NormalizeToUtc(request.CaseConferenceDate.Value)
            : (DateTime?)null;

        var affected = await dbContext.Database.ExecuteSqlRawAsync(
            """
            UPDATE lighthouse.intervention_plans
            SET plan_category = {0},
                plan_description = {1},
                services_provided = {2},
                target_value = {3},
                target_date = {4},
                status = {5},
                case_conference_date = {6},
                updated_at = {7}
            WHERE resident_id = {8}
              AND ctid = CAST({9} AS tid)
            """,
            request.PlanCategory,
            request.PlanDescription,
            request.ServicesProvided,
            request.TargetValue,
            targetDateUtc,
            request.Status,
            caseConferenceDateUtc,
            DateTime.UtcNow,
            residentId,
            recordKey);
        if (affected == 0) return NotFound(new { message = "Intervention plan not found." });
        return Ok(new { message = "Intervention plan updated." });
    }

    [HttpDelete("residents/{residentId:int}/intervention-plans/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteInterventionPlan(int residentId, string recordKey)
    {
        var affected = await dbContext.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM lighthouse.intervention_plans
            WHERE resident_id = {0}
              AND ctid = CAST({1} AS tid)
            """,
            residentId,
            recordKey);
        if (affected == 0) return NotFound(new { message = "Intervention plan not found." });
        return Ok(new { message = "Intervention plan deleted." });
    }

    [HttpPost("residents/{residentId:int}/incident-reports")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddIncidentReport(int residentId, [FromBody] CreateIncidentReportRequest request)
    {
        if (request.IncidentDate == default)
            return BadRequest(new { message = "IncidentDate is required." });
        if (string.IsNullOrWhiteSpace(request.IncidentType))
            return BadRequest(new { message = "IncidentType is required." });

        var incidentDateUtc = NormalizeToUtc(request.IncidentDate);
        var resolutionDateUtc = request.ResolutionDate.HasValue ? NormalizeToUtc(request.ResolutionDate.Value) : (DateTime?)null;

        var (idColumn, idIsGenerated) = await GetLighthousePrimaryKeyInfoAsync("incident_reports");
        if (!string.IsNullOrWhiteSpace(idColumn) && !idIsGenerated)
        {
            var newId = await NextLighthouseIdAsync("incident_reports", idColumn);
            var insertSql =
                "INSERT INTO lighthouse.incident_reports " +
                $"({idColumn}, resident_id, safehouse_id, incident_date, incident_type, severity, description, response_taken, resolved, resolution_date, reported_by, follow_up_required) " +
                "VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11})";
            await dbContext.Database.ExecuteSqlRawAsync(
                insertSql,
                newId,
                residentId,
                request.SafehouseId,
                incidentDateUtc,
                request.IncidentType.Trim(),
                request.Severity,
                request.Description,
                request.ResponseTaken,
                request.Resolved,
                resolutionDateUtc,
                request.ReportedBy,
                request.FollowUpRequired);
        }
        else
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.incident_reports
                    (resident_id, safehouse_id, incident_date, incident_type, severity, description, response_taken, resolved, resolution_date, reported_by, follow_up_required)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10})
                """,
                residentId,
                request.SafehouseId,
                incidentDateUtc,
                request.IncidentType.Trim(),
                request.Severity,
                request.Description,
                request.ResponseTaken,
                request.Resolved,
                resolutionDateUtc,
                request.ReportedBy,
                request.FollowUpRequired);
        }
        return Ok(new { message = "Incident report saved." });
    }

    [HttpPut("residents/{residentId:int}/incident-reports/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateIncidentReport(int residentId, string recordKey, [FromBody] UpdateIncidentReportRequest request)
    {
        if (request.IncidentDate == default)
            return BadRequest(new { message = "IncidentDate is required." });
        if (string.IsNullOrWhiteSpace(request.IncidentType))
            return BadRequest(new { message = "IncidentType is required." });

        var incidentDateUtc = NormalizeToUtc(request.IncidentDate);
        var resolutionDateUtc = request.ResolutionDate.HasValue ? NormalizeToUtc(request.ResolutionDate.Value) : (DateTime?)null;

        var affected = await dbContext.Database.ExecuteSqlRawAsync(
            """
            UPDATE lighthouse.incident_reports
            SET safehouse_id = {0},
                incident_date = {1},
                incident_type = {2},
                severity = {3},
                description = {4},
                response_taken = {5},
                resolved = {6},
                resolution_date = {7},
                reported_by = {8},
                follow_up_required = {9}
            WHERE resident_id = {10}
              AND ctid = CAST({11} AS tid)
            """,
            request.SafehouseId,
            incidentDateUtc,
            request.IncidentType.Trim(),
            request.Severity,
            request.Description,
            request.ResponseTaken,
            request.Resolved,
            resolutionDateUtc,
            request.ReportedBy,
            request.FollowUpRequired,
            residentId,
            recordKey);

        if (affected == 0) return NotFound(new { message = "Incident report not found." });
        return Ok(new { message = "Incident report updated." });
    }

    [HttpDelete("residents/{residentId:int}/incident-reports/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteIncidentReport(int residentId, string recordKey)
    {
        var affected = await dbContext.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM lighthouse.incident_reports
            WHERE resident_id = {0}
              AND ctid = CAST({1} AS tid)
            """,
            residentId,
            recordKey);
        if (affected == 0) return NotFound(new { message = "Incident report not found." });
        return Ok(new { message = "Incident report deleted." });
    }

    // -------------------------------------------------------------------------
    // GET /api/caseload/process-recordings
    //   Cross-resident list of every process recording in the system, joined
    //   with the residents table so the UI can show who each record belongs
    //   to. Used by the standalone /process-recording staff page.
    // -------------------------------------------------------------------------
    [HttpGet("process-recordings")]
    public async Task<IActionResult> GetAllProcessRecordings()
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<ProcessRecordingSummaryRow>(
                """
                SELECT
                    pr.ctid::text AS "RecordKey",
                    pr.resident_id AS "ResidentId",
                    COALESCE(r.case_control_no, 'R-' || pr.resident_id::text) AS "ResidentLabel",
                    r.case_status AS "CaseStatus",
                    pr.session_date AS "SessionDate",
                    pr.social_worker AS "SocialWorker",
                    pr.session_type AS "SessionType",
                    pr.emotional_state_observed AS "EmotionalStateObserved",
                    pr.concerns_flagged AS "ConcernsFlagged",
                    pr.progress_noted AS "ProgressNoted",
                    LEFT(COALESCE(pr.session_narrative, ''), 240) AS "NarrativePreview"
                FROM lighthouse.process_recordings pr
                LEFT JOIN lighthouse.residents r ON r.resident_id = pr.resident_id
                ORDER BY pr.session_date DESC
                """)
                .ToListAsync();
            return Ok(rows);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/caseload/home-visitations
    //   Cross-resident list of every home visitation. Powers the standalone
    //   /home-visitation staff page.
    // -------------------------------------------------------------------------
    [HttpGet("home-visitations")]
    public async Task<IActionResult> GetAllHomeVisitations()
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<HomeVisitationSummaryRow>(
                """
                SELECT
                    hv.ctid::text AS "RecordKey",
                    hv.resident_id AS "ResidentId",
                    COALESCE(r.case_control_no, 'R-' || hv.resident_id::text) AS "ResidentLabel",
                    r.case_status AS "CaseStatus",
                    hv.visit_date AS "VisitDate",
                    hv.social_worker AS "SocialWorker",
                    hv.visit_type AS "VisitType",
                    hv.family_cooperation_level AS "FamilyCooperationLevel",
                    hv.safety_concerns_noted AS "SafetyConcernsNoted",
                    hv.follow_up_needed AS "FollowUpNeeded",
                    hv.visit_outcome AS "VisitOutcome",
                    LEFT(COALESCE(hv.observations, ''), 240) AS "ObservationsPreview"
                FROM lighthouse.home_visitations hv
                LEFT JOIN lighthouse.residents r ON r.resident_id = hv.resident_id
                ORDER BY hv.visit_date DESC
                """)
                .ToListAsync();
            return Ok(rows);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("residents/{residentId:int}/process-recordings")]
    public async Task<IActionResult> GetProcessRecordings(int residentId)
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<ProcessRecordingRow>(
                """
                SELECT
                    ROW_NUMBER() OVER (ORDER BY pr.session_date DESC) AS "Id",
                    pr.ctid::text AS "RecordKey",
                    pr.resident_id AS "ResidentId",
                    pr.session_date AS "SessionDate",
                    pr.social_worker AS "SocialWorker",
                    pr.session_type AS "SessionType",
                    pr.session_duration_minutes AS "SessionDurationMinutes",
                    pr.emotional_state_observed AS "EmotionalStateObserved",
                    pr.emotional_state_end AS "EmotionalStateEnd",
                    pr.session_narrative AS "SessionNarrative",
                    pr.interventions_applied AS "InterventionsApplied",
                    pr.follow_up_actions AS "FollowUpActions",
                    pr.progress_noted AS "ProgressNoted",
                    pr.concerns_flagged AS "ConcernsFlagged",
                    pr.referral_made AS "ReferralMade",
                    pr.notes_restricted AS "NotesRestricted"
                FROM lighthouse.process_recordings pr
                WHERE pr.resident_id = {0}
                ORDER BY pr.session_date DESC
                """, residentId)
                .ToListAsync();
            return Ok(rows);
        }
        catch
        {
            var rows = await dbContext.ProcessRecordings
                .AsNoTracking()
                .Where(processRecording => processRecording.ResidentId == residentId)
                .OrderByDescending(processRecording => processRecording.SessionDate)
                .ThenByDescending(processRecording => processRecording.Id)
                .Select(processRecording => new ProcessRecordingRow
                {
                    Id = processRecording.Id,
                    ResidentId = processRecording.ResidentId,
                    SessionDate = processRecording.SessionDate,
                    SessionType = processRecording.SessionType,
                    SocialWorker = null,
                    SessionDurationMinutes = null,
                    EmotionalStateObserved = processRecording.EmotionalState,
                    EmotionalStateEnd = null,
                    SessionNarrative = processRecording.NarrativeSummary,
                    InterventionsApplied = null,
                    FollowUpActions = null,
                    ProgressNoted = null,
                    ConcernsFlagged = null,
                    ReferralMade = null,
                    NotesRestricted = null,
                })
                .ToListAsync();
            return Ok(rows);
        }
    }

    [HttpPost("residents/{residentId:int}/process-recordings")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddProcessRecording(int residentId, [FromBody] CreateProcessRecordingRequest request)
    {
        if (request.SessionDate == default)
            return BadRequest(new { message = "SessionDate is required." });
        if (string.IsNullOrWhiteSpace(request.SessionType))
            return BadRequest(new { message = "SessionType is required." });

        var sessionDateUtc = NormalizeToUtc(request.SessionDate);

        try
        {
            var (idColumn, idIsGenerated) = await GetLighthousePrimaryKeyInfoAsync("process_recordings");
            if (!string.IsNullOrWhiteSpace(idColumn) && !idIsGenerated)
            {
                var newId = await NextLighthouseIdAsync("process_recordings", idColumn);
                var insertSql =
                    "INSERT INTO lighthouse.process_recordings " +
                    $"({idColumn}, resident_id, session_date, social_worker, session_type, session_duration_minutes, emotional_state_observed, emotional_state_end, session_narrative, interventions_applied, follow_up_actions, progress_noted, concerns_flagged, referral_made, notes_restricted) " +
                    "VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}, {12}, {13}, {14})";
                await dbContext.Database.ExecuteSqlRawAsync(
                    insertSql,
                    newId,
                    residentId,
                    sessionDateUtc,
                    request.SocialWorker,
                    request.SessionType.Trim(),
                    request.SessionDurationMinutes,
                    request.EmotionalStateObserved,
                    request.EmotionalStateEnd,
                    request.SessionNarrative,
                    request.InterventionsApplied,
                    request.FollowUpActions,
                    request.ProgressNoted,
                    request.ConcernsFlagged,
                    request.ReferralMade,
                    request.NotesRestricted);
            }
            else
            {
                await dbContext.Database.ExecuteSqlRawAsync(
                    """
                    INSERT INTO lighthouse.process_recordings
                        (resident_id, session_date, social_worker, session_type, session_duration_minutes, emotional_state_observed, emotional_state_end, session_narrative, interventions_applied, follow_up_actions, progress_noted, concerns_flagged, referral_made, notes_restricted)
                    VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}, {12}, {13})
                    """,
                    residentId,
                    sessionDateUtc,
                    request.SocialWorker,
                    request.SessionType.Trim(),
                    request.SessionDurationMinutes,
                    request.EmotionalStateObserved,
                    request.EmotionalStateEnd,
                    request.SessionNarrative,
                    request.InterventionsApplied,
                    request.FollowUpActions,
                    request.ProgressNoted,
                    request.ConcernsFlagged,
                    request.ReferralMade,
                    request.NotesRestricted);
            }
            return Ok(new { message = "Process recording saved." });
        }
        catch
        {
            var row = new Data.Entities.ProcessRecording
            {
                ResidentId = residentId,
                SessionDate = sessionDateUtc,
                SessionType = request.SessionType.Trim(),
                EmotionalState = request.EmotionalStateObserved,
                NarrativeSummary = request.SessionNarrative,
            };
            dbContext.ProcessRecordings.Add(row);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Process recording saved." });
        }
    }

    [HttpPut("residents/{residentId:int}/process-recordings/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateProcessRecording(int residentId, string recordKey, [FromBody] UpdateProcessRecordingRequest request)
    {
        if (request.SessionDate == default)
            return BadRequest(new { message = "SessionDate is required." });
        if (string.IsNullOrWhiteSpace(request.SessionType))
            return BadRequest(new { message = "SessionType is required." });

        var sessionDateUtc = NormalizeToUtc(request.SessionDate);

        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                UPDATE lighthouse.process_recordings
                SET session_date = {0},
                    social_worker = {1},
                    session_type = {2},
                    session_duration_minutes = {3},
                    emotional_state_observed = {4},
                    emotional_state_end = {5},
                    session_narrative = {6},
                    interventions_applied = {7},
                    follow_up_actions = {8},
                    progress_noted = {9},
                    concerns_flagged = {10},
                    referral_made = {11},
                    notes_restricted = {12}
                WHERE resident_id = {13}
                  AND ctid = CAST({14} AS tid)
                """,
                sessionDateUtc,
                request.SocialWorker,
                request.SessionType.Trim(),
                request.SessionDurationMinutes,
                request.EmotionalStateObserved,
                request.EmotionalStateEnd,
                request.SessionNarrative,
                request.InterventionsApplied,
                request.FollowUpActions,
                request.ProgressNoted,
                request.ConcernsFlagged,
                request.ReferralMade,
                request.NotesRestricted,
                residentId,
                recordKey);
            if (affected == 0)
                return NotFound(new { message = "Process recording not found." });
            return Ok(new { message = "Process recording updated." });
        }
        catch
        {
            if (!int.TryParse(recordKey, out var id))
                throw;

            var row = await dbContext.ProcessRecordings.FirstOrDefaultAsync(r => r.Id == id && r.ResidentId == residentId);
            if (row is null) return NotFound(new { message = "Process recording not found." });
            row.SessionDate = sessionDateUtc;
            row.SessionType = request.SessionType.Trim();
            row.EmotionalState = request.EmotionalStateObserved;
            row.NarrativeSummary = request.SessionNarrative;
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Process recording updated." });
        }
    }

    [HttpDelete("residents/{residentId:int}/process-recordings/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteProcessRecording(int residentId, string recordKey)
    {
        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                DELETE FROM lighthouse.process_recordings
                WHERE resident_id = {0}
                  AND ctid = CAST({1} AS tid)
                """,
                residentId,
                recordKey);
            if (affected == 0) return NotFound(new { message = "Process recording not found." });
            return Ok(new { message = "Process recording deleted." });
        }
        catch
        {
            if (!int.TryParse(recordKey, out var id))
                throw;
            var row = await dbContext.ProcessRecordings.FirstOrDefaultAsync(r => r.Id == id && r.ResidentId == residentId);
            if (row is null) return NotFound(new { message = "Process recording not found." });
            dbContext.ProcessRecordings.Remove(row);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Process recording deleted." });
        }
    }

    [HttpGet("residents/{residentId:int}/home-visitations")]
    public async Task<IActionResult> GetHomeVisitations(int residentId)
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<HomeVisitationRow>(
                """
                SELECT
                    ROW_NUMBER() OVER (ORDER BY hv.visit_date DESC) AS "Id",
                    hv.ctid::text AS "RecordKey",
                    hv.resident_id AS "ResidentId",
                    hv.visit_date AS "VisitDate",
                    hv.social_worker AS "SocialWorker",
                    hv.visit_type AS "VisitType",
                    hv.location_visited AS "LocationVisited",
                    hv.family_members_present AS "FamilyMembersPresent",
                    hv.purpose AS "Purpose",
                    hv.observations AS "Observations",
                    hv.family_cooperation_level AS "FamilyCooperationLevel",
                    hv.safety_concerns_noted AS "SafetyConcernsNoted",
                    hv.follow_up_needed AS "FollowUpNeeded",
                    hv.follow_up_notes AS "FollowUpNotes",
                    hv.visit_outcome AS "VisitOutcome"
                FROM lighthouse.home_visitations hv
                WHERE hv.resident_id = {0}
                ORDER BY hv.visit_date DESC
                """, residentId)
                .ToListAsync();
            return Ok(rows);
        }
        catch
        {
            var rows = await dbContext.HomeVisitations
                .AsNoTracking()
                .Where(homeVisitation => homeVisitation.ResidentId == residentId)
                .OrderByDescending(homeVisitation => homeVisitation.VisitDate)
                .ThenByDescending(homeVisitation => homeVisitation.Id)
                .Select(homeVisitation => new HomeVisitationRow
                {
                    Id = homeVisitation.Id,
                    ResidentId = homeVisitation.ResidentId,
                    VisitDate = homeVisitation.VisitDate,
                    VisitType = homeVisitation.VisitType,
                    Observations = homeVisitation.Observations,
                    SocialWorker = null,
                    LocationVisited = null,
                    FamilyMembersPresent = null,
                    Purpose = null,
                    FamilyCooperationLevel = null,
                    SafetyConcernsNoted = null,
                    FollowUpNeeded = null,
                    FollowUpNotes = null,
                    VisitOutcome = null,
                })
                .ToListAsync();
            return Ok(rows);
        }
    }

    [HttpPost("residents/{residentId:int}/home-visitations")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddHomeVisitation(int residentId, [FromBody] CreateHomeVisitationRequest request)
    {
        if (request.VisitDate == default)
            return BadRequest(new { message = "VisitDate is required." });
        if (string.IsNullOrWhiteSpace(request.VisitType))
            return BadRequest(new { message = "VisitType is required." });

        var observations = string.IsNullOrWhiteSpace(request.Observations) ? null : request.Observations.Trim();
        var visitDateUtc = NormalizeToUtc(request.VisitDate);

        try
        {
            var (idColumn, idIsGenerated) = await GetLighthousePrimaryKeyInfoAsync("home_visitations");
            if (!string.IsNullOrWhiteSpace(idColumn) && !idIsGenerated)
            {
                var newId = await NextLighthouseIdAsync("home_visitations", idColumn);
                var insertSql =
                    "INSERT INTO lighthouse.home_visitations " +
                    $"({idColumn}, resident_id, visit_date, social_worker, visit_type, location_visited, family_members_present, purpose, observations, family_cooperation_level, safety_concerns_noted, follow_up_needed, follow_up_notes, visit_outcome) " +
                    "VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}, {12}, {13})";
                await dbContext.Database.ExecuteSqlRawAsync(
                    insertSql,
                    newId,
                    residentId,
                    visitDateUtc,
                    request.SocialWorker,
                    request.VisitType.Trim(),
                    request.LocationVisited,
                    request.FamilyMembersPresent,
                    request.Purpose,
                    observations,
                    request.FamilyCooperationLevel,
                    request.SafetyConcernsNoted,
                    request.FollowUpNeeded,
                    request.FollowUpNotes,
                    request.VisitOutcome);
            }
            else
            {
                await dbContext.Database.ExecuteSqlRawAsync(
                    """
                    INSERT INTO lighthouse.home_visitations
                        (resident_id, visit_date, social_worker, visit_type, location_visited, family_members_present, purpose, observations, family_cooperation_level, safety_concerns_noted, follow_up_needed, follow_up_notes, visit_outcome)
                    VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}, {12})
                    """,
                    residentId,
                    visitDateUtc,
                    request.SocialWorker,
                    request.VisitType.Trim(),
                    request.LocationVisited,
                    request.FamilyMembersPresent,
                    request.Purpose,
                    observations,
                    request.FamilyCooperationLevel,
                    request.SafetyConcernsNoted,
                    request.FollowUpNeeded,
                    request.FollowUpNotes,
                    request.VisitOutcome);
            }
            return Ok(new { message = "Home visitation saved." });
        }
        catch
        {
            var row = new Data.Entities.HomeVisitation
            {
                ResidentId = residentId,
                VisitDate = visitDateUtc,
                VisitType = request.VisitType.Trim(),
                Observations = observations,
            };
            dbContext.HomeVisitations.Add(row);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Home visitation saved." });
        }
    }

    [HttpPut("residents/{residentId:int}/home-visitations/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateHomeVisitation(int residentId, string recordKey, [FromBody] UpdateHomeVisitationRequest request)
    {
        if (request.VisitDate == default)
            return BadRequest(new { message = "VisitDate is required." });
        if (string.IsNullOrWhiteSpace(request.VisitType))
            return BadRequest(new { message = "VisitType is required." });

        var visitDateUtc = NormalizeToUtc(request.VisitDate);
        var observations = string.IsNullOrWhiteSpace(request.Observations) ? null : request.Observations.Trim();

        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                UPDATE lighthouse.home_visitations
                SET visit_date = {0},
                    social_worker = {1},
                    visit_type = {2},
                    location_visited = {3},
                    family_members_present = {4},
                    purpose = {5},
                    observations = {6},
                    family_cooperation_level = {7},
                    safety_concerns_noted = {8},
                    follow_up_needed = {9},
                    follow_up_notes = {10},
                    visit_outcome = {11}
                WHERE resident_id = {12}
                  AND ctid = CAST({13} AS tid)
                """,
                visitDateUtc,
                request.SocialWorker,
                request.VisitType.Trim(),
                request.LocationVisited,
                request.FamilyMembersPresent,
                request.Purpose,
                observations,
                request.FamilyCooperationLevel,
                request.SafetyConcernsNoted,
                request.FollowUpNeeded,
                request.FollowUpNotes,
                request.VisitOutcome,
                residentId,
                recordKey);
            if (affected == 0)
                return NotFound(new { message = "Home visitation not found." });
            return Ok(new { message = "Home visitation updated." });
        }
        catch
        {
            if (!int.TryParse(recordKey, out var id))
                throw;

            var row = await dbContext.HomeVisitations.FirstOrDefaultAsync(r => r.Id == id && r.ResidentId == residentId);
            if (row is null) return NotFound(new { message = "Home visitation not found." });
            row.VisitDate = visitDateUtc;
            row.VisitType = request.VisitType.Trim();
            row.Observations = observations;
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Home visitation updated." });
        }
    }

    [HttpDelete("residents/{residentId:int}/home-visitations/{recordKey}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteHomeVisitation(int residentId, string recordKey)
    {
        try
        {
            var affected = await dbContext.Database.ExecuteSqlRawAsync(
                """
                DELETE FROM lighthouse.home_visitations
                WHERE resident_id = {0}
                  AND ctid = CAST({1} AS tid)
                """,
                residentId,
                recordKey);
            if (affected == 0) return NotFound(new { message = "Home visitation not found." });
            return Ok(new { message = "Home visitation deleted." });
        }
        catch
        {
            if (!int.TryParse(recordKey, out var id))
                throw;
            var row = await dbContext.HomeVisitations.FirstOrDefaultAsync(r => r.Id == id && r.ResidentId == residentId);
            if (row is null) return NotFound(new { message = "Home visitation not found." });
            dbContext.HomeVisitations.Remove(row);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Home visitation deleted." });
        }
    }

    private static string BuildNarrative(params string?[] blocks)
    {
        return string.Join(Environment.NewLine, blocks.Where(b => !string.IsNullOrWhiteSpace(b)).Select(b => b!.Trim()));
    }

    private static string? ExtractTaggedSection(string text, string tag)
    {
        var index = text.IndexOf(tag, StringComparison.OrdinalIgnoreCase);
        if (index < 0) return null;
        var after = text[(index + tag.Length)..].Trim();
        var nextIntervention = after.IndexOf("Interventions applied:", StringComparison.OrdinalIgnoreCase);
        var nextFollowUp = after.IndexOf("Follow-up actions:", StringComparison.OrdinalIgnoreCase);
        var cut = new[] { nextIntervention, nextFollowUp }.Where(i => i >= 0).DefaultIfEmpty(-1).Min();
        var value = cut >= 0 ? after[..cut].Trim() : after;
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private async Task<(string? IdColumn, bool IsGenerated)> GetLighthousePrimaryKeyInfoAsync(string tableName)
    {
        var pk = await dbContext.Database.SqlQueryRaw<PrimaryKeyInfoRow>(
            """
            SELECT a.attname AS "IdColumn"
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
            WHERE i.indisprimary
              AND n.nspname = 'lighthouse'
              AND t.relname = {0}
            LIMIT 1
            """,
            tableName)
            .FirstOrDefaultAsync();
        if (pk?.IdColumn is null) return (null, false);

        var meta = await dbContext.Database.SqlQueryRaw<ColumnMetaRow>(
            """
            SELECT
                COALESCE(c.is_identity, 'NO') AS "IsIdentity",
                c.column_default AS "ColumnDefault"
            FROM information_schema.columns c
            WHERE c.table_schema = 'lighthouse'
              AND c.table_name = {0}
              AND c.column_name = {1}
            LIMIT 1
            """,
            tableName,
            pk.IdColumn)
            .FirstOrDefaultAsync();

        var isGenerated = string.Equals(meta?.IsIdentity, "YES", StringComparison.OrdinalIgnoreCase)
            || (meta?.ColumnDefault?.Contains("nextval", StringComparison.OrdinalIgnoreCase) ?? false);
        return (pk.IdColumn, isGenerated);
    }

    private async Task<int> NextLighthouseIdAsync(string tableName, string idColumn)
    {
        var rows = await dbContext.Database.SqlQueryRaw<NumericRow>(
            $"""
            SELECT COALESCE(MAX({idColumn}), 0) + 1 AS "Value"
            FROM lighthouse.{tableName}
            """)
            .ToListAsync();
        return rows.FirstOrDefault()?.Value ?? 1;
    }

    private static DateTime NormalizeToUtc(DateTime value)
    {
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
    }

    private sealed class CaseloadResidentRow
    {
        public int Id { get; set; }
        public string DisplayName { get; set; } = string.Empty;
        public string CaseControlNo { get; set; } = string.Empty;
        public string CaseStatus { get; set; } = string.Empty;
        public int? SafehouseId { get; set; }
        public string? SafehouseName { get; set; }
        public string? AssignedSocialWorker { get; set; }
        public DateTime? DateAdmitted { get; set; }
        public DateTime? DateClosed { get; set; }
    }

    private sealed class ResidentDetailRow
    {
        public int Id { get; set; }
        public string DisplayName { get; set; } = string.Empty;
        public string CaseControlNo { get; set; } = string.Empty;
        public string CaseStatus { get; set; } = string.Empty;
        public int? SafehouseId { get; set; }
        public string? SafehouseName { get; set; }
        public string? Sex { get; set; }
        public DateTime? DateOfBirth { get; set; }
        public string? PlaceOfBirth { get; set; }
        public string? Religion { get; set; }
        public string? CaseCategory { get; set; }
        public string? AssignedSocialWorker { get; set; }
        public string? ReferralSource { get; set; }
        public DateTime? DateAdmitted { get; set; }
        public DateTime? DateClosed { get; set; }
        public string? ReintegrationType { get; set; }
        public string? ReintegrationStatus { get; set; }
        public string? NotesRestricted { get; set; }
        public string? EducationGrade { get; set; }
        public string? SchoolName { get; set; }
        public bool? IsEnrolled { get; set; }
    }

    private sealed class ProcessRecordingRow
    {
        public int Id { get; set; }
        public string RecordKey { get; set; } = string.Empty;
        public int ResidentId { get; set; }
        public DateTime SessionDate { get; set; }
        public string? SocialWorker { get; set; }
        public string SessionType { get; set; } = string.Empty;
        public int? SessionDurationMinutes { get; set; }
        public string? EmotionalStateObserved { get; set; }
        public string? EmotionalStateEnd { get; set; }
        public string? SessionNarrative { get; set; }
        public string? InterventionsApplied { get; set; }
        public string? FollowUpActions { get; set; }
        public bool? ProgressNoted { get; set; }
        public bool? ConcernsFlagged { get; set; }
        public bool? ReferralMade { get; set; }
        public string? NotesRestricted { get; set; }
    }

    private sealed class HomeVisitationRow
    {
        public int Id { get; set; }
        public string RecordKey { get; set; } = string.Empty;
        public int ResidentId { get; set; }
        public DateTime VisitDate { get; set; }
        public string? SocialWorker { get; set; }
        public string VisitType { get; set; } = string.Empty;
        public string? LocationVisited { get; set; }
        public string? FamilyMembersPresent { get; set; }
        public string? Purpose { get; set; }
        public string? Observations { get; set; }
        public string? FamilyCooperationLevel { get; set; }
        public bool? SafetyConcernsNoted { get; set; }
        public bool? FollowUpNeeded { get; set; }
        public string? FollowUpNotes { get; set; }
        public string? VisitOutcome { get; set; }
    }

    // DTOs for the cross-resident summary list endpoints. Deliberately leaner
    // than the per-resident Row DTOs — the list views only need enough to
    // identify the record, show a short preview, and link back to the
    // resident detail page for the full form.
    private sealed class ProcessRecordingSummaryRow
    {
        public string RecordKey { get; set; } = string.Empty;
        public int ResidentId { get; set; }
        public string ResidentLabel { get; set; } = string.Empty;
        public string? CaseStatus { get; set; }
        public DateTime SessionDate { get; set; }
        public string? SocialWorker { get; set; }
        public string SessionType { get; set; } = string.Empty;
        public string? EmotionalStateObserved { get; set; }
        public bool? ConcernsFlagged { get; set; }
        public bool? ProgressNoted { get; set; }
        public string? NarrativePreview { get; set; }
    }

    private sealed class HomeVisitationSummaryRow
    {
        public string RecordKey { get; set; } = string.Empty;
        public int ResidentId { get; set; }
        public string ResidentLabel { get; set; } = string.Empty;
        public string? CaseStatus { get; set; }
        public DateTime VisitDate { get; set; }
        public string? SocialWorker { get; set; }
        public string VisitType { get; set; } = string.Empty;
        public string? FamilyCooperationLevel { get; set; }
        public bool? SafetyConcernsNoted { get; set; }
        public bool? FollowUpNeeded { get; set; }
        public string? VisitOutcome { get; set; }
        public string? ObservationsPreview { get; set; }
    }

    private sealed class IncidentReportRow
    {
        public int Id { get; set; }
        public string RecordKey { get; set; } = string.Empty;
        public int ResidentId { get; set; }
        public int? SafehouseId { get; set; }
        public DateTime IncidentDate { get; set; }
        public string IncidentType { get; set; } = string.Empty;
        public string? Severity { get; set; }
        public string? Description { get; set; }
        public string? ResponseTaken { get; set; }
        public bool? Resolved { get; set; }
        public DateTime? ResolutionDate { get; set; }
        public string? ReportedBy { get; set; }
        public bool? FollowUpRequired { get; set; }
    }

    private sealed class InterventionPlanRow
    {
        public int Id { get; set; }
        public string RecordKey { get; set; } = string.Empty;
        public int ResidentId { get; set; }
        public string? PlanCategory { get; set; }
        public string? PlanDescription { get; set; }
        public string? ServicesProvided { get; set; }
        public decimal? TargetValue { get; set; }
        public DateTime? TargetDate { get; set; }
        public string? Status { get; set; }
        public DateTime? CaseConferenceDate { get; set; }
        public DateTime? CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public sealed class HealthWellbeingRow
    {
        public DateTime? RecordDate { get; set; }
        public decimal? GeneralHealthScore { get; set; }
        public decimal? NutritionScore { get; set; }
        public decimal? SleepQualityScore { get; set; }
        public decimal? EnergyLevelScore { get; set; }
        public decimal? HeightCm { get; set; }
        public decimal? WeightKg { get; set; }
        public decimal? Bmi { get; set; }
        public bool? MedicalCheckupDone { get; set; }
        public bool? DentalCheckupDone { get; set; }
        public bool? PsychologicalCheckupDone { get; set; }
        public string? Notes { get; set; }
    }

    private sealed class PrimaryKeyInfoRow
    {
        public string? IdColumn { get; set; }
    }

    private sealed class ColumnMetaRow
    {
        public string IsIdentity { get; set; } = "NO";
        public string? ColumnDefault { get; set; }
    }

    private sealed class NumericRow
    {
        public int Value { get; set; }
    }

    public sealed class CreateProcessRecordingRequest
    {
        public DateTime SessionDate { get; set; }
        public string SessionType { get; set; } = string.Empty;
        public string? SocialWorker { get; set; }
        public int? SessionDurationMinutes { get; set; }
        public string? EmotionalStateObserved { get; set; }
        public string? EmotionalStateEnd { get; set; }
        public string? SessionNarrative { get; set; }
        public string? InterventionsApplied { get; set; }
        public string? FollowUpActions { get; set; }
        public bool? ProgressNoted { get; set; }
        public bool? ConcernsFlagged { get; set; }
        public bool? ReferralMade { get; set; }
        public string? NotesRestricted { get; set; }
    }

    public sealed class UpdateResidentDetailRequest
    {
        public string? CaseStatus { get; set; }
        public int? SafehouseId { get; set; }
        public string? Sex { get; set; }
        public DateTime? DateOfBirth { get; set; }
        public string? PlaceOfBirth { get; set; }
        public string? Religion { get; set; }
        public string? CaseCategory { get; set; }
        public string? AssignedSocialWorker { get; set; }
        public string? ReferralSource { get; set; }
        public DateTime? DateAdmitted { get; set; }
        public DateTime? DateClosed { get; set; }
        public string? ReintegrationType { get; set; }
        public string? ReintegrationStatus { get; set; }
    }

    public sealed class CreateResidentRequest
    {
        public string CaseControlNo { get; set; } = string.Empty;
        public string InternalCode { get; set; } = string.Empty;
        public string CaseStatus { get; set; } = string.Empty;
        public int? SafehouseId { get; set; }
        public string? Sex { get; set; }
        public DateTime? DateOfBirth { get; set; }
        public string? PlaceOfBirth { get; set; }
        public string? Religion { get; set; }
        public string? CaseCategory { get; set; }
        public string? AssignedSocialWorker { get; set; }
        public string? ReferralSource { get; set; }
        public DateTime? DateAdmitted { get; set; }
        public DateTime? DateClosed { get; set; }
        public string? ReintegrationType { get; set; }
        public string? ReintegrationStatus { get; set; }
    }

    public sealed class UpdateProcessRecordingRequest
    {
        public DateTime SessionDate { get; set; }
        public string SessionType { get; set; } = string.Empty;
        public string? SocialWorker { get; set; }
        public int? SessionDurationMinutes { get; set; }
        public string? EmotionalStateObserved { get; set; }
        public string? EmotionalStateEnd { get; set; }
        public string? SessionNarrative { get; set; }
        public string? InterventionsApplied { get; set; }
        public string? FollowUpActions { get; set; }
        public bool? ProgressNoted { get; set; }
        public bool? ConcernsFlagged { get; set; }
        public bool? ReferralMade { get; set; }
        public string? NotesRestricted { get; set; }
    }

    public sealed class CreateHomeVisitationRequest
    {
        public DateTime VisitDate { get; set; }
        public string? SocialWorker { get; set; }
        public string VisitType { get; set; } = string.Empty;
        public string? LocationVisited { get; set; }
        public string? FamilyMembersPresent { get; set; }
        public string? Purpose { get; set; }
        public string? Observations { get; set; }
        public string? FamilyCooperationLevel { get; set; }
        public bool? SafetyConcernsNoted { get; set; }
        public bool? FollowUpNeeded { get; set; }
        public string? FollowUpNotes { get; set; }
        public string? VisitOutcome { get; set; }
    }

    public sealed class UpdateHomeVisitationRequest
    {
        public DateTime VisitDate { get; set; }
        public string? SocialWorker { get; set; }
        public string VisitType { get; set; } = string.Empty;
        public string? LocationVisited { get; set; }
        public string? FamilyMembersPresent { get; set; }
        public string? Purpose { get; set; }
        public string? Observations { get; set; }
        public string? FamilyCooperationLevel { get; set; }
        public bool? SafetyConcernsNoted { get; set; }
        public bool? FollowUpNeeded { get; set; }
        public string? FollowUpNotes { get; set; }
        public string? VisitOutcome { get; set; }
    }

    public sealed class CreateIncidentReportRequest
    {
        public int? SafehouseId { get; set; }
        public DateTime IncidentDate { get; set; }
        public string IncidentType { get; set; } = string.Empty;
        public string? Severity { get; set; }
        public string? Description { get; set; }
        public string? ResponseTaken { get; set; }
        public bool? Resolved { get; set; }
        public DateTime? ResolutionDate { get; set; }
        public string? ReportedBy { get; set; }
        public bool? FollowUpRequired { get; set; }
    }

    public sealed class UpdateIncidentReportRequest
    {
        public int? SafehouseId { get; set; }
        public DateTime IncidentDate { get; set; }
        public string IncidentType { get; set; } = string.Empty;
        public string? Severity { get; set; }
        public string? Description { get; set; }
        public string? ResponseTaken { get; set; }
        public bool? Resolved { get; set; }
        public DateTime? ResolutionDate { get; set; }
        public string? ReportedBy { get; set; }
        public bool? FollowUpRequired { get; set; }
    }

    public sealed class CreateInterventionPlanRequest
    {
        public string? PlanCategory { get; set; }
        public string? PlanDescription { get; set; }
        public string? ServicesProvided { get; set; }
        public decimal? TargetValue { get; set; }
        public DateTime? TargetDate { get; set; }
        public string? Status { get; set; }
        public DateTime? CaseConferenceDate { get; set; }
    }

    public sealed class UpdateInterventionPlanRequest
    {
        public string? PlanCategory { get; set; }
        public string? PlanDescription { get; set; }
        public string? ServicesProvided { get; set; }
        public decimal? TargetValue { get; set; }
        public DateTime? TargetDate { get; set; }
        public string? Status { get; set; }
        public DateTime? CaseConferenceDate { get; set; }
    }

    public sealed class HealthWellbeingSummaryRow
    {
        public DateTime? RecordDate { get; set; }
        public decimal? GeneralHealthScore { get; set; }
        public decimal? NutritionScore { get; set; }
        public decimal? SleepQualityScore { get; set; }
        public decimal? EnergyLevelScore { get; set; }
        public decimal? HeightCm { get; set; }
        public decimal? WeightKg { get; set; }
        public decimal? Bmi { get; set; }
        public bool? MedicalCheckupDone { get; set; }
        public bool? DentalCheckupDone { get; set; }
        public bool? PsychologicalCheckupDone { get; set; }
        public string? Notes { get; set; }
    }

    public sealed class HealthWellbeingDashboardResponse
    {
        public HealthWellbeingSummaryRow? Latest { get; set; }
        public int TotalRecords { get; set; }
        public int MedicalDoneCount { get; set; }
        public int DentalDoneCount { get; set; }
        public int PsychologicalDoneCount { get; set; }
        public List<HealthWellbeingRow> Recent { get; set; } = [];
    }
}
