/* Onix Finance — minimal i18n helper.
   Looks for data-en / data-es text and data-ph-en / data-ph-es placeholders.
   Persists choice in localStorage('onix-lang').
   Robust to late-injected DOM (admin portal renders most of its UI after
   load via a bundler) — a MutationObserver re-applies on new elements. */
(function () {
  const KEY = 'onix-lang';
  let lang = localStorage.getItem(KEY) || 'en';

  function applyTo(root) {
    if (!root) return;
    const scope = (root.nodeType === 1 && root.matches) ? root : document;

    // The triggering element itself may need translating (only when scope is an element)
    if (scope !== document) {
      if (scope.hasAttribute && scope.hasAttribute('data-en')) {
        const v = scope.getAttribute('data-' + lang);
        if (v != null) scope.textContent = v;
      }
      if (scope.hasAttribute && scope.hasAttribute('data-ph-en')) {
        const v = scope.getAttribute('data-ph-' + lang);
        if (v != null) scope.setAttribute('placeholder', v);
      }
    }

    scope.querySelectorAll && scope.querySelectorAll('[data-en]').forEach(el => {
      const v = el.getAttribute('data-' + lang);
      if (v != null) el.textContent = v;
    });

    scope.querySelectorAll && scope.querySelectorAll('[data-ph-en]').forEach(el => {
      const v = el.getAttribute('data-ph-' + lang);
      if (v != null) el.setAttribute('placeholder', v);
    });

    scope.querySelectorAll && scope.querySelectorAll('[data-lang-set]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang-set') === lang);
    });
  }

  function apply() {
    document.documentElement.setAttribute('data-lang', lang);
    applyTo(document);
  }

  function setLang(next) {
    lang = next === 'es' ? 'es' : 'en';
    localStorage.setItem(KEY, lang);
    apply();
  }

  // Wire up toggle buttons (event delegation so it works for late-injected DOM).
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-lang-set]');
    if (btn) { setLang(btn.getAttribute('data-lang-set')); }
  });

  // Observe DOM changes so the chosen language is applied to elements that
  // are injected after this script runs (e.g. modals, table rows, the admin
  // portal's bundled content). Throttled with rAF to avoid thrash.
  let pending = false;
  const observer = new MutationObserver(muts => {
    let needsScan = false;
    for (let i = 0; i < muts.length && !needsScan; i++) {
      const m = muts[i];
      for (let j = 0; j < m.addedNodes.length; j++) {
        const n = m.addedNodes[j];
        if (n.nodeType === 1) { needsScan = true; break; }
      }
    }
    if (!needsScan || pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; apply(); });
  });

  function startObserver() {
    if (document.body) observer.observe(document.body, { subtree: true, childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { apply(); startObserver(); });
  } else {
    apply();
    startObserver();
  }

  window.OnixLang = {
    getLang: () => lang,
    setLang,
    apply
  };
})();
