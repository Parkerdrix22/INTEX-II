import { useEffect, type RefObject } from 'react';

/** Slightly inset bottom so elements count as “in view” when meaningfully on screen */
const observerOptions: IntersectionObserverInit = {
  root: null,
  rootMargin: '0px 0px -8% 0px',
  threshold: [0, 0.08, 0.15],
};

/**
 * UI blocks that should pop in on scroll. (Nested matches are pruned so parents don’t hide children.)
 */
const REVEAL_SELECTOR = [
  '.hero-panel',
  '.stat-card',
  '.feature-slab',
  '.cta-panel',
  '.auth-card',
  '.impact-card',
  '.sisters-figure',
  '.name-figure',
  '.kateri-photo-hero',
  '.donor-history-overview',
  '.planner-header',
  '.planner-form-panel',
  '.planner-result-panel',
  '.planner-loading',
  '.form-section',
  '.toggle-card',
  '.churn-header',
  /* summary + donor cards use DonorChurnPage.css entrance animations */
  '.churn-controls',
  '.churn-disclaimer',
  '.churn-empty',
  '.churn-loading',
  'section.blank-page',
].join(', ');

/** Keep only “leaf” targets: drop ancestors if a descendant is also targeted (opacity nesting). */
function pruneNestedContainers(nodes: HTMLElement[]): HTMLElement[] {
  return nodes.filter((el) => !nodes.some((other) => other !== el && other.contains(el)));
}

function collectRevealTargets(root: HTMLElement): HTMLElement[] {
  const list = root.querySelectorAll(REVEAL_SELECTOR);
  const candidates: HTMLElement[] = [];
  list.forEach((el) => {
    if (el instanceof HTMLElement && !el.classList.contains('scroll-reveal-skip')) {
      candidates.push(el);
    }
  });
  return pruneNestedContainers(candidates);
}

/**
 * Scroll-triggered pop-in for card/panel-like containers inside `main`.
 * Re-runs the animation every time the element scrolls into view again.
 */
export function useScrollReveal(mainRef: RefObject<HTMLElement | null>, routePathname: string) {
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return undefined;

    let observer: IntersectionObserver | null = null;

    const attach = () => {
      observer?.disconnect();
      observer = null;

      const targets = collectRevealTargets(root);
      if (targets.length === 0) return;

      targets.forEach((el) => {
        el.classList.remove('scroll-reveal', 'is-revealed');
        el.classList.add('scroll-reveal');
      });

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        targets.forEach((el) => el.classList.add('is-revealed'));
        return;
      }

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement)) continue;
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
          } else {
            entry.target.classList.remove('is-revealed');
          }
        }
      }, observerOptions);

      targets.forEach((el) => observer?.observe(el));

      const vh = window.innerHeight || document.documentElement.clientHeight;
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        if (rect.top < vh * 0.94 && rect.bottom > -40) {
          el.classList.add('is-revealed');
        }
      }
    };

    attach();
    const raf = window.requestAnimationFrame(attach);

    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [mainRef, routePathname]);
}
