using System.Text.Json;
using System.Text.RegularExpressions;
using Lighthouse.API.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Npgsql;

namespace Lighthouse.API.Controllers;

[ApiController]
[Route("api/case-resolution")]
[Authorize(Roles = "Admin,Staff")]
public class CaseResolutionController : ControllerBase
{
    private static readonly Lazy<InferenceSession> Session = new(() =>
    {
        var modelPath = FindModelFile();
        return new InferenceSession(modelPath);
    });

    private static string FindModelFile()
    {
        string[] searchPaths =
        [
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "is455", "ml-pipelines", "models",
                "pipeline_06_case_resolution_lr.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "is455", "ml-pipelines", "models",
                "pipeline_06_case_resolution_lr.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "is455", "ml-pipelines", "models",
                "pipeline_06_case_resolution_lr.onnx"),
        ];

        foreach (var p in searchPaths)
        {
            var resolved = Path.GetFullPath(p);
            if (System.IO.File.Exists(resolved)) return resolved;
        }

        throw new FileNotFoundException(
            $"ONNX model not found. Searched: {string.Join(", ", searchPaths.Select(Path.GetFullPath))}");
    }

    // 8 feature names in EXACT ONNX input order
    private static readonly string[] FeatureNames =
    [
        "case_cat_Surrendered",
        "case_cat_Abandoned",
        "case_cat_Foundling",
        "case_cat_Neglected",
        "length_of_stay_days",
        "has_safety_plan",
        "achieved_rate",
        "session_count",
    ];

    private static readonly string[] FeatureDisplayNames =
    [
        "Case category: Surrendered",
        "Case category: Abandoned",
        "Case category: Foundling",
        "Case category: Neglected",
        "Length of stay (days)",
        "Has safety plan",
        "Intervention achieved rate",
        "Session count",
    ];

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard([FromServices] AppDbContext dbContext)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;

            var residents = new List<CrResidentRow>();
            var healthByResident = new Dictionary<int, List<CrHealthRow>>();
            var educationByResident = new Dictionary<int, List<CrEducationRow>>();
            var sessionsByResident = new Dictionary<int, List<CrSessionRow>>();
            var visitsByResident = new Dictionary<int, List<CrVisitRow>>();
            var incidentsByResident = new Dictionary<int, List<CrIncidentRow>>();
            var plansByResident = new Dictionary<int, List<CrPlanRow>>();

            await using (var conn = new NpgsqlConnection(connectionString))
            {
                await conn.OpenAsync();

                await using (var cmd = new NpgsqlCommand(
                    @"SELECT r.resident_id, r.case_control_no, r.internal_code, r.safehouse_id,
                             COALESCE(s.name, '') AS safehouse_name,
                             r.case_status, r.case_category,
                             r.age_upon_admission, r.length_of_stay,
                             r.current_risk_level, r.reintegration_status,
                             r.assigned_social_worker, r.date_of_admission, r.date_closed
                      FROM lighthouse.residents r
                      LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        residents.Add(ReadResidentRow(reader));
                    }
                }

                await LoadAllHealth(conn, healthByResident);
                await LoadAllEducation(conn, educationByResident);
                await LoadAllSessions(conn, sessionsByResident);
                await LoadAllVisits(conn, visitsByResident);
                await LoadAllIncidents(conn, incidentsByResident);
                await LoadAllPlans(conn, plansByResident);
            }

            var results = new List<CaseResolutionDto>();
            foreach (var r in residents)
            {
                var plans = plansByResident.GetValueOrDefault(r.ResidentId) ?? new List<CrPlanRow>();
                var sessions = sessionsByResident.GetValueOrDefault(r.ResidentId) ?? new List<CrSessionRow>();
                var incidents = incidentsByResident.GetValueOrDefault(r.ResidentId) ?? new List<CrIncidentRow>();

                var features = BuildFeatures(r, sessions.Count, plans);
                var pResolved = RunInference(features);
                var dto = BuildDto(r, features, pResolved, plans, incidents.Count);
                results.Add(dto);
            }

            results = results.OrderByDescending(d => d.PredictedResolutionProbability).ToList();
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    [HttpGet("{residentId:int}")]
    public async Task<IActionResult> GetResidentDetail(int residentId, [FromServices] AppDbContext dbContext)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;

            CrResidentRow? r = null;
            List<CrHealthRow>? health = null;
            List<CrEducationRow>? education = null;
            List<CrSessionRow>? sessions = null;
            List<CrVisitRow>? visits = null;
            List<CrIncidentRow>? incidents = null;
            List<CrPlanRow>? plans = null;

            await using (var conn = new NpgsqlConnection(connectionString))
            {
                await conn.OpenAsync();

                await using (var cmd = new NpgsqlCommand(
                    @"SELECT r.resident_id, r.case_control_no, r.internal_code, r.safehouse_id,
                             COALESCE(s.name, '') AS safehouse_name,
                             r.case_status, r.case_category,
                             r.age_upon_admission, r.length_of_stay,
                             r.current_risk_level, r.reintegration_status,
                             r.assigned_social_worker, r.date_of_admission, r.date_closed
                      FROM lighthouse.residents r
                      LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id
                      WHERE r.resident_id = @rid LIMIT 1", conn))
                {
                    cmd.Parameters.AddWithValue("rid", (long)residentId);
                    await using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        r = ReadResidentRow(reader);
                    }
                }

                if (r is null) return NotFound(new { message = "Resident not found." });

                health = await LoadHealth(conn, residentId);
                education = await LoadEducation(conn, residentId);
                sessions = await LoadSessions(conn, residentId);
                visits = await LoadVisits(conn, residentId);
                incidents = await LoadIncidents(conn, residentId);
                plans = await LoadPlans(conn, residentId);
            }

            var features = BuildFeatures(r, sessions.Count, plans);
            var pResolved = RunInference(features);
            var baseDto = BuildDto(r, features, pResolved, plans, incidents.Count);

            // Build CategoryStats (reusing the public DTOs from ResidentRiskController)
            var negativeStates = new HashSet<string> { "Sad", "Anxious", "Withdrawn", "Fearful" };
            var categoryStats = new CategoryStatsDto
            {
                Incidents = new IncidentStats
                {
                    Count = incidents.Count,
                    HighSeverity = incidents.Count(i => i.Severity == "High" || i.Severity == "Critical"),
                    SelfHarm = incidents.Count(i => Regex.IsMatch(i.IncidentType ?? "", "[Ss]elf")),
                    Runaway = incidents.Count(i => Regex.IsMatch(i.IncidentType ?? "", "[Rr]un|[Rr]unaway")),
                    Unresolved = incidents.Count(i => !i.Resolved),
                },
                Health = health.Count > 0
                    ? new HealthStats
                    {
                        MeanScore = Math.Round(health.Average(h => h.GeneralHealthScore), 3),
                        LatestScore = Math.Round(health.OrderByDescending(h => h.RecordDate).First().GeneralHealthScore, 3),
                        Trend = 0,
                        MeanNutrition = Math.Round(health.Average(h => h.NutritionScore), 3),
                        MeanSleep = Math.Round(health.Average(h => h.SleepQualityScore), 3),
                        RecordCount = health.Count,
                    }
                    : new HealthStats(),
                Education = education.Count > 0
                    ? new EducationStats
                    {
                        MeanAttendance = Math.Round(education.Average(e => e.AttendanceRate), 3),
                        MeanProgress = Math.Round(education.Average(e => e.ProgressPercent), 3),
                        LatestProgress = Math.Round(education.OrderByDescending(e => e.RecordDate).First().ProgressPercent, 3),
                        RecordCount = education.Count,
                    }
                    : new EducationStats(),
                Sessions = sessions.Count > 0
                    ? new SessionStats
                    {
                        Count = sessions.Count,
                        ConcernsFlaggedRate = Math.Round((double)sessions.Count(s => s.ConcernsFlagged) / sessions.Count, 3),
                        ProgressNotedRate = Math.Round((double)sessions.Count(s => s.ProgressNoted) / sessions.Count, 3),
                        ReferralMadeRate = Math.Round((double)sessions.Count(s => s.ReferralMade) / sessions.Count, 3),
                        NegativeEndStateRate = Math.Round((double)sessions.Count(s => negativeStates.Contains(s.EmotionalStateEnd)) / sessions.Count, 3),
                    }
                    : new SessionStats(),
                HomeVisits = visits.Count > 0
                    ? new HomeVisitStats
                    {
                        Count = visits.Count,
                        SafetyConcernsRate = Math.Round((double)visits.Count(v => v.SafetyConcernsNoted) / visits.Count, 3),
                        UncooperativeFamilyRate = Math.Round((double)visits.Count(v => v.FamilyCooperationLevel == "Uncooperative") / visits.Count, 3),
                        FavorableOutcomeRate = Math.Round((double)visits.Count(v => v.VisitOutcome == "Favorable") / visits.Count, 3),
                    }
                    : new HomeVisitStats(),
                Interventions = plans.Count > 0
                    ? new InterventionStats
                    {
                        Count = plans.Count,
                        AchievedRate = Math.Round((double)plans.Count(p => p.Status == "Achieved" || p.Status == "Completed") / plans.Count, 3),
                        OnHoldRate = Math.Round((double)plans.Count(p => p.Status == "On Hold") / plans.Count, 3),
                        HasSafetyPlan = plans.Any(p => Regex.IsMatch(p.PlanCategory ?? "", "[Ss]afety")),
                    }
                    : new InterventionStats(),
            };

            var coefficients = await LoadCoefficientsAsync();
            var featureContributions = new List<CaseResolutionFeatureDto>();
            for (int i = 0; i < FeatureNames.Length; i++)
            {
                var coef = coefficients.GetValueOrDefault(FeatureNames[i], 0.0);
                featureContributions.Add(new CaseResolutionFeatureDto
                {
                    Name = FeatureNames[i],
                    DisplayName = FeatureDisplayNames[i],
                    Value = Math.Round((double)features[i], 4),
                    Coefficient = Math.Round(coef, 4),
                    Direction = coef >= 0 ? "positive" : "negative",
                });
            }

            var detail = new DetailedCaseResolutionDto
            {
                ResidentId = baseDto.ResidentId,
                CaseControlNo = baseDto.CaseControlNo,
                InternalCode = baseDto.InternalCode,
                CaseStatus = baseDto.CaseStatus,
                CaseCategory = baseDto.CaseCategory,
                CurrentRiskLevel = baseDto.CurrentRiskLevel,
                ReintegrationStatus = baseDto.ReintegrationStatus,
                SafehouseId = baseDto.SafehouseId,
                SafehouseName = baseDto.SafehouseName,
                AssignedSocialWorker = baseDto.AssignedSocialWorker,
                DateOfAdmission = baseDto.DateOfAdmission,
                DateClosed = baseDto.DateClosed,
                PredictedResolutionProbability = baseDto.PredictedResolutionProbability,
                PredictedResolutionBand = baseDto.PredictedResolutionBand,
                ModelAgreesWithLabel = baseDto.ModelAgreesWithLabel,
                AgeAtIntake = baseDto.AgeAtIntake,
                LengthOfStayDays = baseDto.LengthOfStayDays,
                SessionCount = baseDto.SessionCount,
                AchievedRate = baseDto.AchievedRate,
                HasSafetyPlan = baseDto.HasSafetyPlan,
                PlanCount = baseDto.PlanCount,
                IncidentCount = baseDto.IncidentCount,
                TopResolutionFactors = baseDto.TopResolutionFactors,
                CategoryStats = categoryStats,
                FeatureContributions = featureContributions,
            };

            return Ok(detail);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message, type = ex.GetType().Name });
        }
    }

    [HttpGet("model-info")]
    public async Task<IActionResult> GetModelInfo([FromServices] AppDbContext dbContext)
    {
        var residentCount = await dbContext.Database
            .SqlQueryRaw<int>("SELECT COUNT(*)::int AS \"Value\" FROM lighthouse.residents")
            .FirstAsync();

        double rocAuc = 0;
        string? trainedAt = null;
        int nFeatures = 8;
        int nPositives = 0;
        int nSamples = 0;

        try
        {
            var metricsPath = Path.Combine(
                FindModelFile().Replace("pipeline_06_case_resolution_lr.onnx", ""),
                "training_metrics.json");
            if (System.IO.File.Exists(metricsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(metricsPath);
                var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("pipeline_06_case_resolution", out var p6))
                {
                    if (p6.TryGetProperty("metrics", out var metrics))
                    {
                        if (metrics.TryGetProperty("cv_roc_auc_mean", out var rocVal))
                            rocAuc = rocVal.GetDouble();
                        if (metrics.TryGetProperty("n_samples", out var nsVal))
                            nSamples = nsVal.GetInt32();
                        if (metrics.TryGetProperty("n_positives", out var npVal))
                            nPositives = npVal.GetInt32();
                        if (metrics.TryGetProperty("n_features", out var nfVal))
                            nFeatures = nfVal.GetInt32();
                    }
                    if (p6.TryGetProperty("trained_at", out var ta))
                        trainedAt = ta.GetString();
                }
            }
        }
        catch
        {
            // fall back to defaults
        }

        return Ok(new
        {
            residentCount,
            rocAuc = Math.Round(rocAuc, 4),
            trainedAt,
            modelName = "Logistic Regression (8 features)",
            nFeatures,
            nPositives,
            target = "case_status == 'Closed'",
        });
    }

    // ================== Helpers ==================

    private static float[] BuildFeatures(CrResidentRow r, int sessionCount, List<CrPlanRow> plans)
    {
        var f = new float[8];
        f[0] = r.CaseCategory == "Surrendered" ? 1f : 0f;
        f[1] = r.CaseCategory == "Abandoned" ? 1f : 0f;
        f[2] = r.CaseCategory == "Foundling" ? 1f : 0f;
        f[3] = r.CaseCategory == "Neglected" ? 1f : 0f;
        f[4] = ParseLengthOfStayDays(r.LengthOfStay);
        f[5] = plans.Any(p => Regex.IsMatch(p.PlanCategory ?? "", "[Ss]afety")) ? 1f : 0f;
        int planCount = plans.Count;
        f[6] = planCount > 0
            ? (float)plans.Count(p => p.Status == "Achieved" || p.Status == "Completed") / planCount
            : 0f;
        f[7] = sessionCount;
        return f;
    }

    private static float RunInference(float[] features)
    {
        var inputs = new List<NamedOnnxValue>(FeatureNames.Length);
        for (var i = 0; i < FeatureNames.Length; i++)
        {
            var t = new DenseTensor<float>(new[] { features[i] }, new[] { 1, 1 });
            inputs.Add(NamedOnnxValue.CreateFromTensor(FeatureNames[i], t));
        }

        using var results = Session.Value.Run(inputs);

        var probResult = results.First(r => r.Name == "output_probability");
        var probMaps = probResult.AsEnumerable<DisposableNamedOnnxValue>().ToList();
        var map = probMaps[0].AsEnumerable<KeyValuePair<long, float>>()
            .ToDictionary(kv => kv.Key, kv => kv.Value);
        return map.TryGetValue(1L, out var v) ? v : 0f;
    }

    private static CaseResolutionDto BuildDto(
        CrResidentRow r,
        float[] features,
        float pResolved,
        List<CrPlanRow> plans,
        int incidentCount)
    {
        var humanFlag = r.CaseStatus == "Closed";
        var modelFlag = pResolved >= 0.5f;
        var band = pResolved >= 0.75f ? "Imminent"
            : pResolved >= 0.5f ? "Likely"
            : pResolved >= 0.25f ? "Possible"
            : "Unlikely";

        var hasSafetyPlan = features[5] >= 0.5f;
        var achievedRate = (double)features[6];
        var lengthOfStayDays = features[4];
        var sessionCount = (int)features[7];
        var planCount = plans.Count;

        return new CaseResolutionDto
        {
            ResidentId = r.ResidentId,
            CaseControlNo = r.CaseControlNo,
            InternalCode = r.InternalCode,
            CaseStatus = r.CaseStatus,
            CaseCategory = r.CaseCategory,
            CurrentRiskLevel = r.CurrentRiskLevel,
            ReintegrationStatus = r.ReintegrationStatus,
            SafehouseId = r.SafehouseId,
            SafehouseName = r.SafehouseName,
            AssignedSocialWorker = r.AssignedSocialWorker,
            DateOfAdmission = r.DateOfAdmission?.ToString("yyyy-MM-dd"),
            DateClosed = r.DateClosed?.ToString("yyyy-MM-dd"),
            PredictedResolutionProbability = Math.Round((double)pResolved, 4),
            PredictedResolutionBand = band,
            ModelAgreesWithLabel = humanFlag == modelFlag,
            AgeAtIntake = ParseYearsMonths(r.AgeUponAdmission),
            LengthOfStayDays = lengthOfStayDays,
            SessionCount = sessionCount,
            AchievedRate = Math.Round(achievedRate, 4),
            HasSafetyPlan = hasSafetyPlan,
            PlanCount = planCount,
            IncidentCount = incidentCount,
            TopResolutionFactors = ComputeTopResolutionFactors(
                r, achievedRate, lengthOfStayDays, hasSafetyPlan, planCount, incidentCount, sessionCount),
        };
    }

    private static List<string> ComputeTopResolutionFactors(
        CrResidentRow r,
        double achievedRate,
        float lengthOfStayDays,
        bool hasSafetyPlan,
        int planCount,
        int incidentCount,
        int sessionCount)
    {
        // Each candidate gets a binary present/absent score plus a priority order.
        var candidates = new List<(string display, double score, int priority)>
        {
            ("Strong intervention follow-through", achievedRate >= 0.5 ? 1.0 : 0.0, 1),
            ("Long enough in care", lengthOfStayDays >= 365 ? 1.0 : 0.0, 2),
            ("Surrendered case (faster path)", r.CaseCategory == "Surrendered" ? 1.0 : 0.0, 3),
            ("Active safety plan in place", hasSafetyPlan ? 1.0 : 0.0, 4),
            ("Comprehensive intervention plan", planCount >= 3 ? 1.0 : 0.0, 5),
            ("Zero incidents on record", incidentCount == 0 ? 1.0 : 0.0, 6),
            ("Sustained engagement with social worker", sessionCount >= 50 ? 1.0 : 0.0, 7),
        };

        return candidates
            .Where(c => c.score > 0)
            .OrderBy(c => c.priority)
            .Take(3)
            .Select(c => c.display)
            .ToList();
    }

    private static async Task<Dictionary<string, double>> LoadCoefficientsAsync()
    {
        var dict = new Dictionary<string, double>();
        try
        {
            var coefPath = Path.Combine(
                FindModelFile().Replace("pipeline_06_case_resolution_lr.onnx", ""),
                "pipeline_06_lr_coefficients.json");
            if (System.IO.File.Exists(coefPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(coefPath);
                var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("coefficients", out var coefArr))
                {
                    foreach (var item in coefArr.EnumerateArray())
                    {
                        if (item.TryGetProperty("feature", out var fName) &&
                            item.TryGetProperty("coef", out var fCoef))
                        {
                            var name = fName.GetString();
                            if (!string.IsNullOrEmpty(name))
                                dict[name] = fCoef.GetDouble();
                        }
                    }
                }
            }
        }
        catch
        {
            // return whatever we have
        }
        return dict;
    }

    // ================== Data loading ==================

    private static CrResidentRow ReadResidentRow(NpgsqlDataReader reader)
    {
        return new CrResidentRow
        {
            ResidentId = (int)reader.GetInt64(0),
            CaseControlNo = reader.IsDBNull(1) ? "" : reader.GetString(1),
            InternalCode = reader.IsDBNull(2) ? "" : reader.GetString(2),
            SafehouseId = reader.IsDBNull(3) ? (int?)null : (int)reader.GetInt64(3),
            SafehouseName = reader.IsDBNull(4) ? "" : reader.GetString(4),
            CaseStatus = reader.IsDBNull(5) ? "" : reader.GetString(5),
            CaseCategory = reader.IsDBNull(6) ? "" : reader.GetString(6),
            AgeUponAdmission = reader.IsDBNull(7) ? "" : reader.GetString(7),
            LengthOfStay = reader.IsDBNull(8) ? "" : reader.GetString(8),
            CurrentRiskLevel = reader.IsDBNull(9) ? "" : reader.GetString(9),
            ReintegrationStatus = reader.IsDBNull(10) ? "" : reader.GetString(10),
            AssignedSocialWorker = reader.IsDBNull(11) ? "" : reader.GetString(11),
            DateOfAdmission = reader.IsDBNull(12) ? (DateTime?)null : reader.GetDateTime(12),
            DateClosed = reader.IsDBNull(13) ? (DateTime?)null : reader.GetDateTime(13),
        };
    }

    private static async Task LoadAllHealth(NpgsqlConnection conn, Dictionary<int, List<CrHealthRow>> dict)
    {
        await using var cmd = new NpgsqlCommand(
            @"SELECT resident_id, record_date, general_health_score, nutrition_score, sleep_quality_score
              FROM lighthouse.health_wellbeing_records", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var rid = (int)reader.GetInt64(0);
            if (!dict.TryGetValue(rid, out var list))
            {
                list = new List<CrHealthRow>();
                dict[rid] = list;
            }
            list.Add(new CrHealthRow
            {
                RecordDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                GeneralHealthScore = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
                NutritionScore = reader.IsDBNull(3) ? 0 : Convert.ToDouble(reader.GetValue(3)),
                SleepQualityScore = reader.IsDBNull(4) ? 0 : Convert.ToDouble(reader.GetValue(4)),
            });
        }
    }

    private static async Task LoadAllEducation(NpgsqlConnection conn, Dictionary<int, List<CrEducationRow>> dict)
    {
        await using var cmd = new NpgsqlCommand(
            @"SELECT resident_id, record_date, attendance_rate, progress_percent
              FROM lighthouse.education_records", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var rid = (int)reader.GetInt64(0);
            if (!dict.TryGetValue(rid, out var list))
            {
                list = new List<CrEducationRow>();
                dict[rid] = list;
            }
            list.Add(new CrEducationRow
            {
                RecordDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                AttendanceRate = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
                ProgressPercent = reader.IsDBNull(3) ? 0 : Convert.ToDouble(reader.GetValue(3)),
            });
        }
    }

    private static async Task LoadAllSessions(NpgsqlConnection conn, Dictionary<int, List<CrSessionRow>> dict)
    {
        await using var cmd = new NpgsqlCommand(
            @"SELECT resident_id, session_date, emotional_state_end, progress_noted, concerns_flagged, referral_made
              FROM lighthouse.process_recordings", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var rid = (int)reader.GetInt64(0);
            if (!dict.TryGetValue(rid, out var list))
            {
                list = new List<CrSessionRow>();
                dict[rid] = list;
            }
            list.Add(new CrSessionRow
            {
                SessionDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                EmotionalStateEnd = reader.IsDBNull(2) ? "" : reader.GetString(2),
                ProgressNoted = !reader.IsDBNull(3) && reader.GetBoolean(3),
                ConcernsFlagged = !reader.IsDBNull(4) && reader.GetBoolean(4),
                ReferralMade = !reader.IsDBNull(5) && reader.GetBoolean(5),
            });
        }
    }

    private static async Task LoadAllVisits(NpgsqlConnection conn, Dictionary<int, List<CrVisitRow>> dict)
    {
        await using var cmd = new NpgsqlCommand(
            @"SELECT resident_id, visit_date, family_cooperation_level, visit_outcome, safety_concerns_noted
              FROM lighthouse.home_visitations", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var rid = (int)reader.GetInt64(0);
            if (!dict.TryGetValue(rid, out var list))
            {
                list = new List<CrVisitRow>();
                dict[rid] = list;
            }
            list.Add(new CrVisitRow
            {
                VisitDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                FamilyCooperationLevel = reader.IsDBNull(2) ? "" : reader.GetString(2),
                VisitOutcome = reader.IsDBNull(3) ? "" : reader.GetString(3),
                SafetyConcernsNoted = !reader.IsDBNull(4) && reader.GetBoolean(4),
            });
        }
    }

    private static async Task LoadAllIncidents(NpgsqlConnection conn, Dictionary<int, List<CrIncidentRow>> dict)
    {
        await using var cmd = new NpgsqlCommand(
            @"SELECT resident_id, incident_date, incident_type, severity, resolved
              FROM lighthouse.incident_reports", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var rid = (int)reader.GetInt64(0);
            if (!dict.TryGetValue(rid, out var list))
            {
                list = new List<CrIncidentRow>();
                dict[rid] = list;
            }
            list.Add(new CrIncidentRow
            {
                IncidentDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                IncidentType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                Severity = reader.IsDBNull(3) ? "" : reader.GetString(3),
                Resolved = !reader.IsDBNull(4) && reader.GetBoolean(4),
            });
        }
    }

    private static async Task LoadAllPlans(NpgsqlConnection conn, Dictionary<int, List<CrPlanRow>> dict)
    {
        await using var cmd = new NpgsqlCommand(
            @"SELECT resident_id, plan_category, status FROM lighthouse.intervention_plans", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var rid = (int)reader.GetInt64(0);
            if (!dict.TryGetValue(rid, out var list))
            {
                list = new List<CrPlanRow>();
                dict[rid] = list;
            }
            list.Add(new CrPlanRow
            {
                PlanCategory = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Status = reader.IsDBNull(2) ? "" : reader.GetString(2),
            });
        }
    }

    // Single-resident loaders for the detail endpoint
    private static async Task<List<CrHealthRow>> LoadHealth(NpgsqlConnection conn, int residentId)
    {
        var list = new List<CrHealthRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT record_date, general_health_score, nutrition_score, sleep_quality_score
              FROM lighthouse.health_wellbeing_records WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new CrHealthRow
            {
                RecordDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                GeneralHealthScore = reader.IsDBNull(1) ? 0 : Convert.ToDouble(reader.GetValue(1)),
                NutritionScore = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
                SleepQualityScore = reader.IsDBNull(3) ? 0 : Convert.ToDouble(reader.GetValue(3)),
            });
        }
        return list;
    }

    private static async Task<List<CrEducationRow>> LoadEducation(NpgsqlConnection conn, int residentId)
    {
        var list = new List<CrEducationRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT record_date, attendance_rate, progress_percent
              FROM lighthouse.education_records WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new CrEducationRow
            {
                RecordDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                AttendanceRate = reader.IsDBNull(1) ? 0 : Convert.ToDouble(reader.GetValue(1)),
                ProgressPercent = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
            });
        }
        return list;
    }

    private static async Task<List<CrSessionRow>> LoadSessions(NpgsqlConnection conn, int residentId)
    {
        var list = new List<CrSessionRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT session_date, emotional_state_end, progress_noted, concerns_flagged, referral_made
              FROM lighthouse.process_recordings WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new CrSessionRow
            {
                SessionDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                EmotionalStateEnd = reader.IsDBNull(1) ? "" : reader.GetString(1),
                ProgressNoted = !reader.IsDBNull(2) && reader.GetBoolean(2),
                ConcernsFlagged = !reader.IsDBNull(3) && reader.GetBoolean(3),
                ReferralMade = !reader.IsDBNull(4) && reader.GetBoolean(4),
            });
        }
        return list;
    }

    private static async Task<List<CrVisitRow>> LoadVisits(NpgsqlConnection conn, int residentId)
    {
        var list = new List<CrVisitRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT visit_date, family_cooperation_level, visit_outcome, safety_concerns_noted
              FROM lighthouse.home_visitations WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new CrVisitRow
            {
                VisitDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                FamilyCooperationLevel = reader.IsDBNull(1) ? "" : reader.GetString(1),
                VisitOutcome = reader.IsDBNull(2) ? "" : reader.GetString(2),
                SafetyConcernsNoted = !reader.IsDBNull(3) && reader.GetBoolean(3),
            });
        }
        return list;
    }

    private static async Task<List<CrIncidentRow>> LoadIncidents(NpgsqlConnection conn, int residentId)
    {
        var list = new List<CrIncidentRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT incident_date, incident_type, severity, resolved
              FROM lighthouse.incident_reports WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new CrIncidentRow
            {
                IncidentDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                IncidentType = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Severity = reader.IsDBNull(2) ? "" : reader.GetString(2),
                Resolved = !reader.IsDBNull(3) && reader.GetBoolean(3),
            });
        }
        return list;
    }

    private static async Task<List<CrPlanRow>> LoadPlans(NpgsqlConnection conn, int residentId)
    {
        var list = new List<CrPlanRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT plan_category, status FROM lighthouse.intervention_plans WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new CrPlanRow
            {
                PlanCategory = reader.IsDBNull(0) ? "" : reader.GetString(0),
                Status = reader.IsDBNull(1) ? "" : reader.GetString(1),
            });
        }
        return list;
    }

    // ================== String parsing helpers (duplicated from ResidentRiskController) ==================

    private static float ParseYearsMonths(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0f;
        var yearsMatch = Regex.Match(s, @"(\d+)\s*[Yy]ear");
        var monthsMatch = Regex.Match(s, @"(\d+)\s*[Mm]onth");
        int years = yearsMatch.Success ? int.Parse(yearsMatch.Groups[1].Value) : 0;
        int months = monthsMatch.Success ? int.Parse(monthsMatch.Groups[1].Value) : 0;
        return years + months / 12f;
    }

    private static float ParseLengthOfStayDays(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return 0f;
        var daysMatch = Regex.Match(s, @"(\d+)\s*[Dd]ay");
        if (daysMatch.Success) return float.Parse(daysMatch.Groups[1].Value);
        var yearsMatch = Regex.Match(s, @"(\d+)\s*[Yy]ear");
        var monthsMatch = Regex.Match(s, @"(\d+)\s*[Mm]onth");
        if (yearsMatch.Success || monthsMatch.Success)
        {
            int years = yearsMatch.Success ? int.Parse(yearsMatch.Groups[1].Value) : 0;
            int months = monthsMatch.Success ? int.Parse(monthsMatch.Groups[1].Value) : 0;
            return years * 365 + months * 30;
        }
        if (float.TryParse(s.Trim(), out var bare)) return bare;
        return 0f;
    }

    // ================== Row Types (duplicated; ResidentRiskController's are private) ==================

    private class CrResidentRow
    {
        public int ResidentId { get; init; }
        public string CaseControlNo { get; init; } = "";
        public string InternalCode { get; init; } = "";
        public int? SafehouseId { get; init; }
        public string SafehouseName { get; init; } = "";
        public string CaseStatus { get; init; } = "";
        public string CaseCategory { get; init; } = "";
        public string AgeUponAdmission { get; init; } = "";
        public string LengthOfStay { get; init; } = "";
        public string CurrentRiskLevel { get; init; } = "";
        public string ReintegrationStatus { get; init; } = "";
        public string AssignedSocialWorker { get; init; } = "";
        public DateTime? DateOfAdmission { get; init; }
        public DateTime? DateClosed { get; init; }
    }

    private class CrHealthRow
    {
        public DateTime RecordDate { get; init; }
        public double GeneralHealthScore { get; init; }
        public double NutritionScore { get; init; }
        public double SleepQualityScore { get; init; }
    }

    private class CrEducationRow
    {
        public DateTime RecordDate { get; init; }
        public double AttendanceRate { get; init; }
        public double ProgressPercent { get; init; }
    }

    private class CrSessionRow
    {
        public DateTime SessionDate { get; init; }
        public string EmotionalStateEnd { get; init; } = "";
        public bool ProgressNoted { get; init; }
        public bool ConcernsFlagged { get; init; }
        public bool ReferralMade { get; init; }
    }

    private class CrVisitRow
    {
        public DateTime VisitDate { get; init; }
        public string FamilyCooperationLevel { get; init; } = "";
        public string VisitOutcome { get; init; } = "";
        public bool SafetyConcernsNoted { get; init; }
    }

    private class CrIncidentRow
    {
        public DateTime IncidentDate { get; init; }
        public string IncidentType { get; init; } = "";
        public string Severity { get; init; } = "";
        public bool Resolved { get; init; }
    }

    private class CrPlanRow
    {
        public string PlanCategory { get; init; } = "";
        public string Status { get; init; } = "";
    }
}

// ================== DTOs ==================

public record CaseResolutionDto
{
    public int ResidentId { get; init; }
    public string CaseControlNo { get; init; } = "";
    public string InternalCode { get; init; } = "";
    public string CaseStatus { get; init; } = "";
    public string CaseCategory { get; init; } = "";
    public string CurrentRiskLevel { get; init; } = "";
    public string ReintegrationStatus { get; init; } = "";
    public int? SafehouseId { get; init; }
    public string SafehouseName { get; init; } = "";
    public string AssignedSocialWorker { get; init; } = "";
    public string? DateOfAdmission { get; init; }
    public string? DateClosed { get; init; }

    public double PredictedResolutionProbability { get; init; }
    public string PredictedResolutionBand { get; init; } = "";
    public bool ModelAgreesWithLabel { get; init; }

    public float AgeAtIntake { get; init; }
    public float LengthOfStayDays { get; init; }
    public int SessionCount { get; init; }
    public double AchievedRate { get; init; }
    public bool HasSafetyPlan { get; init; }
    public int PlanCount { get; init; }
    public int IncidentCount { get; init; }

    public List<string> TopResolutionFactors { get; init; } = new();
}

public record DetailedCaseResolutionDto : CaseResolutionDto
{
    // Reuses CategoryStatsDto and child stat records from ResidentRiskController.cs
    public CategoryStatsDto CategoryStats { get; init; } = new();
    public List<CaseResolutionFeatureDto> FeatureContributions { get; init; } = new();
}

public record CaseResolutionFeatureDto
{
    public string Name { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public double Value { get; init; }
    public double Coefficient { get; init; }
    public string Direction { get; init; } = "";
}
