import { Link } from 'react-router-dom';
import { useCookieConsent } from '../context/CookieConsentContext';
import { useLanguage } from '../i18n/LanguageContext';

export function CookieConsentBanner() {
  const { hasAcknowledgedConsent, acceptAllCookies, acceptNecessaryCookies } = useCookieConsent();
  const { t } = useLanguage();

  if (hasAcknowledgedConsent) {
    return null;
  }

  return (
    <aside className="cookie-banner" role="dialog" aria-live="polite" aria-label={t('cookieBanner.ariaLabel')}>
      <p>
        {t('cookieBanner.messageBefore')}
        <Link to="/cookie-policy">{t('cookieBanner.messageLinkText')}</Link>
        {t('cookieBanner.messageAfter')}
      </p>
      <div className="cookie-banner__actions">
        <button type="button" className="cookie-banner__button cookie-banner__button--ghost" onClick={acceptNecessaryCookies}>
          {t('cookieBanner.acceptNecessary')}
        </button>
        <button type="button" className="cookie-banner__button" onClick={acceptAllCookies}>
          {t('cookieBanner.acceptAll')}
        </button>
      </div>
    </aside>
  );
}
