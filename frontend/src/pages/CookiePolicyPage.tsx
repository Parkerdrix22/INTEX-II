import { useLanguage } from '../i18n/LanguageContext';

export function CookiePolicyPage() {
  const { t } = useLanguage();
  const paragraphs = t('cookiePolicy.body').split('\n\n');
  return (
    <section className="blank-page legal-page">
      <h1>{t('cookiePolicy.heading')}</h1>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </section>
  );
}
