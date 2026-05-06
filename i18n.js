/* Onix Finance — minimal i18n helper.
   Looks for data-en / data-es text and data-ph-en / data-ph-es placeholders.
   Persists choice in localStorage('onix-lang'). */
(function () {
  const KEY = 'onix-lang';
  let lang = localStorage.getItem(KEY) || 'en';

  function apply() {
    document.documentElement.setAttribute('data-lang', lang);

    document.querySelectorAll('[data-en]').forEach(el => {
      const v = el.getAttribute('data-' + lang);
      if (v != null) el.textContent = v;
    });

    document.querySelectorAll('[data-ph-en]').forEach(el => {
      const v = el.getAttribute('data-ph-' + lang);
      if (v != null) el.setAttribute('placeholder', v);
    });

    document.querySelectorAll('[data-lang-set]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang-set') === lang);
    });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  window.OnixLang = {
    getLang: () => lang,
    setLang,
    apply
  };
})();
