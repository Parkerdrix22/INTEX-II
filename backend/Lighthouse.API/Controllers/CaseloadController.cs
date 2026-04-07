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
                    r.notes_restricted AS "NotesRestricted"
                FROM lighthouse.residents r
                LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id
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

    [HttpGet("residents/{residentId:int}/process-recordings")]
    public async Task<IActionResult> GetProcessRecordings(int residentId)
    {
        try
        {
            var rows = await dbContext.Database.SqlQueryRaw<ProcessRecordingRow>(
                """
                SELECT
                    pr.id AS "Id",
                    pr.resident_id AS "ResidentId",
                    pr.session_date AS "SessionDate",
                    pr.session_type AS "SessionType",
                    pr.emotional_state AS "EmotionalState",
                    pr.narrative_summary AS "NarrativeSummary"
                FROM lighthouse.process_recordings pr
                WHERE pr.resident_id = {0}
                ORDER BY pr.session_date DESC, pr.id DESC
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
                    EmotionalState = processRecording.EmotionalState,
                    NarrativeSummary = processRecording.NarrativeSummary,
                })
                .ToListAsync();
            return Ok(rows);
        }
    }

    [HttpPost("residents/{residentId:int}/process-recordings")]
    public async Task<IActionResult> AddProcessRecording(int residentId, [FromBody] CreateProcessRecordingRequest request)
    {
        if (request.SessionDate == default)
            return BadRequest(new { message = "SessionDate is required." });
        if (string.IsNullOrWhiteSpace(request.SessionType))
            return BadRequest(new { message = "SessionType is required." });

        var narrative = BuildNarrative(
            request.NarrativeSummary,
            request.SocialWorker,
            request.InterventionsApplied,
            request.FollowUpActions);

        try
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.process_recordings
                    (resident_id, session_date, session_type, emotional_state, narrative_summary)
                VALUES ({0}, {1}, {2}, {3}, {4})
                """,
                residentId,
                request.SessionDate,
                request.SessionType.Trim(),
                request.EmotionalState,
                narrative);
            return Ok(new { message = "Process recording saved." });
        }
        catch
        {
            var row = new Data.Entities.ProcessRecording
            {
                ResidentId = residentId,
                SessionDate = request.SessionDate,
                SessionType = request.SessionType.Trim(),
                EmotionalState = request.EmotionalState,
                NarrativeSummary = narrative,
            };
            dbContext.ProcessRecordings.Add(row);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Process recording saved." });
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
                    hv.id AS "Id",
                    hv.resident_id AS "ResidentId",
                    hv.visit_date AS "VisitDate",
                    hv.visit_type AS "VisitType",
                    hv.observations AS "Observations"
                FROM lighthouse.home_visitations hv
                WHERE hv.resident_id = {0}
                ORDER BY hv.visit_date DESC, hv.id DESC
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
                })
                .ToListAsync();
            return Ok(rows);
        }
    }

    [HttpPost("residents/{residentId:int}/home-visitations")]
    public async Task<IActionResult> AddHomeVisitation(int residentId, [FromBody] CreateHomeVisitationRequest request)
    {
        if (request.VisitDate == default)
            return BadRequest(new { message = "VisitDate is required." });
        if (string.IsNullOrWhiteSpace(request.VisitType))
            return BadRequest(new { message = "VisitType is required." });

        var observations = BuildNarrative(
            request.Observations,
            request.FamilyCooperationLevel is null ? null : $"Family cooperation: {request.FamilyCooperationLevel}",
            request.SafetyConcerns,
            request.FollowUpActions);

        try
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO lighthouse.home_visitations
                    (resident_id, visit_date, visit_type, observations)
                VALUES ({0}, {1}, {2}, {3})
                """,
                residentId,
                request.VisitDate,
                request.VisitType.Trim(),
                observations);
            return Ok(new { message = "Home visitation saved." });
        }
        catch
        {
            var row = new Data.Entities.HomeVisitation
            {
                ResidentId = residentId,
                VisitDate = request.VisitDate,
                VisitType = request.VisitType.Trim(),
                Observations = observations,
            };
            dbContext.HomeVisitations.Add(row);
            await dbContext.SaveChangesAsync();
            return Ok(new { message = "Home visitation saved." });
        }
    }

    private static string BuildNarrative(params string?[] blocks)
    {
        return string.Join(Environment.NewLine, blocks.Where(b => !string.IsNullOrWhiteSpace(b)).Select(b => b!.Trim()));
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
    }

    private sealed class ProcessRecordingRow
    {
        public int Id { get; set; }
        public int ResidentId { get; set; }
        public DateTime SessionDate { get; set; }
        public string SessionType { get; set; } = string.Empty;
        public string? EmotionalState { get; set; }
        public string? NarrativeSummary { get; set; }
    }

    private sealed class HomeVisitationRow
    {
        public int Id { get; set; }
        public int ResidentId { get; set; }
        public DateTime VisitDate { get; set; }
        public string VisitType { get; set; } = string.Empty;
        public string? Observations { get; set; }
    }

    public sealed class CreateProcessRecordingRequest
    {
        public DateTime SessionDate { get; set; }
        public string SessionType { get; set; } = string.Empty;
        public string? SocialWorker { get; set; }
        public string? EmotionalState { get; set; }
        public string? NarrativeSummary { get; set; }
        public string? InterventionsApplied { get; set; }
        public string? FollowUpActions { get; set; }
    }

    public sealed class CreateHomeVisitationRequest
    {
        public DateTime VisitDate { get; set; }
        public string VisitType { get; set; } = string.Empty;
        public string? Observations { get; set; }
        public string? FamilyCooperationLevel { get; set; }
        public string? SafetyConcerns { get; set; }
        public string? FollowUpActions { get; set; }
    }
}
