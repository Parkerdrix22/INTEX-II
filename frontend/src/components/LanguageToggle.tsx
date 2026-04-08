import { useLanguage, type Lang } from '../i18n/LanguageContext';

// Two-button segmented control that flips the active language cookie and
// triggers a re-render of the whole tree via LanguageContext. Lives in the
// top nav right next to the auth pill. The Diné option carries an unobtrusive
// "MT" badge as an honest disclosure that translations are machine-generated.

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();

  const choose = (next: Lang) => {
    if (next !== lang) setLang(next);
  };

  return (
    <div
      className="lang-toggle"
      role="group"
      aria-label={t('common.language.toggleLabel')}
    >
      <button
        type="button"
        className={`lang-toggle__btn${lang === 'en' ? ' lang-toggle__btn--active' : ''}`}
        aria-pressed={lang === 'en'}
        onClick={() => choose('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`lang-toggle__btn${lang === 'nv' ? ' lang-toggle__btn--active' : ''}`}
        aria-pressed={lang === 'nv'}
        onClick={() => choose('nv')}
        title={t('common.language.mtDisclaimer')}
      >
        Diné
      </button>
    </div>
  );
}
