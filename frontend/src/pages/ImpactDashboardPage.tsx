import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Shield, Heart, Award, Star, type Icon } from 'react-feather';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { publicApi } from '../lib/api';
import { useLanguage } from '../i18n/LanguageContext';

type PillarDef = { number: string; Icon: Icon; key: 'safety' | 'healing' | 'justice' | 'empowerment' };

const impactPillars: readonly PillarDef[] = [
  { number: '01', Icon: Shield, key: 'safety' },
  { number: '02', Icon: Heart, key: 'healing' },
  // Award is the closest react-feather equivalent for "justice" — there's
  // no actual scales icon in the feather set.
  { number: '03', Icon: Award, key: 'justice' },
  { number: '04', Icon: Star, key: 'empowerment' },
] as const;

export function ImpactDashboardPage() {
  const { t } = useLanguage();
  const [impactStats, setImpactStats] = useState({
    activeResidents: 0,
    inclusiveCarePct: 0,
    riskReducedPct: 0,
    riskComparedCount: 0,
    riskReducedCount: 0,
    riskUnchangedCount: 0,
    riskIncreasedCount: 0,
  });
  const [animatedImpactStats, setAnimatedImpactStats] = useState({
    activeResidents: 0,
    inclusiveCarePct: 0,
    riskReducedPct: 0,
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
          inclusiveCarePct: data.inclusiveCarePct,
          riskReducedPct: data.riskReducedPct,
          riskComparedCount: data.riskComparedCount,
          riskReducedCount: data.riskReducedCount,
          riskUnchangedCount: data.riskUnchangedCount,
          riskIncreasedCount: data.riskIncreasedCount,
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
        inclusiveCarePct:
          initial.inclusiveCarePct + (impactStats.inclusiveCarePct - initial.inclusiveCarePct) * progress,
        riskReducedPct: initial.riskReducedPct + (impactStats.riskReducedPct - initial.riskReducedPct) * progress,
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
          <h1 className="kateri-photo-hero__title">{t('impact.heading')}</h1>
          <p className="kateri-photo-hero__lead">{t('impact.lead')}</p>
          <div className="kateri-hero-actions">
            <Link className="btn-kateri-gold" to="/donor-dashboard">
              {t('impact.cta.support')}
            </Link>
            <Link className="btn-kateri-ghost" to="/">
              {t('impact.cta.backHome')}
            </Link>
          </div>
        </div>
      </header>

      <div className="stats-grid impact-stats scroll-reveal-skip">
        <article className="stat-card scroll-reveal-skip">
          <p className="metric-label">{t('impact.kpi.activeResidents')}</p>
          <p className="metric-value">{animatedImpactStats.activeResidents}+</p>
        </article>
        <article className="stat-card scroll-reveal-skip">
          <p className="metric-label">{t('impact.kpi.inclusiveCare')}</p>
          <p className="metric-value">{animatedImpactStats.inclusiveCarePct.toFixed(1)}%</p>
          <p className="metric-footnote">{t('impact.kpi.inclusiveCareFootnote')}</p>
        </article>
        <article className="stat-card scroll-reveal-skip">
          <p className="metric-label">{t('impact.kpi.riskReduced')}</p>
          <p className="metric-value">{animatedImpactStats.riskReducedPct.toFixed(1)}%</p>
          <p className="metric-footnote">
            {t('impact.kpi.riskFootnote', {
              compared: impactStats.riskComparedCount,
              reduced: impactStats.riskReducedCount,
              same: impactStats.riskUnchangedCount,
              increased: impactStats.riskIncreasedCount,
            })}
          </p>
        </article>
      </div>

      <article className="feature-slab scroll-reveal-skip">
        <div className="impact-highlight">
          <div className="impact-highlight__content">
            <h2>{t('impact.health.heading')}</h2>
            <p className="metric-label">{t('impact.health.subtitle')}</p>
            <p>{t('impact.health.improvedSummary', { percent: healthImpact.improvedPct.toFixed(1) })}</p>
            <p>{t('impact.health.basis')}</p>
          </div>
          <p className="impact-highlight__value">{healthImpact.improvedPct.toFixed(1)}%</p>
        </div>
        <div className="impact-progress" role="img" aria-label={t('impact.health.progressAria', { percent: healthImpact.improvedPct.toFixed(1) })}>
          <div
            className="impact-progress__fill"
            style={{ width: `${Math.max(0, Math.min(100, healthImpact.improvedPct))}%` }}
          />
        </div>
      </article>

      <hr className="section-divider" />

      <div className="impact-grid scroll-reveal-skip">
        {impactPillars.map(({ Icon: PillarIcon, ...pillar }) => (
          <article className="impact-card scroll-reveal-skip" key={pillar.key}>
            <p className="impact-number">{pillar.number}</p>
            <div className="impact-icon" aria-hidden="true">
              <PillarIcon size={32} strokeWidth={1.6} />
            </div>
            <h2>{t(`impact.pillars.${pillar.key}.title`)}</h2>
            <p>{t(`impact.pillars.${pillar.key}.description`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
