import { Link } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import backgroundImage from '../background.jpg?format=webp&quality=82&w=1920';
import threeSistersImage from '../Three sisters in a sunlit field.png?format=webp&quality=82&w=960';
import kateriPortraitImage from '../Kateri Tekakwitha in golden grasses.png?format=webp&quality=82&w=960';
import { publicApi } from '../lib/api';

export function HomePage() {
  const [stats, setStats] = useState({
    safehomesSupported: 4,
    activeResidentCases: 60,
    communityPartners: 30,
  });
  const [animatedStats, setAnimatedStats] = useState({
    safehomesSupported: 0,
    activeResidentCases: 0,
    communityPartners: 0,
  });
  const animatedStatsRef = useRef(animatedStats);

  useLayoutEffect(() => {
    const id = 'preload-kateri-home-bg';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'preload';
    link.as = 'image';
    link.href = backgroundImage;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);

  useEffect(() => {
    document.body.classList.add('home-background');
    document.documentElement.style.setProperty('--home-bg-image', `url(${backgroundImage})`);

    return () => {
      document.body.classList.remove('home-background');
      document.documentElement.style.removeProperty('--home-bg-image');
    };
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await publicApi.homeStats();
        setStats({
          safehomesSupported: response.safehomesSupported,
          activeResidentCases: response.activeResidentCases,
          communityPartners: response.communityPartners,
        });
      } catch {
        // Keep fallback values if public stats endpoint is unavailable.
      }
    };

    void loadStats();
  }, []);

  useEffect(() => {
    animatedStatsRef.current = animatedStats;
  }, [animatedStats]);

  useEffect(() => {
    const durationMs = 900;
    const start = performance.now();
    const initial = { ...animatedStatsRef.current };
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setAnimatedStats({
        safehomesSupported: Math.round(initial.safehomesSupported + (stats.safehomesSupported - initial.safehomesSupported) * progress),
        activeResidentCases: Math.round(initial.activeResidentCases + (stats.activeResidentCases - initial.activeResidentCases) * progress),
        communityPartners: Math.round(initial.communityPartners + (stats.communityPartners - initial.communityPartners) * progress),
      });
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stats]);

  return (
    <section className="home-page">
      <div className="hero-panel hero-full-width">
        <h1 className="hero-brand">Kateri</h1>
        <h2 className="hero-title">Safety, healing, and a path forward for every girl we serve.</h2>
        <p className="hero-copy">
          Kateri provides safe housing, counseling, and reintegration support for girls, with a
          focused commitment to Native American communities.
        </p>
        <div className="hero-actions">
          <Link className="btn-primary" to="/donor-dashboard">
            Support Kateri
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <p className="metric-label">Safehomes Supported</p>
          <p className="metric-value">{animatedStats.safehomesSupported}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Active Resident Cases</p>
          <p className="metric-value">{animatedStats.activeResidentCases}+</p>
        </article>
        <article className="stat-card">
          <p className="metric-label">Community Partners</p>
          <p className="metric-value">{animatedStats.communityPartners}+</p>
        </article>
      </div>

      <div className="serve-grid">
        <article className="feature-slab serve-content">
          <h2>How Kateri serves</h2>
          <ul className="mission-list">
            <li>
              <strong>Protect:</strong> Provide immediate safety through secure housing and
              coordinated case management.
            </li>
            <li>
              <strong>Restore:</strong> Support healing through counseling, education, and
              individualized interventions.
            </li>
            <li>
              <strong>Reintegrate:</strong> Prepare residents for long-term success through family
              engagement and reintegration planning.
            </li>
          </ul>
          <div className="hero-actions">
            <Link className="btn-primary" to="/impact">
              View Our Impact
            </Link>
          </div>
        </article>
        <figure className="sisters-figure">
          <img
            src={threeSistersImage}
            alt="Three sisters sitting together in a sunlit field."
            width={960}
            height={540}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 800px) 100vw, min(532px, 50vw)"
            fetchPriority="low"
          />
        </figure>
      </div>

      <div className="name-grid">
        <figure className="name-figure">
          <img
            src={kateriPortraitImage}
            alt="Portrait of Kateri Tekakwitha in golden grasses."
            width={960}
            height={540}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 800px) 100vw, min(532px, 50vw)"
            fetchPriority="low"
          />
        </figure>
        <article className="feature-slab">
          <h2>Why the name Kateri?</h2>
          <p>
            The organization is named in honor of Saint Kateri Tekakwitha, widely recognized as the
            first Native American saint. The name reflects a commitment to dignity, resilience, and
            culturally respectful care for the communities Kateri serves.
          </p>
        </article>
      </div>

      <footer className="cta-panel home-footer">
        <h2>Contact Us</h2>
        <p>
          Reach out to learn more about Kateri, partnership opportunities, and ways to support our
          mission.
        </p>
        <div className="contact-links">
          <a className="contact-link" href="https://www.instagram.com/kateri.org" target="_blank" rel="noreferrer">
            <span className="icon-circle" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm8.95 1.55a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 1.8a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Z" />
              </svg>
            </span>
            Instagram
          </a>
          <a className="contact-link" href="https://www.facebook.com/kateri.org" target="_blank" rel="noreferrer">
            <span className="icon-circle" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M13.75 22v-8h2.7l.4-3.1h-3.1v-2c0-.9.25-1.5 1.55-1.5H17V4.65A22 22 0 0 0 14.45 4C11.9 4 10.2 5.55 10.2 8.45v2.45H7.5V14h2.7v8h3.55Z" />
              </svg>
            </span>
            Facebook
          </a>
          <a className="contact-link" href="tel:+18015551234">
            <span className="icon-circle" aria-hidden="true">
              ☎
            </span>
            +1 (801) 555-1234
          </a>
          <a className="contact-link" href="mailto:support@kateri.org">
            <span className="icon-circle" aria-hidden="true">
              ✉
            </span>
            support@kateri.org
          </a>
          <Link className="contact-link" to="/privacy-policy">
            <span className="icon-circle" aria-hidden="true">
              P
            </span>
            Privacy Policy
          </Link>
          <Link className="contact-link" to="/cookie-policy">
            <span className="icon-circle" aria-hidden="true">
              C
            </span>
            Cookie Policy
          </Link>
        </div>
      </footer>
    </section>
  );
}
