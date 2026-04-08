import { useLanguage } from '../i18n/LanguageContext';

export function UnauthorizedPage() {
  const { t } = useLanguage();
  return (
    <section className="blank-page">
      <h1>{t('unauthorized.heading')}</h1>
      <p>{t('unauthorized.body')}</p>
    </section>
  );
}
