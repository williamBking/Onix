/* ============================================================
   Onix Finance — Role-Based Access Control (RBAC)
   Single source of truth for what each staff title (admin /
   manager / ae) is allowed to do. The DB layer mirrors this
   same matrix in permissions-rls.sql — keep both in sync when
   editing.

   Public API (window.OnixPerms):
     - OnixPerms.currentTitle()      → 'admin' | 'manager' | 'ae'
     - OnixPerms.can(key)            → boolean
     - OnixPerms.require(key)        → throws PermError if not allowed
     - OnixPerms.matrix              → the full MATRIX (read-only)
     - OnixPerms.PERMS               → ordered list of {key,label}
     - OnixPerms.applyBodyClasses()  → toggles CSS hooks on <body>
     - OnixPerms.onChange(fn)        → subscribe to title changes

   Frontend hooks (all opt-in via CSS classes on <body>):
     body.onix-no-manage-users    → hide user-management UI
     body.onix-no-add-clients     → hide "+ New Client" (unused today)
     body.onix-no-remove-clients  → hide reject-client controls
     body.onix-no-view-projects   → hide raises UI (unused today)
     body.onix-no-edit-content    → hide +Add / Edit / Delete on loans/inv/raises
     body.onix-no-billing         → hide Payments / Distributions UI
   ============================================================ */
(function () {
  'use strict';

  // Keep in lockstep with the RLS policies in permissions-rls.sql.
  // Manager = read-only observer: sees everything an Admin sees, edits
  // nothing. AE = same read-only posture plus DB-level scoping to their
  // own assigned rows.
  var MATRIX = {
    admin:   { manageUsers: true,  addClients: true,  removeClients: true,  viewProjects: true, editContent: true,  billing: true },
    manager: { manageUsers: false, addClients: false, removeClients: false, viewProjects: true, editContent: false, billing: true },
    ae:      { manageUsers: false, addClients: false, removeClients: false, viewProjects: true, editContent: false, billing: true }
  };

  var PERMS = [
    { key: 'manageUsers',    label: 'Manage Users' },
    { key: 'addClients',     label: 'Add Clients' },
    { key: 'removeClients',  label: 'Remove Clients' },
    { key: 'viewProjects',   label: 'View Projects' },
    { key: 'editContent',    label: 'Edit Content' },
    { key: 'billing',        label: 'Billing' }
  ];

  var TITLES = ['admin', 'manager', 'ae'];

  function currentTitle() {
    try {
      var raw = localStorage.getItem('onix-user');
      if (!raw) return 'admin'; // fail-closed for guests would break the pre-auth pages
      var u = JSON.parse(raw);
      var t = u && u.title;
      return (TITLES.indexOf(t) >= 0) ? t : 'admin';
    } catch (e) {
      return 'admin';
    }
  }

  function can(key) {
    var t = currentTitle();
    return !!(MATRIX[t] && MATRIX[t][key]);
  }

  function PermError(key, action) {
    this.name = 'PermError';
    this.perm = key;
    this.action = action || '';
    this.message = 'Your role does not have permission for: ' + (action || key);
  }
  PermError.prototype = Object.create(Error.prototype);

  function require_(key, action) {
    if (!can(key)) throw new PermError(key, action);
    return true;
  }

  var _listeners = [];
  function onChange(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
  }
  function fireChange() {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](currentTitle()); } catch (e) {}
    }
  }

  // Map each permission key to a body class. Any UI that should hide when
  // the permission is missing gets a matching CSS rule.
  var BODY_CLASS = {
    manageUsers:   'onix-no-manage-users',
    addClients:    'onix-no-add-clients',
    removeClients: 'onix-no-remove-clients',
    viewProjects:  'onix-no-view-projects',
    editContent:   'onix-no-edit-content',
    billing:       'onix-no-billing'
  };
  var TITLE_CLASS = { admin: 'onix-role-admin', manager: 'onix-role-manager', ae: 'onix-role-ae' };

  function applyBodyClasses() {
    if (!document.body) return;
    // Set one class per permission (missing → onix-no-*).
    for (var i = 0; i < PERMS.length; i++) {
      var k = PERMS[i].key;
      document.body.classList.toggle(BODY_CLASS[k], !can(k));
    }
    // And one class for the current title, so CSS can target specific
    // controls only for specific roles (e.g. hint text).
    var t = currentTitle();
    Object.keys(TITLE_CLASS).forEach(function (r) {
      document.body.classList.toggle(TITLE_CLASS[r], t === r);
    });
  }

  // Watch localStorage for role changes across tabs. If the current tab
  // is where the login happens, we also expose forceRefresh so login.html
  // can nudge us right after signIn.
  window.addEventListener('storage', function (e) {
    if (e.key === 'onix-user') { applyBodyClasses(); fireChange(); }
  });

  // -----------------------------------------------------------------
  // Access Denied modal — Onix-branded, dismissible. Used both as a
  // full-page state (for view-level guard failures) and as an inline
  // modal (for action-level 403s coming back from the DB).
  // -----------------------------------------------------------------
  function ensureModal() {
    var m = document.getElementById('__onix_perm_modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = '__onix_perm_modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(20,20,20,.62);backdrop-filter:blur(3px);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;color:#1A1A1A';
    m.innerHTML =
      '<div style="background:#fff;border-top:3px solid #C0392B;width:440px;max-width:calc(100vw - 32px);padding:32px 36px;box-shadow:0 24px 60px rgba(0,0,0,.3)">' +
        '<div style="font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:#C0392B;font-weight:700;margin-bottom:10px" data-en="Access Denied" data-es="Acceso Denegado">Access Denied</div>' +
        '<h2 id="__onix_perm_title" style="font-family:\'Cormorant Garamond\',Georgia,serif;font-style:italic;font-weight:500;font-size:1.9rem;line-height:1.05;margin:0 0 8px" data-en="You don\'t have permission for this action" data-es="No tiene permiso para esta acción">You don\'t have permission for this action</h2>' +
        '<p id="__onix_perm_body" style="color:#6B6560;font-size:.9rem;line-height:1.55;margin:0 0 22px" data-en="Your role can view this page, but the action you tried requires a higher permission level. Ask an Admin if you believe this is a mistake." data-es="Su rol puede ver esta página, pero la acción que intentó requiere un mayor nivel de permiso. Consulte con un Admin si cree que esto es un error.">Your role can view this page, but the action you tried requires a higher permission level. Ask an Admin if you believe this is a mistake.</p>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;padding-top:14px;border-top:1px solid #f0f0f0">' +
          '<button id="__onix_perm_close" type="button" style="background:#C0392B;color:#fff;border:1px solid #C0392B;padding:10px 22px;font:600 .74rem/1 \'DM Sans\',sans-serif;text-transform:uppercase;letter-spacing:.08em;border-radius:2px;cursor:pointer" data-en="Got it" data-es="Entendido">Got it</button>' +
        '</div>' +
      '</div>';
    document.body && document.body.appendChild(m);
    m.querySelector('#__onix_perm_close').addEventListener('click', function () { m.style.display = 'none'; });
    m.addEventListener('click', function (e) { if (e.target === m) m.style.display = 'none'; });
    return m;
  }
  function showAccessDenied(opts) {
    opts = opts || {};
    var m = ensureModal();
    if (!m) return;
    if (opts.title) {
      var t = m.querySelector('#__onix_perm_title');
      if (t) { t.textContent = opts.title; t.removeAttribute('data-en'); t.removeAttribute('data-es'); }
    }
    if (opts.body) {
      var b = m.querySelector('#__onix_perm_body');
      if (b) { b.textContent = opts.body; b.removeAttribute('data-en'); b.removeAttribute('data-es'); }
    }
    m.style.display = 'flex';
  }

  // Best-effort: is this Supabase error a permission failure? RLS-related
  // errors + the trigger's `raise exception` both surface via the JS SDK
  // with .message strings we can pattern-match on.
  function isPermissionError(err) {
    if (!err) return false;
    var msg = String(err.message || err.error_description || err.error || '');
    return /permission|not allowed|policy|denied|forbidden|role does not have/i.test(msg);
  }

  // Wrap any async DB call: on a permission error, show the modal and
  // return null (never re-throw). Non-permission errors re-throw.
  function guardCall(promiseOrFn) {
    var p = (typeof promiseOrFn === 'function') ? promiseOrFn() : promiseOrFn;
    return Promise.resolve(p).then(function (res) {
      if (res && res.error && isPermissionError(res.error)) {
        showAccessDenied({ body: res.error.message });
        return { data: null, error: res.error };
      }
      return res;
    }, function (err) {
      if (isPermissionError(err)) { showAccessDenied({ body: err.message }); return { data: null, error: err }; }
      throw err;
    });
  }

  var api = {
    currentTitle: currentTitle,
    can: can,
    require: require_,
    PermError: PermError,
    matrix: MATRIX,
    PERMS: PERMS,
    applyBodyClasses: applyBodyClasses,
    onChange: onChange,
    forceRefresh: function () { applyBodyClasses(); fireChange(); },
    showAccessDenied: showAccessDenied,
    isPermissionError: isPermissionError,
    guardCall: guardCall,
    /** True when the caller can view the given admin view id (Dashboard,
     *  Clients, Loans, Investments, Raises, Payments, Distributions,
     *  Calendar, Reports, Team & Settings, OUS Pasiva).
     *  All roles can access all views today — restrictions are per-action
     *  inside the view (Edit Content, Billing, Manage Users). If the
     *  matrix grows to include a view-level restriction, wire it here. */
    canViewSection: function (viewId) {
      if (viewId === 'users' || viewId === 'team' || viewId === 'settings') {
        // Team & Settings: allow read but hide the mutation controls via
        // manageUsers body class. Everyone can *see* the page.
        return true;
      }
      return true;
    }
  };

  window.OnixPerms = api;

  // Inject the CSS hooks that make the body classes actually hide things.
  // Done here (not in a stylesheet) because the Bolt bundler overwrites
  // <head> after load, wiping out static <style> tags. Re-runs safely.
  function injectPermCss() {
    if (document.getElementById('__onix_perm_css')) return;
    if (!document.head) return;
    var s = document.createElement('style');
    s.id = '__onix_perm_css';
    s.textContent =
      /* Manage Users (title dropdown + Remove button on team rows) */
      'body.onix-no-manage-users .__onix_role_select,' +
      'body.onix-no-manage-users [data-onix-remove],' +
      'body.onix-no-manage-users [data-perm="manageUsers"]{display:none !important}' +

      /* Add Clients (+ New Client button on Clients tab) */
      'body.onix-no-add-clients [data-perm="addClients"],' +
      'body.onix-no-add-clients #oac-new-client-btn{display:none !important}' +

      /* Remove Clients (reject-client controls, Decline buttons on pending queue) */
      'body.onix-no-remove-clients [data-perm="removeClients"],' +
      'body.onix-no-remove-clients [data-cl-reject],' +
      'body.onix-no-remove-clients [data-pending-act="reject"],' +
      'body.onix-no-remove-clients #oac-bulk-reject{display:none !important}' +

      /* Edit Content (+Add, Edit Loan/Investment/Raise, Delete, document
         uploads, and payment / distribution creation — all mutations to
         portfolio data). Viewing the underlying tables is NOT gated here. */
      'body.onix-no-edit-content [data-perm="editContent"],' +
      'body.onix-no-edit-content [data-add-loan],' +
      'body.onix-no-edit-content [data-add-inv],' +
      'body.onix-no-edit-content [data-add-raise],' +
      'body.onix-no-edit-content [data-edit-loan],' +
      'body.onix-no-edit-content [data-edit-inv],' +
      'body.onix-no-edit-content [data-edit-raise],' +
      'body.onix-no-edit-content [data-add-payment],' +
      'body.onix-no-edit-content [data-add-dist],' +
      'body.onix-no-edit-content [data-doc-remove],' +
      'body.onix-no-edit-content [data-doc-add-form],' +
      'body.onix-no-edit-content #oac-add-loan-btn,' +
      'body.onix-no-edit-content #oac-add-inv-btn,' +
      'body.onix-no-edit-content #oac-add-raise-btn{display:none !important}' +

      /* Billing (view-only gate on OUS Pasiva "Cierre Saldos" and "Por
         Vencer" report fetches. Manager keeps this; only unassigned roles
         lose it.) */
      'body.onix-no-billing [data-perm="billing"]{display:none !important}';
    document.head.appendChild(s);
  }

  // Wire up on load. The Bolt bundler swaps document.head after the
  // initial <script> executes, so we also run on next tick to catch
  // that. applyBodyClasses is idempotent and safe to re-run.
  function boot() {
    injectPermCss();
    applyBodyClasses();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Guard against the Bolt bundler wiping our style tag.
  setTimeout(boot, 800);
  setTimeout(boot, 2000);
})();
