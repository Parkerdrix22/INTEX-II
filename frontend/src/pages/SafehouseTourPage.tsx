import { useMemo } from 'react';
import { SafehouseScene } from '../components/safehouse3d/SafehouseScene';
import { useLanguage } from '../i18n/LanguageContext';

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function SafehouseTourPage() {
  const supportsWebGL = useMemo(() => canUseWebGL(), []);
  const { t } = useLanguage();

  return (
    <section className="safehouse-tour-page">
      <article className="safehouse-tour-card">
        <header className="safehouse-tour-header">
          <h1>{t('safehouse.heading')}</h1>
          <p className="auth-lead">{t('safehouse.lead')}</p>
        </header>

        <div className="safehouse-tour-model-wrap" role="img" aria-label={t('safehouse.modelAria')}>
          {supportsWebGL ? (
            <SafehouseScene />
          ) : (
            <div className="safehouse-tour-fallback">
              <p>{t('safehouse.noWebgl')}</p>
            </div>
          )}
        </div>

        <section className="safehouse-tour-description" aria-label={t('safehouse.summaryAria')}>
          <h2>{t('safehouse.insideHeading')}</h2>
          <p>{t('safehouse.insideBody')}</p>
        </section>
      </article>
    </section>
  );
}
