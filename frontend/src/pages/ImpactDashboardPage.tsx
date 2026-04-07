import { Link } from 'react-router-dom';
import heroImage from '../background.jpg?format=webp&quality=82&w=1920';
import { orgImpactStats } from '../data/orgImpactStats';

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
  return (
    <section className="impact-page kateri-landing-section">
      <header className="kateri-photo-hero">
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

      <div className="stats-grid impact-stats">
        {orgImpactStats.map((stat) => (
          <article className="stat-card" key={stat.id}>
            <p className="metric-label">{stat.label}</p>
            <p className="metric-value">{stat.value}</p>
          </article>
        ))}
      </div>

      <hr className="section-divider" />

      <div className="impact-grid">
        {impactPillars.map((pillar) => (
          <article className="impact-card" key={pillar.title}>
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
