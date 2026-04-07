import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { reportsAnalyticsApi, type ReportsAnalyticsDashboard } from '../lib/api';

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}

function shortSafehouseLabel(value: string): string {
  const label = value.trim();
  const match = label.match(/safehouse\s*#?\s*(\d+)/i);
  if (match) return `SH ${match[1]}`;
  if (label.length <= 14) return label;
  return `${label.slice(0, 13)}...`;
}

function shortCategoryLabel(value: string): string {
  const text = value.trim();
  if (text.length <= 12) return text;
  return `${text.slice(0, 11)}...`;
}

function safeNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '0';
}

export function ReportsAnalyticsPage() {
  const [data, setData] = useState<ReportsAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await reportsAnalyticsApi.dashboard();
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports analytics data.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const serviceTrend = useMemo(
    () =>
      (data?.serviceVolumeOverTime ?? []).map((row) => ({
        ...row,
        label: monthLabel(row.monthKey),
      })),
    [data],
  );

  const monthTicks = useMemo(() => {
    if (serviceTrend.length === 0) return [] as string[];
    if (serviceTrend.length === 1) return [serviceTrend[0].label];
    return [serviceTrend[0].label, serviceTrend[serviceTrend.length - 1].label];
  }, [serviceTrend]);

  const monthXAxis = {
    tick: { fill: '#385f82', fontSize: 10 },
    interval: 0 as const,
    height: 52,
  };

  const categoryXAxis = {
    tick: { fill: '#385f82', fontSize: 9 },
    interval: 'preserveStartEnd' as const,
    minTickGap: 14,
    angle: -25,
    textAnchor: 'end' as const,
    height: 64,
  };

  const openAnnualReportPdf = () => {
    if (!data) return;

    const currentYear = new Date().getFullYear();
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 52;
    const right = 52;
    const contentWidth = pageWidth - left - right;
    let y = 52;

    const sectionTitle = (text: string) => {
      y += 24;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(text, left, y);
      y += 12;
    };

    const paragraph = (text: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      const lines = doc.splitTextToSize(text, contentWidth);
      doc.text(lines, left, y);
      y += lines.length * 15 + 4;
    };

    const bulletList = (items: string[]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      for (const item of items) {
        const lines = doc.splitTextToSize(`- ${item}`, contentWidth);
        doc.text(lines, left + 2, y);
        y += lines.length * 15 + 2;
      }
    };

    const ensureSpace = (minY = 730) => {
      if (y > minY) {
        doc.addPage();
        y = 52;
      }
    };

    const totalIncidents = data.incidentTypeBreakdown.reduce((sum, row) => sum + row.count, 0);
    const residentsWithEducationLevel = data.educationLevelBreakdown.reduce((sum, row) => sum + row.count, 0);
    const activeResidents = data.safehouseComparison.reduce((sum, row) => sum + row.activeResidents, 0);
    const topIncident = data.incidentTypeBreakdown[0];
    const topPlanStatus = data.interventionPlanStatus[0];

    doc.setFillColor(11, 92, 151);
    doc.rect(0, 0, pageWidth, 74, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('ANNUAL ACCOMPLISHMENT REPORT', pageWidth / 2, 34, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Kateri Social Welfare and Development Agency', pageWidth / 2, 53, {
      align: 'center',
    });

    y = 98;
    doc.setTextColor(36, 46, 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text(`Office Address: Kateri Operations Center`, left, y);
    y += 16;
    doc.text(`For Year: ${currentYear}`, left, y);
    y += 16;
    doc.text('Source: Live system analytics from Reports & Analytics dashboard', left, y);

    sectionTitle('I. Introduction');
    paragraph(
      `Kateri SWDA provides residential care, case management, and reintegration support for vulnerable girls and their families. For CY ${currentYear}, the agency emphasized higher-quality documentation, stronger protection follow-through, and outcome tracking across safehouse operations.`,
    );
    bulletList([
      `${safeNumber(activeResidents)} active female residents currently served across safehouses.`,
      `${safeNumber(data.residentOutcomes.totalProcessRecordings)} process recording entries and ${safeNumber(data.residentOutcomes.totalHomeVisitations)} home visitations encoded for case continuity.`,
      `Reintegration success currently at ${data.reintegration.overallRate.toFixed(1)}% among residents with recorded reintegration status.`,
    ]);

    sectionTitle('II. Salient Accomplishments (Statistical and Narrative)');
    paragraph(
      `Kateri sustained core direct services and strengthened monitoring practices. Casework and home visitation activity remained active while intervention planning and conference tracking became more structured for management review.`,
    );

    ensureSpace();
    autoTable(doc, {
      startY: y,
      head: [['Program / Service', 'Area of Coverage / Location', 'Category of Beneficiaries', 'Female Served', 'Remarks']],
      body: [
        [
          'Case Management',
          'All active safehouses',
          'Girls with active cases',
          safeNumber(activeResidents),
          'From current active resident records',
        ],
        [
          'Process Recording',
          'Casework unit',
          'Counseling sessions documented',
          safeNumber(data.residentOutcomes.totalProcessRecordings),
          'Chronological session logs',
        ],
        [
          'Home Visitation',
          'Field/home visits',
          'Residents with home follow-up',
          safeNumber(data.residentOutcomes.totalHomeVisitations),
          'Home and reintegration support',
        ],
        [
          'Incident Management',
          'All safehouses',
          'Incident reports recorded',
          safeNumber(totalIncidents),
          'Used for child protection monitoring',
        ],
      ],
      styles: { fontSize: 8.8, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 92, 151] },
      margin: { left, right },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
      ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY as number) + 16
      : y + 16;

    ensureSpace();
    sectionTitle('III. Other Significant Information');
    bulletList([
      `Intervention planning now tracks ${safeNumber(data.conferenceSummary.upcoming)} upcoming and ${safeNumber(data.conferenceSummary.past)} past case conferences.`,
      topIncident ? `Most recorded incident type: ${topIncident.label} (${safeNumber(topIncident.count)} records).` : 'Incident categorization is enabled for trend monitoring.',
      topPlanStatus ? `Most common intervention status: ${topPlanStatus.label} (${safeNumber(topPlanStatus.count)} plans).` : 'Intervention status tracking is active.',
      `Education level distribution covers ${safeNumber(residentsWithEducationLevel)} residents (latest per record).`,
    ]);

    ensureSpace();
    sectionTitle('IV. Statistical Accomplishment Details');
    autoTable(doc, {
      startY: y,
      head: [['Safehouse', 'Active Residents', 'Avg Health Score', 'Avg Education Progress', 'Incidents']],
      body: data.safehouseComparison.map((row) => [
        shortSafehouseLabel(row.safehouseName),
        safeNumber(row.activeResidents),
        row.avgHealthScore.toFixed(2),
        `${row.avgEducationProgress.toFixed(1)}%`,
        safeNumber(row.incidentCount),
      ]),
      styles: { fontSize: 8.8, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 92, 151] },
      margin: { left, right },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
      ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY as number) + 16
      : y + 16;

    ensureSpace();
    sectionTitle('V. Difficulties / Problems Encountered and Solutions');
    autoTable(doc, {
      startY: y,
      head: [['Difficulty / Problem Encountered', 'Action / Solution Taken']],
      body: [
        [
          'High variation in incident profile categories across records',
          'Implemented incident type breakdown reporting to identify training and standardization needs.',
        ],
        [
          'Limited visibility on intervention pipeline progress',
          'Introduced intervention plan status dashboard and conference schedule summaries.',
        ],
        [
          'Need stronger continuity between casework and education outcomes',
          'Added education level distribution and education progress monitoring into annual analytics.',
        ],
      ],
      styles: { fontSize: 8.8, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 92, 151] },
      margin: { left, right },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
      ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY as number) + 16
      : y + 16;

    ensureSpace();
    sectionTitle('VI. Significant Changes in the SWDA');
    paragraph(
      `Kateri's reporting system expanded to include integrated dashboards for intervention planning, incident trend monitoring, education level tracking, and safehouse outcomes. Management now has centralized monthly trend views to support planning, supervision, and quality assurance.`,
    );
    bulletList([
      'Introduced unified case conference timeline metrics (upcoming vs past).',
      'Added intervention status and incident-type distribution reporting.',
      'Expanded safehouse-level comparisons for outcomes and protection indicators.',
    ]);

    ensureSpace();
    sectionTitle('VII. Plan of Action for the Succeeding Year');
    bulletList([
      'Standardize incident and intervention category definitions across all caseworkers.',
      'Increase completeness of reintegration outcome entries for all case closures.',
      'Perform monthly data-quality checks for health, education, and case conference records.',
      'Strengthen follow-up workflows for high-risk incident categories and overdue intervention plans.',
      'Expand indicator set for DSWD-style narrative and statistical reporting requirements.',
    ]);

    ensureSpace(700);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.text('Prepared by:', left, y);
    y += 44;
    doc.text('____________________________________', left, y);
    y += 16;
    doc.text('Authorized Representative / Agency Head', left, y);
    y += 16;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, left, y);

    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="admin-dashboard-page kateri-landing-section">
      <header className="kateri-photo-hero">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">Reports &amp; Analytics</h1>
          <p className="kateri-photo-hero__lead">
            Deep operational analytics for casework quality, protection trends, service delivery, and reintegration.
          </p>
          <div className="kateri-hero-actions">
            <button
              type="button"
              className="btn-kateri-gold"
              onClick={openAnnualReportPdf}
              disabled={!data}
            >
              View annual report
            </button>
          </div>
        </div>
      </header>

      {loading && <p className="donor-inline-message">Loading reports...</p>}
      {error && <p className="error-text donor-inline-message">{error}</p>}

      {!loading && !error && data && (
        <>
          <section className="admin-dashboard-summary-grid" aria-label="Reports summary metrics">
            <article className="stat-card">
              <p className="metric-label">Total process recordings</p>
              <p className="metric-value">{data.residentOutcomes.totalProcessRecordings}</p>
            </article>
            <article className="stat-card">
              <p className="metric-label">Total home visitations</p>
              <p className="metric-value">{data.residentOutcomes.totalHomeVisitations}</p>
            </article>
            <article className="stat-card">
              <p className="metric-label">Upcoming case conferences</p>
              <p className="metric-value">{data.conferenceSummary.upcoming}</p>
            </article>
            <article className="stat-card">
              <p className="metric-label">Past case conferences</p>
              <p className="metric-value">{data.conferenceSummary.past}</p>
            </article>
          </section>

          <section className="admin-dashboard-charts-grid">
            <article className="auth-card admin-chart-card">
              <h2>Service delivery intensity (monthly)</h2>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis dataKey="label" ticks={monthTicks} {...monthXAxis} />
                    <YAxis allowDecimals={false} tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="processRecordings" stackId="services" fill="#0b5c97" name="Process recordings" />
                    <Bar dataKey="homeVisitations" stackId="services" fill="#8cb9de" name="Home visitations" />
                    <Bar dataKey="incidents" stackId="services" fill="#eab676" name="Incident reports" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="auth-card admin-chart-card">
              <h2>Incident type distribution</h2>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.incidentTypeBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis
                      dataKey="label"
                      {...categoryXAxis}
                      tickFormatter={(value) => shortCategoryLabel(String(value))}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#385f82" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="auth-card admin-chart-card admin-chart-card--wide">
              <h2>Intervention planning + reintegration health</h2>
              <div className="admin-dashboard-summary-grid" aria-label="planning and reintegration metrics">
                <article className="stat-card">
                  <p className="metric-label">Avg health score</p>
                  <p className="metric-value">{data.residentOutcomes.avgHealthScore.toFixed(2)}</p>
                </article>
                <article className="stat-card">
                  <p className="metric-label">Avg education progress</p>
                  <p className="metric-value">{data.residentOutcomes.avgEducationProgress.toFixed(1)}%</p>
                </article>
                <article className="stat-card">
                  <p className="metric-label">Reintegration rate</p>
                  <p className="metric-value">{data.reintegration.overallRate.toFixed(1)}%</p>
                </article>
                <article className="stat-card">
                  <p className="metric-label">Residents w/ reintegration status</p>
                  <p className="metric-value">{data.reintegration.residentsWithReintegrationStatus}</p>
                </article>
              </div>
            </article>

            <article className="auth-card admin-chart-card">
              <h2>Intervention plan status</h2>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.interventionPlanStatus}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis
                      dataKey="label"
                      {...categoryXAxis}
                      tickFormatter={(value) => shortCategoryLabel(String(value))}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0b5c97" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="auth-card admin-chart-card">
              <h2>Education level (by resident)</h2>
              <p className="auth-lead" style={{ marginTop: '0.2rem', marginBottom: '0.6rem' }}>
                Latest per resident from education records — shows grade distribution when all are enrolled.
              </p>
              <div className="admin-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.educationLevelBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,95,130,0.15)" />
                    <XAxis
                      dataKey="label"
                      {...categoryXAxis}
                      tickFormatter={(value) => shortCategoryLabel(String(value))}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#385f82', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8cb9de" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="auth-card admin-chart-card admin-chart-card--wide">
              <h2>Reintegration status breakdown</h2>
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Residents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reintegrationBreakdown.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="auth-card admin-chart-card admin-chart-card--wide">
              <h2>Safehouse outcomes and incidents</h2>
              <div className="donor-table-wrap">
                <table className="donor-table">
                  <thead>
                    <tr>
                      <th>Safehouse</th>
                      <th>Health score</th>
                      <th>Education progress</th>
                      <th>Incidents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.safehouseComparison.map((row) => (
                      <tr key={row.safehouseId}>
                        <td>{shortSafehouseLabel(row.safehouseName)}</td>
                        <td>{row.avgHealthScore.toFixed(2)}</td>
                        <td>{row.avgEducationProgress.toFixed(1)}%</td>
                        <td>{row.incidentCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </section>
  );
}

