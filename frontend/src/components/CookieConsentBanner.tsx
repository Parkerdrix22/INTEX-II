import { Link } from 'react-router-dom';
import { useCookieConsent } from '../context/CookieConsentContext';

export function CookieConsentBanner() {
  const { hasAcknowledgedConsent, acceptAllCookies, acceptNecessaryCookies } = useCookieConsent();

  if (hasAcknowledgedConsent) {
    return null;
  }

  return (
    <aside className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <p>
        Kateri uses essential cookies for authentication and security. If you accept all cookies, we also save your
        theme preference in an optional browser cookie. You can review details in our{' '}
        <Link to="/cookie-policy">Cookie Policy</Link>.
      </p>
      <div className="cookie-banner__actions">
        <button type="button" className="cookie-banner__button cookie-banner__button--ghost" onClick={acceptNecessaryCookies}>
          Accept necessary only
        </button>
        <button type="button" className="cookie-banner__button" onClick={acceptAllCookies}>
          Accept all cookies
        </button>
      </div>
    </aside>
  );
}
