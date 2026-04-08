import { useLanguage, type Lang } from '../i18n/LanguageContext';

// Matches the visual language of the adjacent .auth-nav-pill — solid
// navy background, white text, "|" separator. Active language is fully
// opaque; inactive is dimmed. Keeps the nav bar visually cohesive.

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();

  const choose = (next: Lang) => {
    if (next !== lang) setLang(next);
  };

  return (
    <div
      className="auth-nav-pill lang-toggle-pill"
      role="group"
      aria-label={t('common.language.toggleLabel')}
    >
      <button
        type="button"
        className={`auth-nav-pill__logout lang-toggle-pill__btn${
          lang === 'en' ? ' lang-toggle-pill__btn--active' : ''
        }`}
        aria-pressed={lang === 'en'}
        onClick={() => choose('en')}
      >
        EN
      </button>
      <span className="auth-nav-pill__sep" aria-hidden="true">
        |
      </span>
      <button
        type="button"
        className={`auth-nav-pill__logout lang-toggle-pill__btn${
          lang === 'nv' ? ' lang-toggle-pill__btn--active' : ''
        }`}
        aria-pressed={lang === 'nv'}
        onClick={() => choose('nv')}
        title={t('common.language.mtDisclaimer')}
      >
        Diné
      </button>
    </div>
  );
}
