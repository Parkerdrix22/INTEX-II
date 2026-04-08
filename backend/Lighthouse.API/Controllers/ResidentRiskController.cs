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
[Route("api/resident-risk")]
[Authorize(Roles = "Admin,Staff")]
public class ResidentRiskController : ControllerBase
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
                "pipeline_01_resident_risk_rf.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "is455", "ml-pipelines", "models",
                "pipeline_01_resident_risk_rf.onnx"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "is455", "ml-pipelines", "models",
                "pipeline_01_resident_risk_rf.onnx"),
        ];

        foreach (var p in searchPaths)
        {
            var resolved = Path.GetFullPath(p);
            if (System.IO.File.Exists(resolved)) return resolved;
        }

        throw new FileNotFoundException(
            $"ONNX model not found. Searched: {string.Join(", ", searchPaths.Select(Path.GetFullPath))}");
    }

    // Feature names in exact ONNX input order (46 features)
    private static readonly string[] FeatureNames =
    [
        "age_at_intake", "length_of_stay_days", "initial_risk_ordinal", "reintegration_ordinal",
        "sub_cat_orphaned", "sub_cat_trafficked", "sub_cat_child_labor", "sub_cat_physical_abuse",
        "sub_cat_sexual_abuse", "sub_cat_osaec", "sub_cat_cicl", "sub_cat_at_risk",
        "sub_cat_street_child", "sub_cat_child_with_hiv",
        "mean_health_score", "latest_health_score", "health_trend",
        "mean_nutrition_score", "mean_sleep_quality_score", "health_record_count",
        "mean_attendance_rate", "mean_progress_percent", "latest_progress_percent", "ed_record_count",
        "session_count", "concerns_flagged_rate", "progress_noted_rate", "referral_made_rate",
        "negative_endstate_rate",
        "visitation_count", "safety_concerns_rate", "uncooperative_family_rate", "favorable_outcome_rate",
        "incident_count", "high_severity_count", "self_harm_count", "runaway_count", "unresolved_count",
        "plan_count", "achieved_rate", "on_hold_rate", "has_safety_plan",
        "case_cat_Abandoned", "case_cat_Foundling", "case_cat_Neglected", "case_cat_Surrendered"
    ];

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard([FromServices] AppDbContext dbContext)
    {
        try
        {
            var connectionString = dbContext.Database.GetConnectionString()!;

            var residents = new List<ResidentRow>();
            var healthByResident = new Dictionary<int, List<HealthRow>>();
            var educationByResident = new Dictionary<int, List<EducationRow>>();
            var sessionsByResident = new Dictionary<int, List<SessionRow>>();
            var visitsByResident = new Dictionary<int, List<VisitRow>>();
            var incidentsByResident = new Dictionary<int, List<IncidentRow>>();
            var plansByResident = new Dictionary<int, List<PlanRow>>();

            await using (var conn = new NpgsqlConnection(connectionString))
            {
                await conn.OpenAsync();

                // Residents (with safehouse name)
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT r.resident_id, r.case_control_no, r.internal_code, r.safehouse_id,
                             COALESCE(s.name, '') AS safehouse_name,
                             r.case_status, r.case_category,
                             r.sub_cat_orphaned, r.sub_cat_trafficked, r.sub_cat_child_labor,
                             r.sub_cat_physical_abuse, r.sub_cat_sexual_abuse, r.sub_cat_osaec,
                             r.sub_cat_cicl, r.sub_cat_at_risk, r.sub_cat_street_child, r.sub_cat_child_with_hiv,
                             r.age_upon_admission, r.length_of_stay,
                             r.initial_risk_level, r.current_risk_level, r.reintegration_status,
                             r.assigned_social_worker, r.date_of_admission, r.date_closed
                      FROM lighthouse.residents r
                      LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        residents.Add(new ResidentRow
                        {
                            ResidentId = (int)reader.GetInt64(0),
                            CaseControlNo = reader.IsDBNull(1) ? "" : reader.GetString(1),
                            InternalCode = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            SafehouseId = reader.IsDBNull(3) ? (int?)null : (int)reader.GetInt64(3),
                            SafehouseName = reader.IsDBNull(4) ? "" : reader.GetString(4),
                            CaseStatus = reader.IsDBNull(5) ? "" : reader.GetString(5),
                            CaseCategory = reader.IsDBNull(6) ? "" : reader.GetString(6),
                            SubCatOrphaned = !reader.IsDBNull(7) && reader.GetBoolean(7),
                            SubCatTrafficked = !reader.IsDBNull(8) && reader.GetBoolean(8),
                            SubCatChildLabor = !reader.IsDBNull(9) && reader.GetBoolean(9),
                            SubCatPhysicalAbuse = !reader.IsDBNull(10) && reader.GetBoolean(10),
                            SubCatSexualAbuse = !reader.IsDBNull(11) && reader.GetBoolean(11),
                            SubCatOsaec = !reader.IsDBNull(12) && reader.GetBoolean(12),
                            SubCatCicl = !reader.IsDBNull(13) && reader.GetBoolean(13),
                            SubCatAtRisk = !reader.IsDBNull(14) && reader.GetBoolean(14),
                            SubCatStreetChild = !reader.IsDBNull(15) && reader.GetBoolean(15),
                            SubCatChildWithHiv = !reader.IsDBNull(16) && reader.GetBoolean(16),
                            AgeUponAdmission = reader.IsDBNull(17) ? "" : reader.GetString(17),
                            LengthOfStay = reader.IsDBNull(18) ? "" : reader.GetString(18),
                            InitialRiskLevel = reader.IsDBNull(19) ? "" : reader.GetString(19),
                            CurrentRiskLevel = reader.IsDBNull(20) ? "" : reader.GetString(20),
                            ReintegrationStatus = reader.IsDBNull(21) ? "" : reader.GetString(21),
                            AssignedSocialWorker = reader.IsDBNull(22) ? "" : reader.GetString(22),
                            DateOfAdmission = reader.IsDBNull(23) ? (DateTime?)null : reader.GetDateTime(23),
                            DateClosed = reader.IsDBNull(24) ? (DateTime?)null : reader.GetDateTime(24),
                        });
                    }
                }

                // Health
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT resident_id, record_date, general_health_score, nutrition_score, sleep_quality_score
                      FROM lighthouse.health_wellbeing_records", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var rid = (int)reader.GetInt64(0);
                        if (!healthByResident.TryGetValue(rid, out var list))
                        {
                            list = new List<HealthRow>();
                            healthByResident[rid] = list;
                        }
                        list.Add(new HealthRow
                        {
                            RecordDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                            GeneralHealthScore = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
                            NutritionScore = reader.IsDBNull(3) ? 0 : Convert.ToDouble(reader.GetValue(3)),
                            SleepQualityScore = reader.IsDBNull(4) ? 0 : Convert.ToDouble(reader.GetValue(4)),
                        });
                    }
                }

                // Education
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT resident_id, record_date, attendance_rate, progress_percent
                      FROM lighthouse.education_records", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var rid = (int)reader.GetInt64(0);
                        if (!educationByResident.TryGetValue(rid, out var list))
                        {
                            list = new List<EducationRow>();
                            educationByResident[rid] = list;
                        }
                        list.Add(new EducationRow
                        {
                            RecordDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                            AttendanceRate = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
                            ProgressPercent = reader.IsDBNull(3) ? 0 : Convert.ToDouble(reader.GetValue(3)),
                        });
                    }
                }

                // Process recordings (sessions)
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT resident_id, session_date, emotional_state_end, progress_noted, concerns_flagged, referral_made
                      FROM lighthouse.process_recordings", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var rid = (int)reader.GetInt64(0);
                        if (!sessionsByResident.TryGetValue(rid, out var list))
                        {
                            list = new List<SessionRow>();
                            sessionsByResident[rid] = list;
                        }
                        list.Add(new SessionRow
                        {
                            SessionDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                            EmotionalStateEnd = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            ProgressNoted = !reader.IsDBNull(3) && reader.GetBoolean(3),
                            ConcernsFlagged = !reader.IsDBNull(4) && reader.GetBoolean(4),
                            ReferralMade = !reader.IsDBNull(5) && reader.GetBoolean(5),
                        });
                    }
                }

                // Home visitations
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT resident_id, visit_date, family_cooperation_level, visit_outcome, safety_concerns_noted
                      FROM lighthouse.home_visitations", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var rid = (int)reader.GetInt64(0);
                        if (!visitsByResident.TryGetValue(rid, out var list))
                        {
                            list = new List<VisitRow>();
                            visitsByResident[rid] = list;
                        }
                        list.Add(new VisitRow
                        {
                            VisitDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                            FamilyCooperationLevel = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            VisitOutcome = reader.IsDBNull(3) ? "" : reader.GetString(3),
                            SafetyConcernsNoted = !reader.IsDBNull(4) && reader.GetBoolean(4),
                        });
                    }
                }

                // Incident reports
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT resident_id, incident_date, incident_type, severity, resolved
                      FROM lighthouse.incident_reports", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var rid = (int)reader.GetInt64(0);
                        if (!incidentsByResident.TryGetValue(rid, out var list))
                        {
                            list = new List<IncidentRow>();
                            incidentsByResident[rid] = list;
                        }
                        list.Add(new IncidentRow
                        {
                            IncidentDate = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1),
                            IncidentType = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            Severity = reader.IsDBNull(3) ? "" : reader.GetString(3),
                            Resolved = !reader.IsDBNull(4) && reader.GetBoolean(4),
                        });
                    }
                }

                // Intervention plans
                await using (var cmd = new NpgsqlCommand(
                    @"SELECT resident_id, plan_category, status
                      FROM lighthouse.intervention_plans", conn))
                await using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var rid = (int)reader.GetInt64(0);
                        if (!plansByResident.TryGetValue(rid, out var list))
                        {
                            list = new List<PlanRow>();
                            plansByResident[rid] = list;
                        }
                        list.Add(new PlanRow
                        {
                            PlanCategory = reader.IsDBNull(1) ? "" : reader.GetString(1),
                            Status = reader.IsDBNull(2) ? "" : reader.GetString(2),
                        });
                    }
                }
            }

            var results = new List<ResidentRiskDto>();
            foreach (var r in residents)
            {
                var agg = ComputeAggregates(r,
                    healthByResident.GetValueOrDefault(r.ResidentId),
                    educationByResident.GetValueOrDefault(r.ResidentId),
                    sessionsByResident.GetValueOrDefault(r.ResidentId),
                    visitsByResident.GetValueOrDefault(r.ResidentId),
                    incidentsByResident.GetValueOrDefault(r.ResidentId),
                    plansByResident.GetValueOrDefault(r.ResidentId));

                var (pHigh, predictedClass) = RunInference(agg.Features);
                var dto = BuildDto(r, agg, pHigh, predictedClass);
                results.Add(dto);
            }

            results = results.OrderByDescending(d => d.PredictedHighRiskProbability).ToList();
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

            ResidentRow? r = null;
            List<HealthRow>? health = null;
            List<EducationRow>? education = null;
            List<SessionRow>? sessions = null;
            List<VisitRow>? visits = null;
            List<IncidentRow>? incidents = null;
            List<PlanRow>? plans = null;

            await using (var conn = new NpgsqlConnection(connectionString))
            {
                await conn.OpenAsync();

                await using (var cmd = new NpgsqlCommand(
                    @"SELECT r.resident_id, r.case_control_no, r.internal_code, r.safehouse_id,
                             COALESCE(s.name, '') AS safehouse_name,
                             r.case_status, r.case_category,
                             r.sub_cat_orphaned, r.sub_cat_trafficked, r.sub_cat_child_labor,
                             r.sub_cat_physical_abuse, r.sub_cat_sexual_abuse, r.sub_cat_osaec,
                             r.sub_cat_cicl, r.sub_cat_at_risk, r.sub_cat_street_child, r.sub_cat_child_with_hiv,
                             r.age_upon_admission, r.length_of_stay,
                             r.initial_risk_level, r.current_risk_level, r.reintegration_status,
                             r.assigned_social_worker, r.date_of_admission, r.date_closed
                      FROM lighthouse.residents r
                      LEFT JOIN lighthouse.safehouses s ON s.safehouse_id = r.safehouse_id
                      WHERE r.resident_id = @rid LIMIT 1", conn))
                {
                    cmd.Parameters.AddWithValue("rid", (long)residentId);
                    await using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        r = new ResidentRow
                        {
                            ResidentId = (int)reader.GetInt64(0),
                            CaseControlNo = reader.IsDBNull(1) ? "" : reader.GetString(1),
                            InternalCode = reader.IsDBNull(2) ? "" : reader.GetString(2),
                            SafehouseId = reader.IsDBNull(3) ? (int?)null : (int)reader.GetInt64(3),
                            SafehouseName = reader.IsDBNull(4) ? "" : reader.GetString(4),
                            CaseStatus = reader.IsDBNull(5) ? "" : reader.GetString(5),
                            CaseCategory = reader.IsDBNull(6) ? "" : reader.GetString(6),
                            SubCatOrphaned = !reader.IsDBNull(7) && reader.GetBoolean(7),
                            SubCatTrafficked = !reader.IsDBNull(8) && reader.GetBoolean(8),
                            SubCatChildLabor = !reader.IsDBNull(9) && reader.GetBoolean(9),
                            SubCatPhysicalAbuse = !reader.IsDBNull(10) && reader.GetBoolean(10),
                            SubCatSexualAbuse = !reader.IsDBNull(11) && reader.GetBoolean(11),
                            SubCatOsaec = !reader.IsDBNull(12) && reader.GetBoolean(12),
                            SubCatCicl = !reader.IsDBNull(13) && reader.GetBoolean(13),
                            SubCatAtRisk = !reader.IsDBNull(14) && reader.GetBoolean(14),
                            SubCatStreetChild = !reader.IsDBNull(15) && reader.GetBoolean(15),
                            SubCatChildWithHiv = !reader.IsDBNull(16) && reader.GetBoolean(16),
                            AgeUponAdmission = reader.IsDBNull(17) ? "" : reader.GetString(17),
                            LengthOfStay = reader.IsDBNull(18) ? "" : reader.GetString(18),
                            InitialRiskLevel = reader.IsDBNull(19) ? "" : reader.GetString(19),
                            CurrentRiskLevel = reader.IsDBNull(20) ? "" : reader.GetString(20),
                            ReintegrationStatus = reader.IsDBNull(21) ? "" : reader.GetString(21),
                            AssignedSocialWorker = reader.IsDBNull(22) ? "" : reader.GetString(22),
                            DateOfAdmission = reader.IsDBNull(23) ? (DateTime?)null : reader.GetDateTime(23),
                            DateClosed = reader.IsDBNull(24) ? (DateTime?)null : reader.GetDateTime(24),
                        };
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

            var agg = ComputeAggregates(r, health, education, sessions, visits, incidents, plans);
            var (pHigh, predictedClass) = RunInference(agg.Features);
            var baseDto = BuildDto(r, agg, pHigh, predictedClass);

            var detail = new DetailedResidentRiskDto
            {
                ResidentId = baseDto.ResidentId,
                CaseControlNo = baseDto.CaseControlNo,
                InternalCode = baseDto.InternalCode,
                CaseStatus = baseDto.CaseStatus,
                CaseCategory = baseDto.CaseCategory,
                CurrentRiskLevel = baseDto.CurrentRiskLevel,
                InitialRiskLevel = baseDto.InitialRiskLevel,
                ReintegrationStatus = baseDto.ReintegrationStatus,
                SafehouseId = baseDto.SafehouseId,
                SafehouseName = baseDto.SafehouseName,
                AssignedSocialWorker = baseDto.AssignedSocialWorker,
                DateOfAdmission = baseDto.DateOfAdmission,
                DateClosed = baseDto.DateClosed,
                PredictedHighRiskProbability = baseDto.PredictedHighRiskProbability,
                PredictedRiskBand = baseDto.PredictedRiskBand,
                ModelAgreesWithLabel = baseDto.ModelAgreesWithLabel,
                AgeAtIntake = baseDto.AgeAtIntake,
                LengthOfStayDays = baseDto.LengthOfStayDays,
                IncidentCount = baseDto.IncidentCount,
                HighSeverityIncidents = baseDto.HighSeverityIncidents,
                SelfHarmIncidents = baseDto.SelfHarmIncidents,
                RunawayIncidents = baseDto.RunawayIncidents,
                UnresolvedIncidents = baseDto.UnresolvedIncidents,
                MeanHealthScore = baseDto.MeanHealthScore,
                NegativeEndStateRate = baseDto.NegativeEndStateRate,
                SafetyConcernsRate = baseDto.SafetyConcernsRate,
                SessionCount = baseDto.SessionCount,
                TopRiskFactors = baseDto.TopRiskFactors,
                CategoryStats = new CategoryStatsDto
                {
                    Incidents = new IncidentStats
                    {
                        Count = (int)agg.Features[33],
                        HighSeverity = (int)agg.Features[34],
                        SelfHarm = (int)agg.Features[35],
                        Runaway = (int)agg.Features[36],
                        Unresolved = (int)agg.Features[37],
                    },
                    Health = new HealthStats
                    {
                        MeanScore = agg.Features[14],
                        LatestScore = agg.Features[15],
                        Trend = agg.Features[16],
                        MeanNutrition = agg.Features[17],
                        MeanSleep = agg.Features[18],
                        RecordCount = (int)agg.Features[19],
                    },
                    Education = new EducationStats
                    {
                        MeanAttendance = agg.Features[20],
                        MeanProgress = agg.Features[21],
                        LatestProgress = agg.Features[22],
                        RecordCount = (int)agg.Features[23],
                    },
                    Sessions = new SessionStats
                    {
                        Count = (int)agg.Features[24],
                        ConcernsFlaggedRate = agg.Features[25],
                        ProgressNotedRate = agg.Features[26],
                        ReferralMadeRate = agg.Features[27],
                        NegativeEndStateRate = agg.Features[28],
                    },
                    HomeVisits = new HomeVisitStats
                    {
                        Count = (int)agg.Features[29],
                        SafetyConcernsRate = agg.Features[30],
                        UncooperativeFamilyRate = agg.Features[31],
                        FavorableOutcomeRate = agg.Features[32],
                    },
                    Interventions = new InterventionStats
                    {
                        Count = (int)agg.Features[38],
                        AchievedRate = agg.Features[39],
                        OnHoldRate = agg.Features[40],
                        HasSafetyPlan = agg.Features[41] >= 0.5f,
                    },
                },
                FeatureBreakdown = BuildFeatureBreakdown(agg.Features),
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
        int nFeatures = 46;
        int nPositives = 0;
        int nSamples = 0;

        try
        {
            var metricsPath = Path.Combine(
                FindModelFile().Replace("pipeline_01_resident_risk_rf.onnx", ""),
                "training_metrics.json");
            if (System.IO.File.Exists(metricsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(metricsPath);
                var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("pipeline_01_resident_risk", out var p1))
                {
                    if (p1.TryGetProperty("metrics", out var metrics))
                    {
                        if (metrics.TryGetProperty("cv_roc_auc_mean", out var rocVal))
                            rocAuc = rocVal.GetDouble();
                        if (metrics.TryGetProperty("n_samples", out var nsVal))
                            nSamples = nsVal.GetInt32();
                        if (metrics.TryGetProperty("n_positives", out var npVal))
                            nPositives = npVal.GetInt32();
                    }
                    if (p1.TryGetProperty("trained_at", out var ta))
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
            residentCountTrainedOn = nSamples,
            rocAuc = Math.Round(rocAuc, 4),
            trainedAt,
            modelName = "Random Forest Classifier",
            nFeatures,
            nPositives,
        });
    }

    // ================== Helpers ==================

    private static async Task<List<HealthRow>> LoadHealth(NpgsqlConnection conn, int residentId)
    {
        var list = new List<HealthRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT record_date, general_health_score, nutrition_score, sleep_quality_score
              FROM lighthouse.health_wellbeing_records WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new HealthRow
            {
                RecordDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                GeneralHealthScore = reader.IsDBNull(1) ? 0 : Convert.ToDouble(reader.GetValue(1)),
                NutritionScore = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
                SleepQualityScore = reader.IsDBNull(3) ? 0 : Convert.ToDouble(reader.GetValue(3)),
            });
        }
        return list;
    }

    private static async Task<List<EducationRow>> LoadEducation(NpgsqlConnection conn, int residentId)
    {
        var list = new List<EducationRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT record_date, attendance_rate, progress_percent
              FROM lighthouse.education_records WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new EducationRow
            {
                RecordDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                AttendanceRate = reader.IsDBNull(1) ? 0 : Convert.ToDouble(reader.GetValue(1)),
                ProgressPercent = reader.IsDBNull(2) ? 0 : Convert.ToDouble(reader.GetValue(2)),
            });
        }
        return list;
    }

    private static async Task<List<SessionRow>> LoadSessions(NpgsqlConnection conn, int residentId)
    {
        var list = new List<SessionRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT session_date, emotional_state_end, progress_noted, concerns_flagged, referral_made
              FROM lighthouse.process_recordings WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new SessionRow
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

    private static async Task<List<VisitRow>> LoadVisits(NpgsqlConnection conn, int residentId)
    {
        var list = new List<VisitRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT visit_date, family_cooperation_level, visit_outcome, safety_concerns_noted
              FROM lighthouse.home_visitations WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new VisitRow
            {
                VisitDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                FamilyCooperationLevel = reader.IsDBNull(1) ? "" : reader.GetString(1),
                VisitOutcome = reader.IsDBNull(2) ? "" : reader.GetString(2),
                SafetyConcernsNoted = !reader.IsDBNull(3) && reader.GetBoolean(3),
            });
        }
        return list;
    }

    private static async Task<List<IncidentRow>> LoadIncidents(NpgsqlConnection conn, int residentId)
    {
        var list = new List<IncidentRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT incident_date, incident_type, severity, resolved
              FROM lighthouse.incident_reports WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new IncidentRow
            {
                IncidentDate = reader.IsDBNull(0) ? DateTime.MinValue : reader.GetDateTime(0),
                IncidentType = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Severity = reader.IsDBNull(2) ? "" : reader.GetString(2),
                Resolved = !reader.IsDBNull(3) && reader.GetBoolean(3),
            });
        }
        return list;
    }

    private static async Task<List<PlanRow>> LoadPlans(NpgsqlConnection conn, int residentId)
    {
        var list = new List<PlanRow>();
        await using var cmd = new NpgsqlCommand(
            @"SELECT plan_category, status FROM lighthouse.intervention_plans WHERE resident_id = @rid", conn);
        cmd.Parameters.AddWithValue("rid", (long)residentId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new PlanRow
            {
                PlanCategory = reader.IsDBNull(0) ? "" : reader.GetString(0),
                Status = reader.IsDBNull(1) ? "" : reader.GetString(1),
            });
        }
        return list;
    }

    private record AggregateResult(float[] Features);

    private static AggregateResult ComputeAggregates(
        ResidentRow r,
        List<HealthRow>? health,
        List<EducationRow>? education,
        List<SessionRow>? sessions,
        List<VisitRow>? visits,
        List<IncidentRow>? incidents,
        List<PlanRow>? plans)
    {
        var f = new float[46];

        // 0: age_at_intake
        f[0] = ParseYearsMonths(r.AgeUponAdmission);
        // 1: length_of_stay_days
        f[1] = ParseLengthOfStayDays(r.LengthOfStay);
        // 2: initial_risk_ordinal
        f[2] = RiskOrdinal(r.InitialRiskLevel);
        // 3: reintegration_ordinal
        f[3] = ReintegrationOrdinal(r.ReintegrationStatus);

        // 4-13: sub_cat booleans
        f[4] = r.SubCatOrphaned ? 1f : 0f;
        f[5] = r.SubCatTrafficked ? 1f : 0f;
        f[6] = r.SubCatChildLabor ? 1f : 0f;
        f[7] = r.SubCatPhysicalAbuse ? 1f : 0f;
        f[8] = r.SubCatSexualAbuse ? 1f : 0f;
        f[9] = r.SubCatOsaec ? 1f : 0f;
        f[10] = r.SubCatCicl ? 1f : 0f;
        f[11] = r.SubCatAtRisk ? 1f : 0f;
        f[12] = r.SubCatStreetChild ? 1f : 0f;
        f[13] = r.SubCatChildWithHiv ? 1f : 0f;

        // 14-19: health
        if (health != null && health.Count > 0)
        {
            f[14] = (float)health.Average(h => h.GeneralHealthScore);
            var latest = health.OrderByDescending(h => h.RecordDate).First();
            f[15] = (float)latest.GeneralHealthScore;
            f[16] = (float)ComputeTrend(health);
            f[17] = (float)health.Average(h => h.NutritionScore);
            f[18] = (float)health.Average(h => h.SleepQualityScore);
            f[19] = health.Count;
        }

        // 20-23: education
        if (education != null && education.Count > 0)
        {
            f[20] = (float)education.Average(e => e.AttendanceRate);
            f[21] = (float)education.Average(e => e.ProgressPercent);
            var latestEd = education.OrderByDescending(e => e.RecordDate).First();
            f[22] = (float)latestEd.ProgressPercent;
            f[23] = education.Count;
        }

        // 24-28: sessions
        if (sessions != null && sessions.Count > 0)
        {
            int n = sessions.Count;
            f[24] = n;
            f[25] = (float)sessions.Count(s => s.ConcernsFlagged) / n;
            f[26] = (float)sessions.Count(s => s.ProgressNoted) / n;
            f[27] = (float)sessions.Count(s => s.ReferralMade) / n;
            var negativeStates = new HashSet<string> { "Sad", "Anxious", "Withdrawn", "Fearful" };
            f[28] = (float)sessions.Count(s => negativeStates.Contains(s.EmotionalStateEnd)) / n;
        }

        // 29-32: home visits
        if (visits != null && visits.Count > 0)
        {
            int n = visits.Count;
            f[29] = n;
            f[30] = (float)visits.Count(v => v.SafetyConcernsNoted) / n;
            f[31] = (float)visits.Count(v => v.FamilyCooperationLevel == "Uncooperative") / n;
            f[32] = (float)visits.Count(v => v.VisitOutcome == "Favorable") / n;
        }

        // 33-37: incidents
        if (incidents != null && incidents.Count > 0)
        {
            f[33] = incidents.Count;
            f[34] = incidents.Count(i => i.Severity == "High" || i.Severity == "Critical");
            f[35] = incidents.Count(i => Regex.IsMatch(i.IncidentType ?? "", "[Ss]elf"));
            f[36] = incidents.Count(i => Regex.IsMatch(i.IncidentType ?? "", "[Rr]un|[Rr]unaway"));
            f[37] = incidents.Count(i => !i.Resolved);
        }

        // 38-41: intervention plans
        if (plans != null && plans.Count > 0)
        {
            int n = plans.Count;
            f[38] = n;
            f[39] = (float)plans.Count(p => p.Status == "Achieved" || p.Status == "Completed") / n;
            f[40] = (float)plans.Count(p => p.Status == "On Hold") / n;
            f[41] = plans.Any(p => Regex.IsMatch(p.PlanCategory ?? "", "[Ss]afety")) ? 1f : 0f;
        }

        // 42-45: case_category one-hot
        f[42] = r.CaseCategory == "Abandoned" ? 1f : 0f;
        f[43] = r.CaseCategory == "Foundling" ? 1f : 0f;
        f[44] = r.CaseCategory == "Neglected" ? 1f : 0f;
        f[45] = r.CaseCategory == "Surrendered" ? 1f : 0f;

        return new AggregateResult(f);
    }

    private static double ComputeTrend(List<HealthRow> health)
    {
        if (health.Count < 2) return 0.0;
        var epoch = new DateTime(1970, 1, 1);
        var pts = health
            .Where(h => h.RecordDate != DateTime.MinValue)
            .Select(h => (x: (h.RecordDate - epoch).TotalDays, y: h.GeneralHealthScore))
            .ToList();
        if (pts.Count < 2) return 0.0;
        int n = pts.Count;
        double sumX = pts.Sum(p => p.x);
        double sumY = pts.Sum(p => p.y);
        double sumXY = pts.Sum(p => p.x * p.y);
        double sumX2 = pts.Sum(p => p.x * p.x);
        double denom = n * sumX2 - sumX * sumX;
        if (denom == 0) return 0.0;
        return (n * sumXY - sumX * sumY) / denom;
    }

    private static (float pHigh, long predictedClass) RunInference(float[] features)
    {
        // Pipeline 1 model uses 46 separately-named float inputs (each shape [1, 1]),
        // not a single combined float_input tensor. Mirror the SocialMediaPlanner /
        // DonorChurn pattern.
        var inputs = new List<NamedOnnxValue>(FeatureNames.Length);
        for (var i = 0; i < FeatureNames.Length; i++)
        {
            var t = new DenseTensor<float>(new[] { features[i] }, new[] { 1, 1 });
            inputs.Add(NamedOnnxValue.CreateFromTensor(FeatureNames[i], t));
        }

        using var results = Session.Value.Run(inputs);

        // Output 1: output_label (int64 tensor of shape [N])
        var labelTensor = results.First(r => r.Name == "output_label").AsTensor<long>();
        long predictedClass = labelTensor.GetValue(0);

        // Output 2: output_probability is seq(map(int64, float)) — same format as donor churn
        var probResult = results.First(r => r.Name == "output_probability");
        var probMaps = probResult.AsEnumerable<DisposableNamedOnnxValue>().ToList();
        var map = probMaps[0].AsEnumerable<KeyValuePair<long, float>>()
            .ToDictionary(kv => kv.Key, kv => kv.Value);
        float pHighCritical = map.TryGetValue(1L, out var v) ? v : 0f;

        return (pHighCritical, predictedClass);
    }

    private static ResidentRiskDto BuildDto(ResidentRow r, AggregateResult agg, float pHigh, long predictedClass)
    {
        var f = agg.Features;
        var humanFlag = r.CurrentRiskLevel == "High" || r.CurrentRiskLevel == "Critical";
        var modelFlag = pHigh >= 0.5f;
        var band = pHigh >= 0.75f ? "Critical" : pHigh >= 0.5f ? "High" : pHigh >= 0.25f ? "Medium" : "Low";

        return new ResidentRiskDto
        {
            ResidentId = r.ResidentId,
            CaseControlNo = r.CaseControlNo,
            InternalCode = r.InternalCode,
            CaseStatus = r.CaseStatus,
            CaseCategory = r.CaseCategory,
            CurrentRiskLevel = r.CurrentRiskLevel,
            InitialRiskLevel = r.InitialRiskLevel,
            ReintegrationStatus = r.ReintegrationStatus,
            SafehouseId = r.SafehouseId,
            SafehouseName = r.SafehouseName,
            AssignedSocialWorker = r.AssignedSocialWorker,
            DateOfAdmission = r.DateOfAdmission?.ToString("yyyy-MM-dd"),
            DateClosed = r.DateClosed?.ToString("yyyy-MM-dd"),
            PredictedHighRiskProbability = Math.Round((double)pHigh, 4),
            PredictedRiskBand = band,
            ModelAgreesWithLabel = humanFlag == modelFlag,
            AgeAtIntake = f[0],
            LengthOfStayDays = f[1],
            IncidentCount = (int)f[33],
            HighSeverityIncidents = (int)f[34],
            SelfHarmIncidents = (int)f[35],
            RunawayIncidents = (int)f[36],
            UnresolvedIncidents = (int)f[37],
            MeanHealthScore = Math.Round((double)f[14], 3),
            NegativeEndStateRate = Math.Round((double)f[28], 3),
            SafetyConcernsRate = Math.Round((double)f[30], 3),
            SessionCount = (int)f[24],
            TopRiskFactors = ComputeTopRiskFactors(f),
        };
    }

    private static List<string> ComputeTopRiskFactors(float[] f)
    {
        var candidates = new List<(string display, double score)>
        {
            ("Self-harm incidents", f[35] / 1.0),
            ("Runaway attempts", f[36] / 1.0),
            ("Severe incidents", f[34] / 1.0),
            ("Unresolved incidents", f[37] / 1.0),
            ("Sessions ending negatively", f[28] / 0.3),
            ("Safety concerns at home", f[30] / 0.3),
            ("Family non-cooperation", f[31] / 0.3),
            ("Concerns flagged", f[25] / 0.3),
        };
        if (f[14] > 0 && f[14] < 3) candidates.Add(("Low health scores", (3 - f[14]) / 1.0));

        return candidates
            .Where(c => c.score > 0)
            .OrderByDescending(c => c.score)
            .Take(3)
            .Select(c => c.display)
            .ToList();
    }

    private static List<FeatureValueDto> BuildFeatureBreakdown(float[] features)
    {
        var categories = new[]
        {
            "demographics", "demographics", "demographics", "demographics",
            "subcategory","subcategory","subcategory","subcategory","subcategory","subcategory",
            "subcategory","subcategory","subcategory","subcategory",
            "health","health","health","health","health","health",
            "education","education","education","education",
            "sessions","sessions","sessions","sessions","sessions",
            "homeVisits","homeVisits","homeVisits","homeVisits",
            "incidents","incidents","incidents","incidents","incidents",
            "interventions","interventions","interventions","interventions",
            "caseCategory","caseCategory","caseCategory","caseCategory",
        };
        var displays = new[]
        {
            "Age at intake","Length of stay (days)","Initial risk (ordinal)","Reintegration (ordinal)",
            "Orphaned","Trafficked","Child labor","Physical abuse","Sexual abuse","OSAEC","CICL","At risk","Street child","Child with HIV",
            "Mean health score","Latest health score","Health trend","Mean nutrition","Mean sleep quality","Health record count",
            "Mean attendance","Mean progress %","Latest progress %","Education record count",
            "Session count","Concerns flagged rate","Progress noted rate","Referral made rate","Negative end-state rate",
            "Visitation count","Safety concerns rate","Uncooperative family rate","Favorable outcome rate",
            "Incident count","High severity count","Self-harm count","Runaway count","Unresolved count",
            "Plan count","Achieved rate","On hold rate","Has safety plan",
            "Case: Abandoned","Case: Foundling","Case: Neglected","Case: Surrendered",
        };

        var list = new List<FeatureValueDto>(46);
        for (int i = 0; i < 46; i++)
        {
            list.Add(new FeatureValueDto
            {
                Name = FeatureNames[i],
                DisplayName = displays[i],
                Value = Math.Round((double)features[i], 4),
                Category = categories[i],
            });
        }
        return list;
    }

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

    private static float RiskOrdinal(string? s) => s switch
    {
        "Low" => 0f,
        "Medium" => 1f,
        "High" => 2f,
        "Critical" => 3f,
        _ => 0f,
    };

    private static float ReintegrationOrdinal(string? s) => s switch
    {
        "Not Started" => 0f,
        "On Hold" => 1f,
        "In Progress" => 2f,
        "Completed" => 3f,
        _ => 0f,
    };

    // ================== Row Types ==================

    private class ResidentRow
    {
        public int ResidentId { get; init; }
        public string CaseControlNo { get; init; } = "";
        public string InternalCode { get; init; } = "";
        public int? SafehouseId { get; init; }
        public string SafehouseName { get; init; } = "";
        public string CaseStatus { get; init; } = "";
        public string CaseCategory { get; init; } = "";
        public bool SubCatOrphaned { get; init; }
        public bool SubCatTrafficked { get; init; }
        public bool SubCatChildLabor { get; init; }
        public bool SubCatPhysicalAbuse { get; init; }
        public bool SubCatSexualAbuse { get; init; }
        public bool SubCatOsaec { get; init; }
        public bool SubCatCicl { get; init; }
        public bool SubCatAtRisk { get; init; }
        public bool SubCatStreetChild { get; init; }
        public bool SubCatChildWithHiv { get; init; }
        public string AgeUponAdmission { get; init; } = "";
        public string LengthOfStay { get; init; } = "";
        public string InitialRiskLevel { get; init; } = "";
        public string CurrentRiskLevel { get; init; } = "";
        public string ReintegrationStatus { get; init; } = "";
        public string AssignedSocialWorker { get; init; } = "";
        public DateTime? DateOfAdmission { get; init; }
        public DateTime? DateClosed { get; init; }
    }

    private class HealthRow
    {
        public DateTime RecordDate { get; init; }
        public double GeneralHealthScore { get; init; }
        public double NutritionScore { get; init; }
        public double SleepQualityScore { get; init; }
    }

    private class EducationRow
    {
        public DateTime RecordDate { get; init; }
        public double AttendanceRate { get; init; }
        public double ProgressPercent { get; init; }
    }

    private class SessionRow
    {
        public DateTime SessionDate { get; init; }
        public string EmotionalStateEnd { get; init; } = "";
        public bool ProgressNoted { get; init; }
        public bool ConcernsFlagged { get; init; }
        public bool ReferralMade { get; init; }
    }

    private class VisitRow
    {
        public DateTime VisitDate { get; init; }
        public string FamilyCooperationLevel { get; init; } = "";
        public string VisitOutcome { get; init; } = "";
        public bool SafetyConcernsNoted { get; init; }
    }

    private class IncidentRow
    {
        public DateTime IncidentDate { get; init; }
        public string IncidentType { get; init; } = "";
        public string Severity { get; init; } = "";
        public bool Resolved { get; init; }
    }

    private class PlanRow
    {
        public string PlanCategory { get; init; } = "";
        public string Status { get; init; } = "";
    }
}

public record ResidentRiskDto
{
    public int ResidentId { get; init; }
    public string CaseControlNo { get; init; } = "";
    public string InternalCode { get; init; } = "";
    public string CaseStatus { get; init; } = "";
    public string CaseCategory { get; init; } = "";
    public string CurrentRiskLevel { get; init; } = "";
    public string InitialRiskLevel { get; init; } = "";
    public string ReintegrationStatus { get; init; } = "";
    public int? SafehouseId { get; init; }
    public string SafehouseName { get; init; } = "";
    public string AssignedSocialWorker { get; init; } = "";
    public string? DateOfAdmission { get; init; }
    public string? DateClosed { get; init; }

    public double PredictedHighRiskProbability { get; init; }
    public string PredictedRiskBand { get; init; } = "";
    public bool ModelAgreesWithLabel { get; init; }

    public float AgeAtIntake { get; init; }
    public float LengthOfStayDays { get; init; }
    public int IncidentCount { get; init; }
    public int HighSeverityIncidents { get; init; }
    public int SelfHarmIncidents { get; init; }
    public int RunawayIncidents { get; init; }
    public int UnresolvedIncidents { get; init; }
    public double MeanHealthScore { get; init; }
    public double NegativeEndStateRate { get; init; }
    public double SafetyConcernsRate { get; init; }
    public int SessionCount { get; init; }

    public List<string> TopRiskFactors { get; init; } = new();
}

public record DetailedResidentRiskDto : ResidentRiskDto
{
    public CategoryStatsDto CategoryStats { get; init; } = new();
    public List<FeatureValueDto> FeatureBreakdown { get; init; } = new();
}

public record CategoryStatsDto
{
    public IncidentStats Incidents { get; init; } = new();
    public HealthStats Health { get; init; } = new();
    public EducationStats Education { get; init; } = new();
    public SessionStats Sessions { get; init; } = new();
    public HomeVisitStats HomeVisits { get; init; } = new();
    public InterventionStats Interventions { get; init; } = new();
}

public record IncidentStats
{
    public int Count { get; init; }
    public int HighSeverity { get; init; }
    public int SelfHarm { get; init; }
    public int Runaway { get; init; }
    public int Unresolved { get; init; }
}

public record HealthStats
{
    public double MeanScore { get; init; }
    public double LatestScore { get; init; }
    public double Trend { get; init; }
    public double MeanNutrition { get; init; }
    public double MeanSleep { get; init; }
    public int RecordCount { get; init; }
}

public record EducationStats
{
    public double MeanAttendance { get; init; }
    public double MeanProgress { get; init; }
    public double LatestProgress { get; init; }
    public int RecordCount { get; init; }
}

public record SessionStats
{
    public int Count { get; init; }
    public double ConcernsFlaggedRate { get; init; }
    public double ProgressNotedRate { get; init; }
    public double ReferralMadeRate { get; init; }
    public double NegativeEndStateRate { get; init; }
}

public record HomeVisitStats
{
    public int Count { get; init; }
    public double SafetyConcernsRate { get; init; }
    public double UncooperativeFamilyRate { get; init; }
    public double FavorableOutcomeRate { get; init; }
}

public record InterventionStats
{
    public int Count { get; init; }
    public double AchievedRate { get; init; }
    public double OnHoldRate { get; init; }
    public bool HasSafetyPlan { get; init; }
}

public record FeatureValueDto
{
    public string Name { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public double Value { get; init; }
    public string Category { get; init; } = "";
}
