import { useLanguage, type Lang } from '../i18n/LanguageContext';

// Cream pill container with two buttons, active language filled with navy.
// Modeled after the EN/SPA toggle on intex1.nathanblatter.com but themed
// with Kateri colors (cream container + navy active state).

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();

  const choose = (next: Lang) => {
    if (next !== lang) setLang(next);
  };

  return (
    <div className="lang-toggle" role="group" aria-label={t('common.language.toggleLabel')}>
      <button
        type="button"
        className={`lang-button${lang === 'en' ? ' active' : ''}`}
        aria-pressed={lang === 'en'}
        onClick={() => choose('en')}
      >
        ENG
      </button>
      <button
        type="button"
        className={`lang-button${lang === 'nv' ? ' active' : ''}`}
        aria-pressed={lang === 'nv'}
        onClick={() => choose('nv')}
        title={t('common.language.mtDisclaimer')}
      >
        DIN
      </button>
    </div>
  );
}
