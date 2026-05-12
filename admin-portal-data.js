/* ============================================================
   Onix Finance — Admin Portal Live Console
   Renders a real-data overlay on top of the static admin design.
   All data comes from Supabase via OnixDB.
   ============================================================ */
(function () {
  'use strict';

  if (!window.OnixDB) {
    console.error('[onix-admin] supabase.js not loaded');
    return;
  }

  // ---------- helpers ----------
  const fmt = {
    money: n => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })),
    pct:   n => (n == null ? '—' : Number(n).toFixed(1) + '%'),
    date:  s => (s == null ? '—' : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));

  // ---------- styles for the live console overlay ----------
  function injectStyles() {
    if (document.getElementById('onix-admin-styles')) return;
    const s = document.createElement('style');
    s.id = 'onix-admin-styles';
    s.textContent = `
      #onix-admin-toggle{position:fixed;bottom:20px;right:20px;z-index:99998;background:#C0392B;color:#fff;padding:12px 18px;border:none;border-radius:2px;font:600 .75rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18)}
      #onix-admin-toggle:hover{background:#a93226}
      #onix-admin-panel{position:fixed;inset:0;background:#F8F7F5;z-index:99999;overflow-y:auto;display:none;padding:32px 40px 80px;font-family:'DM Sans',sans-serif;color:#1A1A1A}
      #onix-admin-panel.open{display:block}
      .oac-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #E8E8E8}
      .oac-hd h1{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:2rem;margin:0}
      .oac-hd .sub{font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:.12em;margin-top:4px}
      .oac-close{background:#1A1A1A;color:#fff;padding:8px 16px;border:none;border-radius:2px;font:600 .72rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.1em;cursor:pointer}
      .oac-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
      .oac-card{background:#fff;border:1px solid #E8E8E8;border-top:3px solid #C0392B;padding:20px 24px}
      .oac-card.full{grid-column:1/-1}
      .oac-card h2{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:1.3rem;margin:0 0 4px}
      .oac-card .ttl-sub{font-size:.65rem;color:#888;text-transform:uppercase;letter-spacing:.12em;margin-bottom:16px}
      .oac-kpi-row{display:flex;gap:24px;margin-bottom:12px}
      .oac-kpi{flex:1}
      .oac-kpi .l{font-size:.62rem;color:#888;text-transform:uppercase;letter-spacing:.1em;font-weight:600;margin-bottom:4px}
      .oac-kpi .v{font-family:'Cormorant Garamond',serif;font-size:1.6rem;color:#C0392B;font-weight:500;line-height:1}
      .oac-table{width:100%;border-collapse:collapse;font-size:.82rem}
      .oac-table th{background:#C0392B;color:#fff;text-align:left;padding:8px 10px;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700}
      .oac-table td{padding:10px;border-bottom:1px solid #f4f4f4;vertical-align:middle}
      .oac-table tr:nth-child(even) td{background:#FAE8E8}
      .oac-empty{text-align:center;padding:24px;color:#888;font-style:italic}
      .oac-badge{display:inline-block;padding:2px 8px;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:2px}
      .oac-badge.active{background:#EBF5EB;color:#2D6A2D}
      .oac-badge.pending{background:#FDF5E6;color:#A07818}
      .oac-badge.rejected{background:#FDF0EE;color:#C0392B}
      .oac-badge.open{background:#EBF5EB;color:#2D6A2D}
      .oac-badge.closed{background:#f4f4f4;color:#888}
      .oac-btn{padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid transparent;border-radius:2px;cursor:pointer;margin-right:4px}
      .oac-btn.red{background:#C0392B;color:#fff;border-color:#C0392B}.oac-btn.red:hover{background:#a93226}
      .oac-btn.outline{background:#fff;color:#1A1A1A;border-color:#E8E8E8}.oac-btn.outline:hover{border-color:#C0392B;color:#C0392B}
      .oac-btn.danger{background:#fff;color:#C0392B;border-color:#C0392B}.oac-btn.danger:hover{background:#FDF0EE}
      .oac-btn:disabled{opacity:.5;cursor:default}
      .oac-tabs{display:flex;gap:0;margin-bottom:18px;border-bottom:1px solid #E8E8E8}
      .oac-tab{padding:10px 18px;font:600 .72rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.1em;color:#888;cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px}
      .oac-tab.active{color:#C0392B;border-bottom-color:#C0392B}
      .oac-section{display:none}
      .oac-section.active{display:block}
    `;
    document.head.appendChild(s);
  }

  // ---------- panel scaffold ----------
  function buildPanel() {
    if (document.getElementById('onix-admin-panel')) return;
    const toggle = document.createElement('button');
    toggle.id = 'onix-admin-toggle';
    toggle.textContent = 'Live Admin Console';
    toggle.addEventListener('click', () => {
      document.getElementById('onix-admin-panel').classList.toggle('open');
      refreshAll();
    });
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = 'onix-admin-panel';
    panel.innerHTML = `
      <div class="oac-hd">
        <div>
          <h1>Onix Live Admin Console</h1>
          <div class="sub" id="oac-greeting">Loading…</div>
        </div>
        <div>
          <button class="oac-btn outline" id="oac-refresh">Refresh</button>
          <button class="oac-close" id="oac-close">Close</button>
        </div>
      </div>
      <div class="oac-tabs">
        <button class="oac-tab active" data-tab="overview">Overview</button>
        <button class="oac-tab" data-tab="approvals">Pending Approvals</button>
        <button class="oac-tab" data-tab="clients">All Clients</button>
        <button class="oac-tab" data-tab="applications">Applications</button>
        <button class="oac-tab" data-tab="loans">Loans</button>
        <button class="oac-tab" data-tab="investments">Investments</button>
        <button class="oac-tab" data-tab="raises">Raises</button>
      </div>
      <div class="oac-section active" data-section="overview"><div class="oac-grid" id="oac-overview"></div></div>
      <div class="oac-section" data-section="approvals"><div class="oac-card full" id="oac-approvals-card"><h2>Pending Client Approvals</h2><div class="ttl-sub">Approve or reject new sign-ups</div><div id="oac-approvals"></div></div></div>
      <div class="oac-section" data-section="clients"><div class="oac-card full"><h2>All Clients</h2><div class="ttl-sub">Every profile in the system</div><div id="oac-clients"></div></div></div>
      <div class="oac-section" data-section="applications"><div class="oac-card full"><h2>Loan Applications Inbox</h2><div class="ttl-sub">Submitted from the client portal</div><div id="oac-applications"></div></div></div>
      <div class="oac-section" data-section="loans"><div class="oac-card full"><h2>All Loans</h2><div class="ttl-sub">Active and historical loans across all clients</div><div id="oac-loans"></div></div></div>
      <div class="oac-section" data-section="investments"><div class="oac-card full"><h2>All Investments</h2><div class="ttl-sub">Client positions across every venture</div><div id="oac-investments"></div></div></div>
      <div class="oac-section" data-section="raises"><div class="oac-card full"><h2>Open Raises</h2><div class="ttl-sub">Active investment opportunities</div><div id="oac-raises"></div></div></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#oac-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('#oac-refresh').addEventListener('click', refreshAll);
    panel.querySelectorAll('.oac-tab').forEach(t => {
      t.addEventListener('click', () => {
        panel.querySelectorAll('.oac-tab').forEach(x => x.classList.remove('active'));
        panel.querySelectorAll('.oac-section').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        panel.querySelector('[data-section="' + t.dataset.tab + '"]').classList.add('active');
      });
    });
  }

  // ---------- renderers ----------
  function renderOverview(data) {
    const { clients, pending, loans, investments, raises, applications } = data;
    const activeLoanBal = loans.filter(l => l.status === 'active').reduce((s, l) => s + Number(l.balance || 0), 0);
    const totalInvested = investments.filter(i => i.status === 'active').reduce((s, i) => s + Number(i.amount_invested || 0), 0);
    const totalRaiseGoal = raises.filter(r => r.status === 'open').reduce((s, r) => s + Number(r.total_raise_target || 0), 0);
    const totalRaised = raises.filter(r => r.status === 'open').reduce((s, r) => s + Number(r.amount_raised || 0), 0);

    document.getElementById('oac-overview').innerHTML = `
      <div class="oac-card">
        <h2>Loan Portfolio</h2><div class="ttl-sub">Active loans</div>
        <div class="oac-kpi-row">
          <div class="oac-kpi"><div class="l">Outstanding</div><div class="v">${fmt.money(activeLoanBal)}</div></div>
          <div class="oac-kpi"><div class="l">Active loans</div><div class="v">${loans.filter(l => l.status === 'active').length}</div></div>
        </div>
      </div>
      <div class="oac-card">
        <h2>Investments</h2><div class="ttl-sub">Active client positions</div>
        <div class="oac-kpi-row">
          <div class="oac-kpi"><div class="l">Total invested</div><div class="v">${fmt.money(totalInvested)}</div></div>
          <div class="oac-kpi"><div class="l">Positions</div><div class="v">${investments.filter(i => i.status === 'active').length}</div></div>
        </div>
      </div>
      <div class="oac-card">
        <h2>Open Raises</h2><div class="ttl-sub">Capital being raised right now</div>
        <div class="oac-kpi-row">
          <div class="oac-kpi"><div class="l">Goal</div><div class="v">${fmt.money(totalRaiseGoal)}</div></div>
          <div class="oac-kpi"><div class="l">Raised</div><div class="v">${fmt.money(totalRaised)}</div></div>
          <div class="oac-kpi"><div class="l">Active raises</div><div class="v">${raises.filter(r => r.status === 'open').length}</div></div>
        </div>
      </div>
      <div class="oac-card">
        <h2>Clients</h2><div class="ttl-sub">Account status snapshot</div>
        <div class="oac-kpi-row">
          <div class="oac-kpi"><div class="l">Total</div><div class="v">${clients.length}</div></div>
          <div class="oac-kpi"><div class="l">Pending</div><div class="v">${pending.length}</div></div>
          <div class="oac-kpi"><div class="l">Applications</div><div class="v">${applications.length}</div></div>
        </div>
      </div>`;
  }

  function renderApprovals(pending) {
    const el = document.getElementById('oac-approvals');
    if (!pending.length) { el.innerHTML = '<div class="oac-empty">No pending approvals.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Name</th><th>Email</th><th>Submitted</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${pending.map(p => `
        <tr data-id="${esc(p.id)}">
          <td>${esc(p.full_name || '—')}</td>
          <td>${esc(p.email)}</td>
          <td>${fmt.date(p.created_at)}</td>
          <td style="text-align:right">
            <button class="oac-btn red"     data-act="approve" data-id="${esc(p.id)}">Approve</button>
            <button class="oac-btn danger"  data-act="reject"  data-id="${esc(p.id)}">Reject</button>
          </td>
        </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        const fn  = act === 'approve' ? OnixDB.approveClient : OnixDB.rejectClient;
        const row = el.querySelector(`tr[data-id="${id}"]`);
        if (row) row.querySelectorAll('button').forEach(b => b.disabled = true);
        const ok = await fn(id);
        if (ok) { if (row) row.remove(); refreshAll(); }
        else { alert('Could not ' + act + ' client.'); if (row) row.querySelectorAll('button').forEach(b => b.disabled = false); }
      });
    });
  }

  function renderClients(clients) {
    const el = document.getElementById('oac-clients');
    if (!clients.length) { el.innerHTML = '<div class="oac-empty">No clients yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th>
      </tr></thead><tbody>${clients.map(c => `
        <tr>
          <td>${esc(c.full_name || '—')}</td>
          <td>${esc(c.email)}</td>
          <td>${esc(c.role)}</td>
          <td><span class="oac-badge ${esc(c.status || '')}">${esc(c.status || '—')}</span></td>
          <td>${fmt.date(c.created_at)}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  function renderApplications(apps) {
    const el = document.getElementById('oac-applications');
    if (!apps.length) { el.innerHTML = '<div class="oac-empty">No applications submitted yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Submitted</th><th>Client</th><th>Amount</th><th>Type</th><th>Purpose</th><th>Status</th>
      </tr></thead><tbody>${apps.map(a => `
        <tr>
          <td>${fmt.date(a.submitted_at)}</td>
          <td>${esc((a.profiles && (a.profiles.full_name || a.profiles.email)) || a.user_id)}</td>
          <td>${fmt.money(a.amount_requested)}</td>
          <td>${esc(a.applicant_type || '—')}</td>
          <td>${esc(a.purpose || '—')}</td>
          <td><span class="oac-badge ${esc(a.status || '')}">${esc(a.status || '—')}</span></td>
        </tr>`).join('')}</tbody></table>`;
  }

  function renderLoans(loans) {
    const el = document.getElementById('oac-loans');
    if (!loans.length) { el.innerHTML = '<div class="oac-empty">No loans yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Loan ID</th><th>Client</th><th>Balance</th><th>Rate</th><th>Payment</th><th>Next Due</th><th>Status</th>
      </tr></thead><tbody>${loans.map(l => `
        <tr>
          <td>${esc(l.loan_id_display || l.id.slice(0,8))}</td>
          <td>${esc((l.profiles && (l.profiles.full_name || l.profiles.email)) || l.user_id)}</td>
          <td>${fmt.money(l.balance)}</td>
          <td>${fmt.pct(l.interest_rate)}</td>
          <td>${fmt.money(l.monthly_payment)}</td>
          <td>${fmt.date(l.next_due_date)}</td>
          <td><span class="oac-badge ${esc(l.status || '')}">${esc(l.status || '—')}</span></td>
        </tr>`).join('')}</tbody></table>`;
  }

  function renderInvestments(invs) {
    const el = document.getElementById('oac-investments');
    if (!invs.length) { el.innerHTML = '<div class="oac-empty">No investments yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Client</th><th>Venture</th><th>Type</th><th>Invested</th><th>Ownership</th><th>Return</th><th>Status</th>
      </tr></thead><tbody>${invs.map(i => `
        <tr>
          <td>${esc((i.profiles && (i.profiles.full_name || i.profiles.email)) || i.user_id)}</td>
          <td>${esc(i.venture_name)}</td>
          <td>${esc(i.venture_type || '—')}</td>
          <td>${fmt.money(i.amount_invested)}</td>
          <td>${i.ownership_pct != null ? fmt.pct(i.ownership_pct) : '—'}</td>
          <td>${i.expected_return != null ? fmt.pct(i.expected_return) : '—'}</td>
          <td><span class="oac-badge ${esc(i.status || '')}">${esc(i.status || '—')}</span></td>
        </tr>`).join('')}</tbody></table>`;
  }

  function renderRaises(raises) {
    const el = document.getElementById('oac-raises');
    if (!raises.length) { el.innerHTML = '<div class="oac-empty">No raises yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Venture</th><th>Type</th><th>Goal</th><th>Raised</th><th>Min</th><th>IRR</th><th>Horizon</th><th>Status</th>
      </tr></thead><tbody>${raises.map(r => `
        <tr>
          <td>${esc(r.venture_name)}</td>
          <td>${esc(r.venture_type || '—')}</td>
          <td>${fmt.money(r.total_raise_target)}</td>
          <td>${fmt.money(r.amount_raised)}</td>
          <td>${fmt.money(r.minimum_investment)}</td>
          <td>${r.projected_return_min != null && r.projected_return_max != null ? r.projected_return_min + '–' + r.projected_return_max + '%' : '—'}</td>
          <td>${esc(r.investment_horizon || '—')}</td>
          <td><span class="oac-badge ${esc(r.status || '')}">${esc(r.status || '—')}</span></td>
        </tr>`).join('')}</tbody></table>`;
  }

  // ---------- bootstrap ----------
  // ---------- inject live data into the static demo's "Loan Applications" tab ----------
  function findStaticAppsContainer() {
    return document.getElementById('view-applications') ||
           document.getElementById('view-loans-app') ||
           null;
  }

  function paintStaticApplicationsView(applications) {
    const container = findStaticAppsContainer();
    if (!container) return false;
    if (container.dataset.onixLive === '1') {
      // Already wired — just refresh the tbody
      const body = container.querySelector('[data-onix-apps-body]');
      if (body) body.innerHTML = applicationsRows(applications);
      return true;
    }
    container.dataset.onixLive = '1';
    container.innerHTML = `
      <div style="padding:32px 40px;font-family:'DM Sans',sans-serif;color:#1A1A1A">
        <div style="font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#C0392B;font-weight:600">Live · Supabase</div>
        <h1 style="font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:2rem;margin:6px 0 18px">Loan Applications</h1>
        <div style="background:#fff;border:1px solid #E8E8E8;border-top:3px solid #C0392B;padding:18px">
          <table class="oac-table" style="width:100%;border-collapse:collapse;font-size:.85rem">
            <thead><tr>
              <th>Submitted</th><th>Client</th><th>Amount</th><th>Type</th><th>Purpose</th><th>Status</th>
            </tr></thead>
            <tbody data-onix-apps-body>${applicationsRows(applications)}</tbody>
          </table>
        </div>
      </div>`;
    return true;
  }

  function applicationsRows(apps) {
    if (!apps || !apps.length) {
      return '<tr><td colspan="6" class="oac-empty">No applications submitted yet.</td></tr>';
    }
    return apps.map(a => `
      <tr>
        <td>${fmt.date(a.submitted_at)}</td>
        <td>${esc((a.profiles && (a.profiles.full_name || a.profiles.email)) || a.user_id)}</td>
        <td>${fmt.money(a.amount_requested)}</td>
        <td>${esc(a.applicant_type || '—')}</td>
        <td>${esc(a.purpose || '—')}</td>
        <td><span class="oac-badge ${esc(a.status || '')}">${esc(a.status || '—')}</span></td>
      </tr>`).join('');
  }

  // Watch for the static view to appear (the admin design renders async)
  function wireStaticApplicationsView(applications) {
    if (paintStaticApplicationsView(applications)) return;
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (paintStaticApplicationsView(applications) || attempts > 60) clearInterval(iv);
    }, 500);
  }

  async function refreshAll() {
    const greeting = document.getElementById('oac-greeting');
    if (greeting) greeting.textContent = 'Loading data…';
    try {
      const [clients, pending, loans, investments, raises, applications] = await Promise.all([
        OnixDB.getAllClients(),
        OnixDB.getPendingClients(),
        OnixDB.getAllLoans(),
        OnixDB.getAllInvestments(),
        OnixDB.getAllRaises(),
        OnixDB.getAllApplications()
      ]);
      renderOverview({ clients, pending, loans, investments, raises, applications });
      renderApprovals(pending);
      renderClients(clients);
      renderApplications(applications);
      renderLoans(loans);
      renderInvestments(investments);
      renderRaises(raises);
      wireStaticApplicationsView(applications);
      if (greeting) greeting.textContent = `Loaded · ${clients.length} clients · ${pending.length} pending · ${loans.length} loans · ${applications.length} applications`;
    } catch (ex) {
      console.error('[onix-admin]', ex);
      if (greeting) greeting.textContent = 'Error loading data — see console';
    }
  }

  async function bootstrap() {
    const gate = await OnixDB.requireAdmin();
    if (!gate) return;
    injectStyles();
    buildPanel();
    document.getElementById('oac-greeting').textContent = 'Signed in as ' + (gate.profile.full_name || gate.profile.email);
    // Load data eagerly so the static "Loan Applications" tab is populated
    // even before the admin opens the Live Admin Console.
    refreshAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();
