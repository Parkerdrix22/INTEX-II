import { useLanguage } from '../i18n/LanguageContext';

export function PrivacyPolicyPage() {
  const { t } = useLanguage();
  const paragraphs = t('privacy.body').split('\n\n');
  return (
    <section className="blank-page legal-page">
      <h1>{t('privacy.heading')}</h1>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </section>
  );
}
