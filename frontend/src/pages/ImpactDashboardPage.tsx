import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { publicApi } from '../lib/api';

const impactPillars = [
  {
    number: '01',
    icon: '🛡',
    title: 'Safety',
    description:
      'Safety is the first step of healing. Kateri focuses on immediate protection and stable support so every girl can begin recovery in a secure environment.',
  },
  {
    number: '02',
    icon: '❤',
    title: 'Healing',
    description:
      'After safety is established, healing can begin. We support emotional recovery through counseling, mentorship, and consistent care.',
  },
  {
    number: '03',
    icon: '⚖',
    title: 'Justice',
    description:
      'Kateri does not pressure decisions about legal action. We support each girl in pursuing the path of justice that is right for her.',
  },
  {
    number: '04',
    icon: '✦',
    title: 'Empowerment',
    description:
      'Our goal is to help girls move from victimhood to leadership and advocacy through life skills, education, and confidence-building opportunities.',
  },
];

export function ImpactDashboardPage() {
  const [impactStats, setImpactStats] = useState({
    activeResidents: 0,
    counselingSessionsFunded: 430,
    schoolReintegrationRate: 88,
  });
  const [animatedImpactStats, setAnimatedImpactStats] = useState({
    activeResidents: 0,
    counselingSessionsFunded: 0,
    schoolReintegrationRate: 0,
  });
  const animatedImpactStatsRef = useRef(animatedImpactStats);
  const [healthImpact, setHealthImpact] = useState<{
    monthly: Array<{ month: string; general: number; nutrition: number; sleep: number; energy: number }>;
    avgChange: number;
    improvedPct: number;
  }>({ monthly: [], avgChange: 0, improvedPct: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await publicApi.impactStats();
        setImpactStats({
          activeResidents: data.activeResidents,
          counselingSessionsFunded: data.counselingSessionsFunded,
          schoolReintegrationRate: data.schoolReintegrationRate,
        });
      } catch {
        // Keep fallback values when API is unavailable.
      }
    };
    void load();
  }, []);

  useEffect(() => {
    animatedImpactStatsRef.current = animatedImpactStats;
  }, [animatedImpactStats]);

  useEffect(() => {
    const durationMs = 900;
    const start = performance.now();
    const initial = { ...animatedImpactStatsRef.current };
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setAnimatedImpactStats({
        activeResidents: Math.round(initial.activeResidents + (impactStats.activeResidents - initial.activeResidents) * progress),
        counselingSessionsFunded: Math.round(
          initial.counselingSessionsFunded + (impactStats.counselingSessionsFunded - initial.counselingSessionsFunded) * progress,
        ),
        schoolReintegrationRate:
          initial.schoolReintegrationRate + (impactStats.schoolReintegrationRate - initial.schoolReintegrationRate) * progress,
      });
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [impactStats]);

  useEffect(() => {
    const loadHealthImpact = async () => {
      try {
        const data = await publicApi.healthImpact();
        setHealthImpact({
          monthly: data.monthly.map((row) => ({
            month: row.monthKey,
            general: row.generalHealthScore,
            nutrition: row.nutritionScore,
            sleep: row.sleepQualityScore,
            energy: row.energyLevelScore,
          })),
          avgChange: data.averageScoreChange,
          improvedPct: data.improvedResidentPct,
        });
      } catch {
        // Keep default empty state.
      }
    };
    void loadHealthImpact();
  }, []);

  return (
    <section className="impact-page kateri-landing-section scroll-reveal-skip">
      <header className="kateri-photo-hero scroll-reveal-skip">
        <div
          className="kateri-photo-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          aria-hidden={true}
        />
        <div className="kateri-photo-hero__scrim" aria-hidden={true} />
        <div className="kateri-photo-hero__inner">
          <h1 className="kateri-photo-hero__title">Our Impact</h1>
          <p className="kateri-photo-hero__lead">
            Kateri measures impact through protection, recovery, justice support, and long-term
            empowerment for girls and their families.
          </p>
          <div className="kateri-hero-actions">
            <Link className="btn-kateri-gold" to="/donor-dashboard">
              Support Kateri
            </Link>
            <Link className="btn-kateri-ghost" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </header>

      <div className="stats-grid impact-stats scroll-reveal-skip">
        <article className="stat-card scroll-reveal-skip">
          <p className="metric-label">Active Residents</p>
          <p className="metric-value">{animatedImpactStats.activeResidents}+</p>
        </article>
        <article className="stat-card scroll-reveal-skip">
          <p className="metric-label">Counseling Sessions Funded</p>
          <p className="metric-value">{animatedImpactStats.counselingSessionsFunded}+</p>
        </article>
        <article className="stat-card scroll-reveal-skip">
          <p className="metric-label">School Reintegration Rate</p>
          <p className="metric-value">{animatedImpactStats.schoolReintegrationRate.toFixed(1)}%</p>
        </article>
      </div>

      <article className="feature-slab scroll-reveal-skip">
        <div className="impact-highlight">
          <div className="impact-highlight__content">
            <h2>Health & Well-being Impact</h2>
            <p className="metric-label">Residents showing score improvement over time</p>
            <p>{healthImpact.improvedPct.toFixed(1)}% improved from first to latest check.</p>
            <p>Based on residents with 2+ health records.</p>
          </div>
          <p className="impact-highlight__value">{healthImpact.improvedPct.toFixed(1)}%</p>
        </div>
        <div className="impact-progress" role="img" aria-label={`${healthImpact.improvedPct.toFixed(1)} percent of residents improved`}>
          <div
            className="impact-progress__fill"
            style={{ width: `${Math.max(0, Math.min(100, healthImpact.improvedPct))}%` }}
          />
        </div>
      </article>

      <hr className="section-divider" />

      <div className="impact-grid scroll-reveal-skip">
        {impactPillars.map((pillar) => (
          <article className="impact-card scroll-reveal-skip" key={pillar.title}>
            <p className="impact-number">{pillar.number}</p>
            <div className="impact-icon" aria-hidden="true">
              {pillar.icon}
            </div>
            <h2>{pillar.title}</h2>
            <p>{pillar.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
