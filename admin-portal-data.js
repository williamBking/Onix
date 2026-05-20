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
      .oac-modal-backdrop{position:fixed;inset:0;background:rgba(26,26,26,.55);z-index:100000;display:none;align-items:center;justify-content:center;padding:24px}
      .oac-modal-backdrop.open{display:flex}
      .oac-modal{background:#fff;max-width:720px;width:100%;max-height:88vh;overflow-y:auto;border:1px solid #E8E8E8;border-top:3px solid #C0392B;padding:28px 32px}
      .oac-modal h2{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:1.6rem;margin:0 0 4px}
      .oac-modal .sub{font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.12em;margin-bottom:18px}
      .oac-modal-row{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-bottom:18px}
      .oac-modal-row .k{font-size:.62rem;color:#888;letter-spacing:.1em;text-transform:uppercase;font-weight:700;margin-bottom:2px}
      .oac-modal-row .v{font-size:.92rem;color:#1A1A1A;font-weight:500}
      .oac-modal-docs h3{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#1A1A1A;font-weight:700;margin:8px 0 10px;padding-top:14px;border-top:1px solid #E8E8E8}
      .oac-modal-docs .row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f4f4f4}
      .oac-modal-docs a{color:#C0392B;font-weight:600;font-size:.85rem;text-decoration:none}
      .oac-modal-foot{margin-top:20px;display:flex;justify-content:flex-end;gap:8px;padding-top:14px;border-top:1px solid #E8E8E8}
    `;
    document.head.appendChild(s);
  }

  // ---------- detail modal ----------
  function ensureModal() {
    let m = document.getElementById('oac-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'oac-modal';
    m.className = 'oac-modal-backdrop';
    m.innerHTML = `<div class="oac-modal" role="dialog" aria-modal="true">
      <div data-modal-body></div>
      <div class="oac-modal-foot">
        <button class="oac-btn outline" data-modal-close>Close</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.hasAttribute('data-modal-close')) m.classList.remove('open');
    });
    return m;
  }

  function openModal(html) {
    const m = ensureModal();
    m.querySelector('[data-modal-body]').innerHTML = html;
    m.classList.add('open');
  }

  function detailRow(k, v) {
    return `<div><div class="k">${esc(k)}</div><div class="v">${v == null || v === '' ? '—' : esc(v)}</div></div>`;
  }

  function docsBlock(title, docs) {
    if (!docs || !docs.length) return '';
    return `<div class="oac-modal-docs"><h3>${esc(title)}</h3>${docs.map(d => `
      <div class="row">
        <div>${esc(d.name)}</div>
        ${d.dropbox_url ? `<a href="${esc(d.dropbox_url)}" target="_blank" rel="noopener">Open ↗</a>` : '<span style="color:#888;font-size:.8rem">—</span>'}
      </div>`).join('')}</div>`;
  }

  function viewLoan(loan) {
    const c = loan.profiles || {};
    openModal(`
      <h2>Loan ${esc(loan.loan_id_display || loan.id.slice(0,8))}</h2>
      <div class="sub">${esc(c.full_name || c.email || 'Unknown client')}</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <a href="#" data-edit-loan style="display:inline-block;background:#C0392B;color:#fff;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;text-decoration:none">Edit Loan</a>
        <a href="#" data-add-payment style="display:inline-block;background:#fff;color:#1A1A1A;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;text-decoration:none">+ Add Payment</a>
      </div>
      <div class="oac-modal-row">
        ${detailRow('Balance', fmt.money(loan.balance))}
        ${detailRow('Interest Rate', fmt.pct(loan.interest_rate))}
        ${detailRow('Monthly Payment', fmt.money(loan.monthly_payment))}
        ${detailRow('Next Due', fmt.date(loan.next_due_date))}
        ${detailRow('Origination Date', fmt.date(loan.origination_date))}
        ${detailRow('Maturity Date', fmt.date(loan.maturity_date))}
        ${detailRow('Term (months)', loan.term_months)}
        ${detailRow('Origination Fee', loan.origination_fee != null ? loan.origination_fee + '%' : null)}
        ${detailRow('Status', loan.status)}
        ${detailRow('Created', fmt.date(loan.created_at))}
      </div>
      <div class="oac-modal-row" style="grid-template-columns:1fr">
        ${detailRow('Collateral Address', loan.collateral_address)}
      </div>
      ${docsManagerHtml(loan.loan_documents)}
    `);
    const m = document.getElementById('oac-modal');
    m.querySelector('[data-edit-loan]').addEventListener('click', (e) => { e.preventDefault(); openEditLoanModal(loan); });
    m.querySelector('[data-add-payment]').addEventListener('click', (e) => { e.preventDefault(); openAddPaymentModal(loan); });
    wireDocsManager(m, 'loan_documents', 'loan_id', loan.id);
  }

  function viewInvestment(inv) {
    const c = inv.profiles || {};
    openModal(`
      <h2>${esc(inv.venture_name)}</h2>
      <div class="sub">${esc(c.full_name || c.email || 'Unknown client')}</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <a href="#" data-edit-inv style="display:inline-block;background:#C0392B;color:#fff;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;text-decoration:none">Edit Investment</a>
        <a href="#" data-add-dist style="display:inline-block;background:#fff;color:#1A1A1A;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;text-decoration:none">+ Add Distribution</a>
      </div>
      <div class="oac-modal-row">
        ${detailRow('Type', inv.venture_type)}
        ${detailRow('Amount Invested', fmt.money(inv.amount_invested))}
        ${detailRow('Ownership', inv.ownership_pct != null ? fmt.pct(inv.ownership_pct) : null)}
        ${detailRow('Expected Return', inv.expected_return != null ? fmt.pct(inv.expected_return) : null)}
        ${detailRow('Start Date', fmt.date(inv.start_date))}
        ${detailRow('Status', inv.status)}
        ${detailRow('Created', fmt.date(inv.created_at))}
      </div>
      ${docsManagerHtml(inv.investment_documents)}
    `);
    const m = document.getElementById('oac-modal');
    m.querySelector('[data-edit-inv]').addEventListener('click', (e) => { e.preventDefault(); openEditInvestmentModal(inv); });
    m.querySelector('[data-add-dist]').addEventListener('click', (e) => { e.preventDefault(); openAddDistributionModal(inv); });
    wireDocsManager(m, 'investment_documents', 'investment_id', inv.id);
  }

  function viewApplication(app) {
    const c = app.profiles || {};
    const statusBtn = (label, status, color) => `
      <a href="#" data-app-status="${esc(status)}" style="display:inline-block;background:${color === 'red' ? '#C0392B' : '#fff'};color:${color === 'red' ? '#fff' : '#1A1A1A'};padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid ${color === 'red' ? '#C0392B' : '#E8E8E8'};border-radius:2px;text-decoration:none">${esc(label)}</a>`;
    openModal(`
      <h2>Loan Application</h2>
      <div class="sub">${esc(c.full_name || c.email || 'Unknown client')} · ${fmt.date(app.submitted_at)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${statusBtn('Approve', 'approved', 'red')}
        ${statusBtn('Mark Reviewed', 'reviewed')}
        ${statusBtn('Reject', 'rejected')}
        ${statusBtn('Reset to Pending', 'pending')}
      </div>
      <div class="oac-modal-row">
        ${detailRow('Amount Requested', fmt.money(app.amount_requested))}
        ${detailRow('Applicant Type', app.applicant_type)}
        ${detailRow('Status', app.status)}
        ${detailRow('Submitted', fmt.date(app.submitted_at))}
      </div>
      <div class="oac-modal-row" style="grid-template-columns:1fr">
        ${detailRow('Purpose', app.purpose)}
      </div>
      <div class="oac-modal-row" style="grid-template-columns:1fr">
        ${detailRow('Notes', app.notes)}
      </div>
      <div class="oac-modal-row" style="grid-template-columns:1fr">
        ${detailRow('Client Email', c.email)}
      </div>
    `);
    const m = document.getElementById('oac-modal');
    m.querySelectorAll('[data-app-status]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newStatus = btn.dataset.appStatus;
        const prevStatus = app.status;
        btn.style.opacity = '.5';

        // Approving an application should also create an active loan record,
        // unless one was already created previously for this application.
        if (newStatus === 'approved' && prevStatus !== 'approved') {
          const created = await ensureLoanFromApplication(app);
          if (created === false) { btn.style.opacity = '1'; return; }
        }

        // Un-approving (pending/reviewed/rejected) should remove the loan that
        // was created by the previous approve, so Active Loans stays accurate.
        if (prevStatus === 'approved' && newStatus !== 'approved') {
          const removed = await removeLoanFromApplication(app);
          if (removed === false) { btn.style.opacity = '1'; return; }
        }

        const { error } = await OnixDB.client.from('loan_applications').update({ status: newStatus }).eq('id', app.id);
        if (error) { alert(error.message); btn.style.opacity = '1'; return; }
        // Keep the local copy in sync so a follow-up click in the same modal
        // sees the latest status (prevents accidental duplicate work).
        app.status = newStatus;
        m.classList.remove('open');
        refreshAll();
      });
    });
  }

  // Create an Active Loan row from an approved application, if one doesn't
  // already exist. Returns true on success (or skipped because a loan already
  // exists), false on hard failure so the caller can stop.
  async function ensureLoanFromApplication(app) {
    try {
      const { data: existing, error: lookupErr } = await OnixDB.client
        .from('loans')
        .select('id')
        .eq('application_id', app.id)
        .limit(1);
      if (lookupErr) { alert('Loan lookup failed: ' + lookupErr.message); return false; }
      if (existing && existing.length) return true; // already created on a previous approve — no-op

      // Generate a human-friendly loan id like ONX-YYYY-NNNN.
      const year = new Date().getFullYear();
      const { count: yearCount, error: countErr } = await OnixDB.client
        .from('loans')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', year + '-01-01T00:00:00Z')
        .lt('created_at',  (year + 1) + '-01-01T00:00:00Z');
      if (countErr) { /* non-fatal — fall back to a uuid-based id */ }
      const seq = String((yearCount || 0) + 1).padStart(4, '0');
      const loan_id_display = 'ONX-' + year + '-' + seq;

      const today = new Date().toISOString().slice(0, 10);
      const insertRow = {
        application_id:   app.id,
        user_id:          app.user_id,
        loan_id_display,
        principal_amount: app.amount_requested,
        balance:          app.amount_requested,
        status:           'active',
        origination_date: today
      };

      const { error: insertErr } = await OnixDB.client.from('loans').insert(insertRow);
      if (insertErr) {
        alert('Loan creation failed: ' + insertErr.message + '\n\nApplication was not approved.');
        return false;
      }
      // Soft confirmation so the admin knows the loan exists and where to finish it
      console.log('[onix] Created loan ' + loan_id_display + ' from approved application ' + app.id);
      return true;
    } catch (err) {
      alert('Unexpected error creating loan: ' + (err && err.message ? err.message : err));
      return false;
    }
  }

  // Reverse of ensureLoanFromApplication: when admin moves an approved
  // application back to pending / reviewed / rejected, remove the auto-created
  // loan so Active Loans reflects reality. If the loan already has recorded
  // payments, refuse to delete and surface a clear warning — those payments
  // represent real money movement and should be handled deliberately by admin.
  async function removeLoanFromApplication(app) {
    try {
      const { data: loans, error: lookupErr } = await OnixDB.client
        .from('loans')
        .select('id, loan_id_display')
        .eq('application_id', app.id);
      if (lookupErr) { alert('Loan lookup failed: ' + lookupErr.message); return false; }
      if (!loans || !loans.length) return true; // nothing to remove

      // Check for payment activity on any of those loans
      const loanIds = loans.map(l => l.id);
      const { count: paymentCount, error: payErr } = await OnixDB.client
        .from('loan_payments')
        .select('id', { count: 'exact', head: true })
        .in('loan_id', loanIds);
      if (payErr) { alert('Payment check failed: ' + payErr.message); return false; }

      if (paymentCount && paymentCount > 0) {
        alert(
          'Cannot change status — the loan created from this application already has ' +
          paymentCount + ' payment record' + (paymentCount === 1 ? '' : 's') + '.\n\n' +
          'Delete the payments or close the loan manually first.'
        );
        return false;
      }

      const { error: delErr } = await OnixDB.client.from('loans').delete().in('id', loanIds);
      if (delErr) { alert('Loan removal failed: ' + delErr.message); return false; }
      console.log('[onix] Removed ' + loans.length + ' loan(s) tied to application ' + app.id);
      return true;
    } catch (err) {
      alert('Unexpected error removing loan: ' + (err && err.message ? err.message : err));
      return false;
    }
  }

  function viewRaise(r) {
    openModal(`
      <h2>${esc(r.venture_name)}</h2>
      <div class="sub">${esc(r.venture_type || '—')}${r.investment_horizon ? ' · ' + esc(r.investment_horizon) : ''}</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <a href="#" data-edit-raise style="display:inline-block;background:#C0392B;color:#fff;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;text-decoration:none">Edit Raise</a>
        ${r.status === 'open'
          ? `<a href="#" data-close-raise style="display:inline-block;background:#fff;color:#1A1A1A;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;text-decoration:none">Close Raise</a>`
          : `<a href="#" data-reopen-raise style="display:inline-block;background:#fff;color:#1A1A1A;padding:8px 14px;font:600 .7rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;text-decoration:none">Reopen Raise</a>`}
      </div>
      <div style="font-size:.9rem;line-height:1.55;color:#1A1A1A;margin-bottom:18px">${esc(r.description || 'No description provided.')}</div>
      <div class="oac-modal-row">
        ${detailRow('Total Raise', fmt.money(r.total_raise_target))}
        ${detailRow('Amount Raised', fmt.money(r.amount_raised))}
        ${detailRow('Minimum', fmt.money(r.minimum_investment))}
        ${detailRow('Projected Return', (r.projected_return_min != null && r.projected_return_max != null) ? r.projected_return_min + '–' + r.projected_return_max + '%' : null)}
        ${detailRow('Investment Horizon', r.investment_horizon)}
        ${detailRow('Structure', r.structure)}
        ${detailRow('Status', r.status)}
        ${detailRow('Created', fmt.date(r.created_at))}
      </div>
      <div id="oac-raise-interests" data-raise-id="${esc(r.id)}" style="margin:18px 0">
        <h3 style="font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#6B6560;font-weight:700;margin:0 0 10px">Interested Investors</h3>
        <div data-interests-body style="font-size:.85rem;color:#6B6560">Loading interests…</div>
      </div>
      ${docsManagerHtml(r.raise_documents)}
    `);
    const m = document.getElementById('oac-modal');
    m.querySelector('[data-edit-raise]').addEventListener('click', (e) => { e.preventDefault(); openEditRaiseModal(r); });
    const close = m.querySelector('[data-close-raise]');
    if (close) close.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Close this raise? Clients will no longer see it in Opportunities.')) return;
      const { error } = await OnixDB.client.from('raises').update({ status: 'closed' }).eq('id', r.id);
      if (error) return alert(error.message);
      document.getElementById('oac-modal').classList.remove('open');
      refreshAll();
    });
    const reopen = m.querySelector('[data-reopen-raise]');
    if (reopen) reopen.addEventListener('click', async (e) => {
      e.preventDefault();
      const { error } = await OnixDB.client.from('raises').update({ status: 'open' }).eq('id', r.id);
      if (error) return alert(error.message);
      document.getElementById('oac-modal').classList.remove('open');
      refreshAll();
    });
    wireDocsManager(m, 'raise_documents', 'raise_id', r.id);
    renderRaiseInterests(r.id);
  }

  // Pull all expressed-interest rows for this raise + the client profile,
  // render them in the "Interested Investors" panel of the raise modal, and
  // wire Approve / Dismiss / Contact buttons.
  async function renderRaiseInterests(raiseId) {
    const wrap = document.getElementById('oac-raise-interests');
    if (!wrap) return;
    const body = wrap.querySelector('[data-interests-body]');
    const { data, error } = await OnixDB.client
      .from('raise_interests')
      .select('id, status, submitted_at, responded_at, profiles(full_name, email)')
      .eq('raise_id', raiseId)
      .order('submitted_at', { ascending: false });
    if (error) { body.textContent = 'Could not load interests: ' + error.message; return; }
    if (!data || !data.length) {
      body.innerHTML = '<div style="padding:10px 0;font-style:italic">No investors have expressed interest yet.</div>';
      return;
    }
    const statusBadge = (s) => {
      const map = { new: ['#FAE8E8', '#C0392B', 'New'],
                    approved: ['#EBF5EB', '#3B8B3B', 'Approved'],
                    dismissed: ['#F0F0F0', '#888', 'Dismissed'] };
      const [bg, fg, label] = map[s] || ['#F0F0F0', '#888', s];
      return `<span style="display:inline-block;padding:2px 8px;background:${bg};color:${fg};font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;border-radius:2px">${label}</span>`;
    };
    body.innerHTML = data.map(i => {
      const p = i.profiles || {};
      const name = p.full_name || p.email || 'Unknown investor';
      const when = fmt.date(i.submitted_at);
      const canAct = i.status === 'new';
      return `
        <div data-interest-row="${esc(i.id)}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #E8E8E8;border-radius:2px;margin-bottom:6px;background:#fff">
          <div>
            <div style="font-weight:600;color:#1A1A1A">${esc(name)}</div>
            <div style="font-size:.74rem;color:#888;margin-top:2px">${esc(p.email || '—')} · expressed ${esc(when)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            ${statusBadge(i.status)}
            ${p.email ? `<a class="oac-btn outline" style="font-size:.66rem;padding:5px 10px" href="mailto:${esc(p.email)}?subject=${encodeURIComponent('Onix Finance · investment opportunity follow-up')}">Contact</a>` : ''}
            ${canAct ? `<button data-interest-approve="${esc(i.id)}" style="background:#C0392B;color:#fff;border:1px solid #C0392B;padding:5px 10px;font:600 .66rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border-radius:2px;cursor:pointer">Approve</button>
                       <button data-interest-dismiss="${esc(i.id)}" style="background:#fff;color:#1A1A1A;border:1px solid #E8E8E8;padding:5px 10px;font:600 .66rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border-radius:2px;cursor:pointer">Dismiss</button>` : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-interest-approve]').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        b.disabled = true; b.style.opacity = '.5';
        const ok = await OnixDB.setRaiseInterestStatus(b.dataset.interestApprove, 'approved');
        if (!ok) { b.disabled = false; b.style.opacity = '1'; return; }
        renderRaiseInterests(raiseId);
      });
    });
    wrap.querySelectorAll('[data-interest-dismiss]').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        b.disabled = true; b.style.opacity = '.5';
        const ok = await OnixDB.setRaiseInterestStatus(b.dataset.interestDismiss, 'dismissed');
        if (!ok) { b.disabled = false; b.style.opacity = '1'; return; }
        renderRaiseInterests(raiseId);
      });
    });
  }

  function contactBtn(email, label) {
    if (!email) return '<button class="oac-btn outline" disabled>No email</button>';
    return `<a class="oac-btn outline" href="mailto:${esc(email)}${label ? '?subject=' + encodeURIComponent(label) : ''}">Contact</a>`;
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
        <th>Loan ID</th><th>Client</th><th>Balance</th><th>Rate</th><th>Payment</th><th>Next Due</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${loans.map((l, i) => `
        <tr>
          <td>${esc(l.loan_id_display || l.id.slice(0,8))}</td>
          <td>${esc((l.profiles && (l.profiles.full_name || l.profiles.email)) || l.user_id)}</td>
          <td>${fmt.money(l.balance)}</td>
          <td>${fmt.pct(l.interest_rate)}</td>
          <td>${fmt.money(l.monthly_payment)}</td>
          <td>${fmt.date(l.next_due_date)}</td>
          <td><span class="oac-badge ${esc(l.status || '')}">${esc(l.status || '—')}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="oac-btn red" data-view-loan="${i}">View</button>
            ${contactBtn(l.profiles && l.profiles.email, 'Onix Finance · Loan ' + (l.loan_id_display || ''))}
          </td>
        </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-view-loan]').forEach(b => {
      b.addEventListener('click', () => viewLoan(loans[Number(b.dataset.viewLoan)]));
    });
  }

  function renderInvestments(invs) {
    const el = document.getElementById('oac-investments');
    if (!invs.length) { el.innerHTML = '<div class="oac-empty">No investments yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Client</th><th>Venture</th><th>Type</th><th>Invested</th><th>Ownership</th><th>Return</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${invs.map((i, idx) => `
        <tr>
          <td>${esc((i.profiles && (i.profiles.full_name || i.profiles.email)) || i.user_id)}</td>
          <td>${esc(i.venture_name)}</td>
          <td>${esc(i.venture_type || '—')}</td>
          <td>${fmt.money(i.amount_invested)}</td>
          <td>${i.ownership_pct != null ? fmt.pct(i.ownership_pct) : '—'}</td>
          <td>${i.expected_return != null ? fmt.pct(i.expected_return) : '—'}</td>
          <td><span class="oac-badge ${esc(i.status || '')}">${esc(i.status || '—')}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="oac-btn red" data-view-inv="${idx}">View</button>
            ${contactBtn(i.profiles && i.profiles.email, 'Onix Finance · ' + (i.venture_name || ''))}
          </td>
        </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-view-inv]').forEach(b => {
      b.addEventListener('click', () => viewInvestment(invs[Number(b.dataset.viewInv)]));
    });
  }

  function renderRaises(raises) {
    const el = document.getElementById('oac-raises');
    if (!raises.length) { el.innerHTML = '<div class="oac-empty">No raises yet.</div>'; return; }
    el.innerHTML = `
      <table class="oac-table"><thead><tr>
        <th>Venture</th><th>Type</th><th>Goal</th><th>Raised</th><th>Min</th><th>IRR</th><th>Horizon</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${raises.map((r, idx) => `
        <tr>
          <td>${esc(r.venture_name)}</td>
          <td>${esc(r.venture_type || '—')}</td>
          <td>${fmt.money(r.total_raise_target)}</td>
          <td>${fmt.money(r.amount_raised)}</td>
          <td>${fmt.money(r.minimum_investment)}</td>
          <td>${r.projected_return_min != null && r.projected_return_max != null ? r.projected_return_min + '–' + r.projected_return_max + '%' : '—'}</td>
          <td>${esc(r.investment_horizon || '—')}</td>
          <td><span class="oac-badge ${esc(r.status || '')}">${esc(r.status || '—')}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="oac-btn red" data-view-raise="${idx}">View</button>
            <a class="oac-btn outline" href="mailto:info@onixfinance.com?subject=${encodeURIComponent('Onix Finance · ' + r.venture_name)}">Contact</a>
          </td>
        </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-view-raise]').forEach(b => {
      b.addEventListener('click', () => viewRaise(raises[Number(b.dataset.viewRaise)]));
    });
  }

  // ---------- bootstrap ----------
  // ---------- replace demo content in static admin tabs with live data ----------
  // Strategy: for each known view container, wipe its inner HTML and render
  // a clean Onix-styled table populated from Supabase.

  // The admin design uses these real view IDs (confirmed by grepping the source):
  //   view-dashboard, view-clients, view-investors, view-loans, view-raises,
  //   view-applications, view-review, view-documents, view-reports, view-users
  const STATIC_VIEWS = {
    clients:     ['view-clients', 'view-users'],
    loans:       ['view-loans'],
    investments: ['view-investors'],
    raises:      ['view-raises'],
    applications:['view-applications']
  };

  // Marker so we know we've already painted a view (and to detect when the
  // admin's own code has re-rendered it back to demo content).
  const LIVE_MARKER = 'oac-live-painted';

  function findView(idList) {
    for (const id of idList) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function viewShell(title, subtitle, innerHtml) {
    return `
      <div class="${LIVE_MARKER}" style="padding:32px 40px;font-family:'DM Sans',sans-serif;color:#1A1A1A">
        <div style="font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#C0392B;font-weight:600">Live · Supabase</div>
        <h1 style="font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:2rem;margin:6px 0 6px">${esc(title)}</h1>
        <div style="width:40px;height:2px;background:#C0392B;margin-bottom:18px"></div>
        ${subtitle ? `<div style="font-size:.85rem;color:#888;margin-bottom:18px">${esc(subtitle)}</div>` : ''}
        <div style="background:#fff;border:1px solid #E8E8E8;border-top:3px solid #C0392B;padding:18px">
          ${innerHtml}
        </div>
      </div>`;
  }

  function alreadyPainted(viewEl) {
    return !!(viewEl && viewEl.querySelector('.' + LIVE_MARKER));
  }

  function findDashboardView() {
    // Try the known id list first
    const direct = findView(STATIC_VIEWS.dashboard);
    if (direct) return direct;
    // Fallback: scan visible .view elements whose heading mentions Dashboard / Overview
    const views = document.querySelectorAll('.view, [id^="view-"], main, section');
    for (const v of views) {
      const h = v.querySelector('h1, h2, .page-title, .eyebrow');
      if (h && /dashboard|overview|welcome/i.test((h.textContent || ''))) return v;
    }
    return null;
  }

  function paintDashboardView(data) {
    const v = findDashboardView();
    if (!v) { console.warn('[onix-admin] dashboard view not found in DOM'); return false; }
    if (alreadyPainted(v)) return true;
    console.log('[onix-admin] painting dashboard into', v.id || v.tagName);
    const { clients, loans, investments, raises, applications, payments, distributions } = data;
    const activeLoans       = loans.filter(l => l.status === 'active');
    const activeInvestments = investments.filter(i => i.status === 'active');
    const openRaises        = raises.filter(r => r.status === 'open');
    const pendingClients    = clients.filter(c => c.status === 'pending');
    const pendingApps       = applications.filter(a => !a.status || a.status === 'pending');

    const loanPortfolio = activeLoans.reduce((s, l) => s + Number(l.balance || 0), 0);
    const totalDeposits = activeInvestments
      .filter(i => i.venture_type === 'deposit')
      .reduce((s, i) => s + Number(i.amount_invested || 0), 0);
    const totalEquity = activeInvestments
      .filter(i => i.venture_type !== 'deposit')
      .reduce((s, i) => s + Number(i.amount_invested || 0), 0);

    // KPI grid
    const kpi = (label, val, sub) => `
      <div style="background:#fff;border:1px solid #E8E8E8;border-top:3px solid #C0392B;padding:24px 22px">
        <div style="font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:8px">${esc(label)}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.9rem;color:#C0392B;font-weight:500;line-height:1">${esc(val)}</div>
        ${sub ? `<div style="font-size:.72rem;color:#888;margin-top:6px">${esc(sub)}</div>` : ''}
      </div>`;

    // Recent activity feed — pull from multiple sources, sort by timestamp desc
    const events = [];
    applications.slice(0, 10).forEach(a => events.push({
      ts: new Date(a.submitted_at),
      label: 'Loan application submitted',
      detail: ((a.profiles && (a.profiles.full_name || a.profiles.email)) || 'Client') + ' · ' + fmt.money(a.amount_requested),
      kind: 'application'
    }));
    clients.slice(0, 10).forEach(c => events.push({
      ts: new Date(c.created_at),
      label: c.status === 'pending' ? 'New client signed up (pending)' : 'Client added',
      detail: (c.full_name || c.email),
      kind: 'client'
    }));
    payments.filter(p => p.paid_at).slice(0, 10).forEach(p => events.push({
      ts: new Date(p.paid_at),
      label: 'Loan payment received',
      detail: ((p.loans && p.loans.profiles && p.loans.profiles.full_name) || 'Client') + ' · ' + fmt.money(p.amount_due),
      kind: 'payment'
    }));
    distributions.slice(0, 10).forEach(d => events.push({
      ts: new Date(d.paid_at),
      label: 'Distribution paid',
      detail: ((d.investments && d.investments.profiles && d.investments.profiles.full_name) || 'Client') + ' · ' + fmt.money(d.amount) + ' · ' + ((d.investments && d.investments.venture_name) || ''),
      kind: 'distribution'
    }));
    events.sort((a, b) => b.ts - a.ts);
    const activityRows = events.slice(0, 12).map(e => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #f4f4f4">
        <div>
          <div style="font-size:.88rem;font-weight:600;color:#1A1A1A">${esc(e.label)}</div>
          <div style="font-size:.78rem;color:#888;margin-top:2px">${esc(e.detail)}</div>
        </div>
        <div style="font-size:.72rem;color:#888;white-space:nowrap">${esc(fmt.date(e.ts))}</div>
      </div>`).join('');

    v.innerHTML = viewShell('Admin Dashboard', 'Portfolio snapshot, pending work, and recent activity',
      `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px">
        ${kpi('Loan Portfolio', fmt.money(loanPortfolio), activeLoans.length + ' active loan' + (activeLoans.length === 1 ? '' : 's'))}
        ${kpi('Total Deposits', fmt.money(totalDeposits), 'Onix Finance deposit instrument')}
        ${kpi('Equity Investments', fmt.money(totalEquity), activeInvestments.filter(i => i.venture_type !== 'deposit').length + ' position' + (activeInvestments.filter(i => i.venture_type !== 'deposit').length === 1 ? '' : 's'))}
        ${kpi('Active Clients', String(clients.filter(c => c.role === 'client' && c.status === 'active').length), clients.length + ' total accounts')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px">
        ${kpi('Pending Approvals', String(pendingClients.length), pendingClients.length ? 'Review in Clients tab' : 'All caught up')}
        ${kpi('Applications', String(applications.length), pendingApps.length + ' pending review')}
        ${kpi('Open Raises', String(openRaises.length), fmt.money(openRaises.reduce((s, r) => s + Number(r.amount_raised || 0), 0)) + ' raised')}
        ${kpi('Distributions Paid', String(distributions.length), 'All-time count')}
      </div>
      <h2 style="font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:1.4rem;margin:24px 0 4px">Recent Activity</h2>
      <div style="width:40px;height:2px;background:#C0392B;margin-bottom:14px"></div>
      <div>${activityRows || '<div style="padding:18px 0;color:#888;font-style:italic">No activity yet.</div>'}</div>`);
    return true;
  }

  function paintClientsView(clients, loans, investments) {
    const v = findView(STATIC_VIEWS.clients); if (!v) return false;
    if (alreadyPainted(v)) return true;
    // Per-client loan / investment counts so the admin can see activity at a glance.
    const loanCounts = {}, invCounts = {};
    (loans || []).forEach(l => { loanCounts[l.user_id] = (loanCounts[l.user_id] || 0) + 1; });
    (investments || []).forEach(i => { invCounts[i.user_id] = (invCounts[i.user_id] || 0) + 1; });
    // Text-form of the Borrower / LP state — splitRoleColumn (admin-portal.html)
    // reads this textContent to seed the checkbox state when it rewrites the
    // Role column into two click-to-toggle cells.
    const roleText = (c) => {
      const b = !!c.is_borrower, l = !!c.is_lp;
      if (b && l) return 'Borrower + LP';
      if (b) return 'Borrower';
      if (l) return 'LP';
      return '—';
    };
    const rows = clients.length ? clients.map(c => `
      <tr data-profile-id="${esc(c.id)}">
        <td>${esc(c.full_name || '—')}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(roleText(c))}</td>
        <td>${loanCounts[c.id] || '—'}</td>
        <td>${invCounts[c.id] || '—'}</td>
        <td><span class="oac-badge ${esc(c.status || '')}">${esc(c.status || '—')}</span></td>
        <td>${fmt.date(c.created_at)}</td>
        <td style="white-space:nowrap">
          <button class="oac-btn outline" data-cl-view="1" type="button">View</button>
          <button class="oac-btn outline" data-cl-docs="1" type="button">Documents</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="8" class="oac-empty">No clients yet.</td></tr>';
    const newClientBtn = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <a href="#" id="oac-new-client-btn" style="display:inline-block;background:#C0392B;color:#fff;padding:10px 18px;font:600 .72rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.1em;border:1px solid #C0392B;border-radius:2px;text-decoration:none">+ New Client</a>
      </div>`;
    v.innerHTML = viewShell('Clients', 'All accounts in the system',
      newClientBtn +
      `<table class="oac-table" style="width:100%"><thead><tr>
        <th>Name</th><th>Email</th><th>Role</th><th>Loans</th><th>Investments</th><th>Status</th><th>Joined</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table>`);
    const btn = v.querySelector('#oac-new-client-btn');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); openNewClientModal(); });
    return true;
  }

  // ---------- shared form helpers ----------
  const INPUT_STYLE = "width:100%;padding:10px 12px;border:1px solid #E8E8E8;font-size:.9rem;font-family:inherit;outline:none;background:#fff";

  function field(label, name, opts) {
    opts = opts || {};
    const type = opts.type || 'text';
    const required = opts.required ? 'required' : '';
    const placeholder = opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : '';
    const step = opts.step ? `step="${esc(opts.step)}"` : '';
    const value = opts.value != null ? `value="${esc(opts.value)}"` : '';
    if (opts.textarea) {
      return `<div><div class="k">${esc(label)}</div><textarea name="${esc(name)}" ${required} ${placeholder} rows="3" style="${INPUT_STYLE};resize:vertical;min-height:60px"></textarea></div>`;
    }
    if (opts.select) {
      const options = opts.select.map(o =>
        typeof o === 'string'
          ? `<option value="${esc(o)}">${esc(o)}</option>`
          : `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)}</option>`
      ).join('');
      return `<div><div class="k">${esc(label)}</div><select name="${esc(name)}" ${required} style="${INPUT_STYLE}">${options}</select></div>`;
    }
    return `<div><div class="k">${esc(label)}</div><input name="${esc(name)}" type="${type}" ${required} ${placeholder} ${step} ${value} style="${INPUT_STYLE}"></div>`;
  }

  function clientOptions(clients) {
    return [{ value: '', label: '— Select client —' }]
      .concat((clients || [])
        .filter(c => c.role === 'client')
        .map(c => ({ value: c.id, label: (c.full_name || c.email) + ' · ' + c.email })));
  }

  function submitBar(submitLabel) {
    return `<div id="oac-form-err" style="color:#C0392B;font-size:.85rem;margin-bottom:10px;display:none"></div>
      <div class="oac-modal-foot" style="margin-top:0">
        <button type="button" class="oac-btn outline" data-modal-close>Cancel</button>
        <button type="submit" class="oac-btn red" data-form-submit>${esc(submitLabel)}</button>
      </div>`;
  }

  async function handleFormSubmit(form, payloadFn, table) {
    const submitBtn = form.querySelector('[data-form-submit]');
    const errEl = form.querySelector('#oac-form-err');
    errEl.style.display = 'none';
    const origLabel = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
    try {
      const payload = payloadFn();
      const { error } = await OnixDB.client.from(table).insert(payload);
      if (error) throw error;
      document.getElementById('oac-modal').classList.remove('open');
      refreshAll();
    } catch (ex) {
      errEl.style.display = 'block';
      errEl.textContent = ex.message || 'Could not save.';
      submitBtn.disabled = false;
      submitBtn.textContent = origLabel;
    }
  }

  function numOrNull(v) {
    const n = Number(String(v || '').replace(/[^0-9.\-]/g, ''));
    return isFinite(n) && String(v || '').trim() !== '' ? n : null;
  }
  function strOrNull(v) { const s = String(v || '').trim(); return s.length ? s : null; }
  function dateInput(v) { return v ? String(v).slice(0,10) : ''; }

  async function handleUpdateSubmit(form, table, id, payloadFn) {
    const submitBtn = form.querySelector('[data-form-submit]');
    const errEl = form.querySelector('#oac-form-err');
    errEl.style.display = 'none';
    const origLabel = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
    try {
      const payload = payloadFn();
      const { error } = await OnixDB.client.from(table).update(payload).eq('id', id);
      if (error) throw error;
      document.getElementById('oac-modal').classList.remove('open');
      refreshAll();
    } catch (ex) {
      errEl.style.display = 'block';
      errEl.textContent = ex.message || 'Could not save.';
      submitBtn.disabled = false;
      submitBtn.textContent = origLabel;
    }
  }

  // ---------- Document management (loan_documents / investment_documents / raise_documents) ----------
  // table: name of the docs table; parentCol: e.g. 'loan_id'; parentId: row id
  function docsManagerHtml(docs) {
    const list = (docs || []).map(d => `
      <div class="row" data-doc-id="${esc(d.id)}">
        <div style="flex:1">
          <div class="doc-name" style="font-weight:600;font-size:.88rem">${esc(d.name)}</div>
          ${d.dropbox_url ? `<a href="${esc(d.dropbox_url)}" target="_blank" rel="noopener" style="font-size:.78rem;color:#C0392B;text-decoration:none;word-break:break-all">${esc(d.dropbox_url)}</a>` : '<span style="color:#888;font-size:.78rem">No link</span>'}
        </div>
        <a href="#" data-doc-remove="${esc(d.id)}" style="color:#C0392B;font-size:.78rem;text-decoration:none;font-weight:600;margin-left:10px">Remove</a>
      </div>`).join('');
    return `
      <div class="oac-modal-docs" data-docs-manager>
        <h3>Documents</h3>
        <div data-docs-list>${list || '<div style="color:#888;font-size:.85rem;font-style:italic;padding:6px 0">No documents yet.</div>'}</div>
        <form data-doc-add-form style="margin-top:14px;display:grid;grid-template-columns:1.2fr 2fr auto;gap:8px;align-items:end">
          <div>
            <div class="k">Name</div>
            <input name="name" required placeholder="Promissory Note" style="${INPUT_STYLE}">
          </div>
          <div>
            <div class="k">Dropbox URL</div>
            <input name="dropbox_url" type="url" required placeholder="https://www.dropbox.com/..." style="${INPUT_STYLE}">
          </div>
          <button type="submit" class="oac-btn red" style="padding:10px 14px">Add</button>
        </form>
      </div>`;
  }

  function wireDocsManager(scope, table, parentCol, parentId, onChange) {
    const root = scope.querySelector('[data-docs-manager]');
    if (!root) return;
    // Remove
    root.querySelectorAll('[data-doc-remove]').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Remove this document?')) return;
        const id = a.dataset.docRemove;
        const { error } = await OnixDB.client.from(table).delete().eq('id', id);
        if (error) { alert(error.message); return; }
        if (typeof onChange === 'function') onChange();
        refreshAll();
      });
    });
    // Add
    const form = root.querySelector('[data-doc-add-form]');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const row = { name: strOrNull(fd.get('name')), dropbox_url: strOrNull(fd.get('dropbox_url')) };
        row[parentCol] = parentId;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true; submitBtn.textContent = 'Adding…';
        const { error } = await OnixDB.client.from(table).insert(row);
        if (error) { alert(error.message); submitBtn.disabled = false; submitBtn.textContent = 'Add'; return; }
        if (typeof onChange === 'function') onChange();
        refreshAll();
      });
    }
  }

  // ---------- Add Loan modal ----------
  function openAddLoanModal() {
    const clients = (window.__onixAdminData && window.__onixAdminData.clients) || [];
    openModal(`
      <h2>Add Loan</h2>
      <div class="sub">Attach a loan to an existing client</div>
      <form id="oac-add-loan-form">
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Client', 'user_id', { required: true, select: clientOptions(clients) })}
        </div>
        <div class="oac-modal-row">
          ${field('Loan ID',           'loan_id_display',  { placeholder: 'ONX-2026-0123' })}
          ${field('Status',            'status',           { required: true, select: [{value:'active',label:'Active',selected:true},'paid','review'] })}
          ${field('Outstanding Balance ($)', 'balance',    { type: 'number', step: '0.01', placeholder: '142500' })}
          ${field('Interest Rate (%)', 'interest_rate',    { type: 'number', step: '0.01', placeholder: '13.0' })}
          ${field('Monthly Payment ($)','monthly_payment', { type: 'number', step: '0.01', placeholder: '4218' })}
          ${field('Term (months)',     'term_months',      { type: 'number', placeholder: '24' })}
          ${field('Origination Date',  'origination_date', { type: 'date' })}
          ${field('Maturity Date',     'maturity_date',    { type: 'date' })}
          ${field('Next Due',          'next_due_date',    { type: 'date' })}
          ${field('Origination Fee (%)', 'origination_fee',{ type: 'number', step: '0.01', placeholder: '1.5' })}
        </div>
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Collateral Address', 'collateral_address', { placeholder: '1842 Montrose Blvd, Houston, TX 77006' })}
        </div>
        ${submitBar('Create Loan')}
      </form>`);
    const form = document.getElementById('oac-add-loan-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleFormSubmit(form, () => ({
        user_id:            String(fd.get('user_id')),
        loan_id_display:    strOrNull(fd.get('loan_id_display')),
        balance:            numOrNull(fd.get('balance')),
        interest_rate:      numOrNull(fd.get('interest_rate')),
        monthly_payment:    numOrNull(fd.get('monthly_payment')),
        term_months:        numOrNull(fd.get('term_months')),
        origination_date:   strOrNull(fd.get('origination_date')),
        maturity_date:      strOrNull(fd.get('maturity_date')),
        next_due_date:      strOrNull(fd.get('next_due_date')),
        origination_fee:    numOrNull(fd.get('origination_fee')),
        collateral_address: strOrNull(fd.get('collateral_address')),
        status:             String(fd.get('status'))
      }), 'loans');
    });
  }

  // ---------- Add Investment modal ----------
  function openAddInvestmentModal() {
    const clients = (window.__onixAdminData && window.__onixAdminData.clients) || [];
    openModal(`
      <h2>Add Investment</h2>
      <div class="sub">Record a client position in a venture</div>
      <form id="oac-add-inv-form">
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Client', 'user_id', { required: true, select: clientOptions(clients) })}
        </div>
        <div class="oac-modal-row">
          ${field('Venture Name',      'venture_name',      { required: true, placeholder: 'Bari Caffè Houston' })}
          ${field('Type',              'venture_type',      { required: true, select: [{value:'equity',label:'Equity'},{value:'deposit',label:'Deposit'}] })}
          ${field('Amount Invested ($)','amount_invested',  { type: 'number', step: '0.01', required: true, placeholder: '50000' })}
          ${field('Ownership (%)',     'ownership_pct',     { type: 'number', step: '0.01', placeholder: 'Optional' })}
          ${field('Expected Return (%)','expected_return',  { type: 'number', step: '0.01', placeholder: '9.5' })}
          ${field('Start Date',        'start_date',        { type: 'date' })}
          ${field('Status',            'status',            { required: true, select: [{value:'active',label:'Active',selected:true},'pending','exited'] })}
        </div>
        ${submitBar('Create Investment')}
      </form>`);
    const form = document.getElementById('oac-add-inv-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleFormSubmit(form, () => ({
        user_id:         String(fd.get('user_id')),
        venture_name:    strOrNull(fd.get('venture_name')),
        venture_type:    strOrNull(fd.get('venture_type')),
        amount_invested: numOrNull(fd.get('amount_invested')),
        ownership_pct:   numOrNull(fd.get('ownership_pct')),
        expected_return: numOrNull(fd.get('expected_return')),
        start_date:      strOrNull(fd.get('start_date')),
        status:          String(fd.get('status'))
      }), 'investments');
    });
  }

  // ---------- Add Raise modal ----------
  function openAddRaiseModal() {
    openModal(`
      <h2>Add Raise</h2>
      <div class="sub">Open a new investment opportunity to clients</div>
      <form id="oac-add-raise-form">
        <div class="oac-modal-row">
          ${field('Venture Name',           'venture_name',         { required: true, placeholder: 'Bari — Houston Heights' })}
          ${field('Type',                   'venture_type',         { required: true, select: [{value:'equity',label:'Equity'},{value:'deposit',label:'Deposit'}] })}
          ${field('Total Raise Target ($)', 'total_raise_target',   { type: 'number', step: '1', required: true, placeholder: '3500000' })}
          ${field('Amount Raised ($)',      'amount_raised',        { type: 'number', step: '1', placeholder: '0' })}
          ${field('Minimum Investment ($)', 'minimum_investment',   { type: 'number', step: '1', placeholder: '25000' })}
          ${field('Investment Horizon',     'investment_horizon',   { placeholder: '24-36 months' })}
          ${field('Projected Return Min (%)','projected_return_min',{ type: 'number', step: '0.01', placeholder: '14' })}
          ${field('Projected Return Max (%)','projected_return_max',{ type: 'number', step: '0.01', placeholder: '18' })}
          ${field('Status',                 'status',               { required: true, select: [{value:'open',label:'Open',selected:true},{value:'closed',label:'Closed'}] })}
        </div>
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Structure', 'structure', { placeholder: 'Preferred equity with 9% pref + 70/30 split above' })}
          ${field('Description', 'description', { textarea: true, placeholder: 'Short overview clients see on the opportunity card' })}
        </div>
        ${submitBar('Create Raise')}
      </form>`);
    const form = document.getElementById('oac-add-raise-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleFormSubmit(form, () => ({
        venture_name:         strOrNull(fd.get('venture_name')),
        venture_type:         strOrNull(fd.get('venture_type')),
        description:          strOrNull(fd.get('description')),
        total_raise_target:   numOrNull(fd.get('total_raise_target')),
        amount_raised:        numOrNull(fd.get('amount_raised')) ?? 0,
        minimum_investment:   numOrNull(fd.get('minimum_investment')),
        projected_return_min: numOrNull(fd.get('projected_return_min')),
        projected_return_max: numOrNull(fd.get('projected_return_max')),
        investment_horizon:   strOrNull(fd.get('investment_horizon')),
        structure:            strOrNull(fd.get('structure')),
        status:               String(fd.get('status'))
      }), 'raises');
    });
  }

  // ---------- Edit Loan modal ----------
  function openEditLoanModal(loan) {
    const clients = (window.__onixAdminData && window.__onixAdminData.clients) || [];
    const clientOpts = clientOptions(clients).map(o => ({ ...o, selected: o.value === loan.user_id }));
    openModal(`
      <h2>Edit Loan</h2>
      <div class="sub">${esc(loan.loan_id_display || loan.id.slice(0,8))}</div>
      <form id="oac-edit-loan-form">
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Client', 'user_id', { required: true, select: clientOpts })}
        </div>
        <div class="oac-modal-row">
          ${field('Loan ID',           'loan_id_display',  { value: loan.loan_id_display })}
          ${field('Status',            'status',           { required: true, select: [
              { value: 'active', label: 'Active', selected: loan.status === 'active' },
              { value: 'paid',   label: 'Paid',   selected: loan.status === 'paid' },
              { value: 'review', label: 'Review', selected: loan.status === 'review' }] })}
          ${field('Outstanding Balance ($)', 'balance',    { type: 'number', step: '0.01', value: loan.balance })}
          ${field('Interest Rate (%)', 'interest_rate',    { type: 'number', step: '0.01', value: loan.interest_rate })}
          ${field('Monthly Payment ($)','monthly_payment', { type: 'number', step: '0.01', value: loan.monthly_payment })}
          ${field('Term (months)',     'term_months',      { type: 'number', value: loan.term_months })}
          ${field('Origination Date',  'origination_date', { type: 'date', value: dateInput(loan.origination_date) })}
          ${field('Maturity Date',     'maturity_date',    { type: 'date', value: dateInput(loan.maturity_date) })}
          ${field('Next Due',          'next_due_date',    { type: 'date', value: dateInput(loan.next_due_date) })}
          ${field('Origination Fee (%)','origination_fee', { type: 'number', step: '0.01', value: loan.origination_fee })}
        </div>
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Collateral Address', 'collateral_address', { value: loan.collateral_address })}
        </div>
        ${submitBar('Save Changes')}
      </form>`);
    const form = document.getElementById('oac-edit-loan-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleUpdateSubmit(form, 'loans', loan.id, () => ({
        user_id:            String(fd.get('user_id')),
        loan_id_display:    strOrNull(fd.get('loan_id_display')),
        balance:            numOrNull(fd.get('balance')),
        interest_rate:      numOrNull(fd.get('interest_rate')),
        monthly_payment:    numOrNull(fd.get('monthly_payment')),
        term_months:        numOrNull(fd.get('term_months')),
        origination_date:   strOrNull(fd.get('origination_date')),
        maturity_date:      strOrNull(fd.get('maturity_date')),
        next_due_date:      strOrNull(fd.get('next_due_date')),
        origination_fee:    numOrNull(fd.get('origination_fee')),
        collateral_address: strOrNull(fd.get('collateral_address')),
        status:             String(fd.get('status'))
      }));
    });
  }

  // ---------- Edit Investment modal ----------
  function openEditInvestmentModal(inv) {
    const clients = (window.__onixAdminData && window.__onixAdminData.clients) || [];
    const clientOpts = clientOptions(clients).map(o => ({ ...o, selected: o.value === inv.user_id }));
    openModal(`
      <h2>Edit Investment</h2>
      <div class="sub">${esc(inv.venture_name)}</div>
      <form id="oac-edit-inv-form">
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Client', 'user_id', { required: true, select: clientOpts })}
        </div>
        <div class="oac-modal-row">
          ${field('Venture Name',      'venture_name',      { required: true, value: inv.venture_name })}
          ${field('Type',              'venture_type',      { required: true, select: [
              { value: 'equity',  label: 'Equity',  selected: inv.venture_type === 'equity' },
              { value: 'deposit', label: 'Deposit', selected: inv.venture_type === 'deposit' }] })}
          ${field('Amount Invested ($)','amount_invested',  { type: 'number', step: '0.01', required: true, value: inv.amount_invested })}
          ${field('Ownership (%)',     'ownership_pct',     { type: 'number', step: '0.01', value: inv.ownership_pct })}
          ${field('Expected Return (%)','expected_return',  { type: 'number', step: '0.01', value: inv.expected_return })}
          ${field('Start Date',        'start_date',        { type: 'date', value: dateInput(inv.start_date) })}
          ${field('Status',            'status',            { required: true, select: [
              { value: 'active',  label: 'Active',  selected: inv.status === 'active' },
              { value: 'pending', label: 'Pending', selected: inv.status === 'pending' },
              { value: 'exited',  label: 'Exited',  selected: inv.status === 'exited' }] })}
        </div>
        ${submitBar('Save Changes')}
      </form>`);
    const form = document.getElementById('oac-edit-inv-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleUpdateSubmit(form, 'investments', inv.id, () => ({
        user_id:         String(fd.get('user_id')),
        venture_name:    strOrNull(fd.get('venture_name')),
        venture_type:    strOrNull(fd.get('venture_type')),
        amount_invested: numOrNull(fd.get('amount_invested')),
        ownership_pct:   numOrNull(fd.get('ownership_pct')),
        expected_return: numOrNull(fd.get('expected_return')),
        start_date:      strOrNull(fd.get('start_date')),
        status:          String(fd.get('status'))
      }));
    });
  }

  // ---------- Edit Raise modal ----------
  function openEditRaiseModal(r) {
    openModal(`
      <h2>Edit Raise</h2>
      <div class="sub">${esc(r.venture_name)}</div>
      <form id="oac-edit-raise-form">
        <div class="oac-modal-row">
          ${field('Venture Name',           'venture_name',         { required: true, value: r.venture_name })}
          ${field('Type',                   'venture_type',         { required: true, select: [
              { value: 'equity',  label: 'Equity',  selected: r.venture_type === 'equity' },
              { value: 'deposit', label: 'Deposit', selected: r.venture_type === 'deposit' }] })}
          ${field('Total Raise Target ($)', 'total_raise_target',   { type: 'number', step: '1', required: true, value: r.total_raise_target })}
          ${field('Amount Raised ($)',      'amount_raised',        { type: 'number', step: '1', value: r.amount_raised })}
          ${field('Minimum Investment ($)', 'minimum_investment',   { type: 'number', step: '1', value: r.minimum_investment })}
          ${field('Investment Horizon',     'investment_horizon',   { value: r.investment_horizon })}
          ${field('Projected Return Min (%)','projected_return_min',{ type: 'number', step: '0.01', value: r.projected_return_min })}
          ${field('Projected Return Max (%)','projected_return_max',{ type: 'number', step: '0.01', value: r.projected_return_max })}
          ${field('Status',                 'status',               { required: true, select: [
              { value: 'open',   label: 'Open',   selected: r.status === 'open' },
              { value: 'closed', label: 'Closed', selected: r.status === 'closed' }] })}
        </div>
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Structure', 'structure', { value: r.structure })}
        </div>
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          <div><div class="k">Description</div><textarea name="description" rows="3" style="${INPUT_STYLE};resize:vertical;min-height:60px">${esc(r.description || '')}</textarea></div>
        </div>
        ${submitBar('Save Changes')}
      </form>`);
    const form = document.getElementById('oac-edit-raise-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleUpdateSubmit(form, 'raises', r.id, () => ({
        venture_name:         strOrNull(fd.get('venture_name')),
        venture_type:         strOrNull(fd.get('venture_type')),
        description:          strOrNull(fd.get('description')),
        total_raise_target:   numOrNull(fd.get('total_raise_target')),
        amount_raised:        numOrNull(fd.get('amount_raised')) ?? 0,
        minimum_investment:   numOrNull(fd.get('minimum_investment')),
        projected_return_min: numOrNull(fd.get('projected_return_min')),
        projected_return_max: numOrNull(fd.get('projected_return_max')),
        investment_horizon:   strOrNull(fd.get('investment_horizon')),
        structure:            strOrNull(fd.get('structure')),
        status:               String(fd.get('status'))
      }));
    });
  }

  // ---------- Add Payment modal (scoped to a single loan) ----------
  function openAddPaymentModal(loan) {
    openModal(`
      <h2>Add Payment</h2>
      <div class="sub">Loan ${esc(loan.loan_id_display || loan.id.slice(0,8))}</div>
      <form id="oac-add-payment-form">
        <div class="oac-modal-row">
          ${field('Due Date',        'due_date',      { type: 'date', required: true, value: new Date().toISOString().slice(0,10) })}
          ${field('Status',          'status',        { required: true, select: [
              { value: 'paid',      label: 'Paid',      selected: true },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'late',      label: 'Late' },
              { value: 'missed',    label: 'Missed' }
          ] })}
          ${field('Amount Due ($)',   'amount_due',    { type: 'number', step: '0.01', placeholder: '4218' })}
          ${field('Paid Date',        'paid_at',       { type: 'date' })}
          ${field('Principal ($)',    'principal',     { type: 'number', step: '0.01' })}
          ${field('Interest ($)',     'interest',      { type: 'number', step: '0.01' })}
          ${field('Balance After ($)','balance_after', { type: 'number', step: '0.01' })}
        </div>
        ${submitBar('Record Payment')}
      </form>`);
    const form = document.getElementById('oac-add-payment-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleFormSubmit(form, () => ({
        loan_id:        loan.id,
        due_date:       strOrNull(fd.get('due_date')),
        status:         String(fd.get('status')),
        amount_due:     numOrNull(fd.get('amount_due')),
        paid_at:        strOrNull(fd.get('paid_at')),
        principal:      numOrNull(fd.get('principal')),
        interest:       numOrNull(fd.get('interest')),
        balance_after:  numOrNull(fd.get('balance_after'))
      }), 'loan_payments');
    });
  }

  // ---------- Add Distribution modal (scoped to a single investment) ----------
  function openAddDistributionModal(inv) {
    openModal(`
      <h2>Add Distribution</h2>
      <div class="sub">${esc(inv.venture_name)}</div>
      <form id="oac-add-dist-form">
        <div class="oac-modal-row">
          ${field('Paid Date', 'paid_at', { type: 'date', required: true, value: new Date().toISOString().slice(0,10) })}
          ${field('Amount ($)','amount',  { type: 'number', step: '0.01', required: true })}
          ${field('Kind',     'kind',    { required: true, select: [
              { value: 'distribution',      label: 'Distribution', selected: true },
              { value: 'interest',          label: 'Interest' },
              { value: 'dividend',          label: 'Dividend' },
              { value: 'return_of_capital', label: 'Return of Capital' },
              { value: 'other',             label: 'Other' }
          ] })}
        </div>
        <div class="oac-modal-row" style="grid-template-columns:1fr">
          ${field('Notes', 'notes', { textarea: true, placeholder: 'Optional context for this distribution' })}
        </div>
        ${submitBar('Record Distribution')}
      </form>`);
    const form = document.getElementById('oac-add-dist-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      handleFormSubmit(form, () => ({
        investment_id: inv.id,
        paid_at:       strOrNull(fd.get('paid_at')),
        amount:        numOrNull(fd.get('amount')),
        kind:          String(fd.get('kind')),
        notes:         strOrNull(fd.get('notes'))
      }), 'distributions');
    });
  }

  // ---------- New Client modal ----------
  function openNewClientModal() {
    openModal(`
      <h2>Add New Client</h2>
      <div class="sub">Creates an Onix Finance account immediately</div>
      <form id="oac-new-client-form">
        <div class="oac-modal-row">
          <div>
            <div class="k">Full Name</div>
            <input name="full_name" required style="width:100%;padding:10px 12px;border:1px solid #E8E8E8;font-size:.9rem;font-family:inherit;outline:none" placeholder="Carlos Mendoza">
          </div>
          <div>
            <div class="k">Email</div>
            <input name="email" type="email" required style="width:100%;padding:10px 12px;border:1px solid #E8E8E8;font-size:.9rem;font-family:inherit;outline:none" placeholder="client@onixfinance.com">
          </div>
          <div>
            <div class="k">Temporary Password</div>
            <input name="password" type="text" required minlength="6" style="width:100%;padding:10px 12px;border:1px solid #E8E8E8;font-size:.9rem;font-family:inherit;outline:none" placeholder="At least 6 characters">
          </div>
          <div>
            <div class="k">Role</div>
            <select name="role" style="width:100%;padding:10px 12px;border:1px solid #E8E8E8;font-size:.9rem;font-family:inherit;outline:none;background:#fff">
              <option value="client" selected>Client (default)</option>
              <option value="client">Client · Investor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <div class="k">Status</div>
            <select name="status" style="width:100%;padding:10px 12px;border:1px solid #E8E8E8;font-size:.9rem;font-family:inherit;outline:none;background:#fff">
              <option value="active" selected>Active (can sign in immediately)</option>
              <option value="pending">Pending (needs approval)</option>
            </select>
          </div>
        </div>
        <div id="oac-new-client-err" style="color:#C0392B;font-size:.85rem;margin-bottom:10px;display:none"></div>
        <div class="oac-modal-foot" style="margin-top:0">
          <button type="button" class="oac-btn outline" data-modal-close>Cancel</button>
          <button type="submit" class="oac-btn red" id="oac-new-client-submit">Create Client</button>
        </div>
      </form>
    `);
    const form = document.getElementById('oac-new-client-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const submitBtn = document.getElementById('oac-new-client-submit');
      const errEl = document.getElementById('oac-new-client-err');
      errEl.style.display = 'none';
      submitBtn.disabled = true; submitBtn.textContent = 'Creating…';
      const { data, error } = await OnixDB.client.rpc('admin_create_client', {
        p_email:     String(fd.get('email')).trim().toLowerCase(),
        p_password:  String(fd.get('password')),
        p_full_name: String(fd.get('full_name')).trim(),
        p_role:      String(fd.get('role')),
        p_status:    String(fd.get('status'))
      });
      if (error) {
        errEl.style.display = 'block';
        errEl.textContent = error.message || 'Could not create client.';
        submitBtn.disabled = false; submitBtn.textContent = 'Create Client';
        return;
      }
      // Close modal and reload data
      document.getElementById('oac-modal').classList.remove('open');
      refreshAll();
    });
  }

  function actionBarBtn(label, id) {
    return `<div style="display:flex;justify-content:flex-end;margin-bottom:14px">
      <a href="#" id="${esc(id)}" style="display:inline-block;background:#C0392B;color:#fff;padding:10px 18px;font:600 .72rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.1em;border:1px solid #C0392B;border-radius:2px;text-decoration:none">${esc(label)}</a>
    </div>`;
  }

  function paintLoansView(loans) {
    const v = findView(STATIC_VIEWS.loans); if (!v) return false;
    if (alreadyPainted(v)) return true;
    const rows = loans.length ? loans.map((l, i) => `
      <tr>
        <td>${esc(l.loan_id_display || l.id.slice(0,8))}</td>
        <td>${esc((l.profiles && (l.profiles.full_name || l.profiles.email)) || l.user_id)}</td>
        <td>${fmt.money(l.balance)}</td>
        <td>${fmt.pct(l.interest_rate)}</td>
        <td>${fmt.money(l.monthly_payment)}</td>
        <td>${fmt.date(l.next_due_date)}</td>
        <td><span class="oac-badge ${esc(l.status || '')}">${esc(l.status || '—')}</span></td>
        <td style="text-align:right;white-space:nowrap">
          <a href="#" data-view-static-loan="${i}" style="display:inline-block;background:#C0392B;color:#fff;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;margin-right:4px;text-decoration:none">View</a>
          ${contactAnchor(l.profiles && l.profiles.email, 'Loan ' + (l.loan_id_display || ''))}
        </td>
      </tr>`).join('') : '<tr><td colspan="8" class="oac-empty">No loans yet.</td></tr>';
    v.innerHTML = viewShell('Loans', 'Active and historical loans',
      actionBarBtn('+ Add Loan', 'oac-add-loan-btn') +
      `<table class="oac-table" style="width:100%"><thead><tr>
        <th>Loan ID</th><th>Client</th><th>Balance</th><th>Rate</th><th>Payment</th><th>Next Due</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`);
    v.querySelectorAll('[data-view-static-loan]').forEach(b => {
      b.addEventListener('click', (e) => { e.preventDefault(); viewLoan(loans[Number(b.dataset.viewStaticLoan)]); });
    });
    const addBtn = v.querySelector('#oac-add-loan-btn');
    if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); openAddLoanModal(); });
    return true;
  }

  function paintInvestmentsView(invs) {
    const v = findView(STATIC_VIEWS.investments); if (!v) return false;
    if (alreadyPainted(v)) return true;
    const rows = invs.length ? invs.map((it, i) => `
      <tr>
        <td>${esc((it.profiles && (it.profiles.full_name || it.profiles.email)) || it.user_id)}</td>
        <td>${esc(it.venture_name)}</td>
        <td>${esc(it.venture_type || '—')}</td>
        <td>${fmt.money(it.amount_invested)}</td>
        <td>${it.ownership_pct != null ? fmt.pct(it.ownership_pct) : '—'}</td>
        <td>${it.expected_return != null ? fmt.pct(it.expected_return) : '—'}</td>
        <td><span class="oac-badge ${esc(it.status || '')}">${esc(it.status || '—')}</span></td>
        <td style="text-align:right;white-space:nowrap">
          <a href="#" data-view-static-inv="${i}" style="display:inline-block;background:#C0392B;color:#fff;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;margin-right:4px;text-decoration:none">View</a>
          ${contactAnchor(it.profiles && it.profiles.email, it.venture_name)}
        </td>
      </tr>`).join('') : '<tr><td colspan="8" class="oac-empty">No investments yet.</td></tr>';
    v.innerHTML = viewShell('Investments', 'Client positions across every venture',
      actionBarBtn('+ Add Investment', 'oac-add-inv-btn') +
      `<table class="oac-table" style="width:100%"><thead><tr>
        <th>Client</th><th>Venture</th><th>Type</th><th>Invested</th><th>Ownership</th><th>Return</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`);
    v.querySelectorAll('[data-view-static-inv]').forEach(b => {
      b.addEventListener('click', (e) => { e.preventDefault(); viewInvestment(invs[Number(b.dataset.viewStaticInv)]); });
    });
    const addBtn = v.querySelector('#oac-add-inv-btn');
    if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); openAddInvestmentModal(); });
    return true;
  }

  function paintRaisesView(raises) {
    const v = findView(STATIC_VIEWS.raises); if (!v) return false;
    if (alreadyPainted(v)) return true;
    const rows = raises.length ? raises.map((r, i) => {
      const interestTotal = Number(r._interest_total || 0);
      const interestNew = Number(r._interest_new || 0);
      const interestCell = interestTotal === 0
        ? '<span style="color:#9B9590">0</span>'
        : `<span style="font-weight:600">${interestTotal}</span>` +
          (interestNew > 0 ? ` <span style="display:inline-block;margin-left:6px;padding:1px 7px;background:#C0392B;color:#fff;border-radius:10px;font-size:.6rem;font-weight:700;letter-spacing:.04em">${interestNew} new</span>` : '');
      return `
      <tr>
        <td>${esc(r.venture_name)}</td>
        <td>${esc(r.venture_type || '—')}</td>
        <td>${fmt.money(r.total_raise_target)}</td>
        <td>${fmt.money(r.amount_raised)}</td>
        <td>${fmt.money(r.minimum_investment)}</td>
        <td>${(r.projected_return_min != null && r.projected_return_max != null) ? r.projected_return_min + '–' + r.projected_return_max + '%' : '—'}</td>
        <td>${interestCell}</td>
        <td><span class="oac-badge ${esc(r.status || '')}">${esc(r.status || '—')}</span></td>
        <td style="text-align:right;white-space:nowrap">
          <a href="#" data-view-static-raise="${i}" style="display:inline-block;background:#C0392B;color:#fff;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;margin-right:4px;text-decoration:none">View</a>
          <a href="mailto:info@onixfinance.com?subject=${encodeURIComponent('Onix Finance · ' + r.venture_name)}" style="display:inline-block;background:#fff;color:#1A1A1A;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;text-decoration:none">Contact</a>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="oac-empty">No raises yet.</td></tr>';
    v.innerHTML = viewShell('Raises', 'Active and historical investment opportunities',
      actionBarBtn('+ Add Raise', 'oac-add-raise-btn') +
      `<table class="oac-table" style="width:100%"><thead><tr>
        <th>Venture</th><th>Type</th><th>Goal</th><th>Raised</th><th>Min</th><th>IRR</th><th>Interest</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`);
    v.querySelectorAll('[data-view-static-raise]').forEach(b => {
      b.addEventListener('click', (e) => { e.preventDefault(); viewRaise(raises[Number(b.dataset.viewStaticRaise)]); });
    });
    const addBtn = v.querySelector('#oac-add-raise-btn');
    if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); openAddRaiseModal(); });
    return true;
  }

  function paintApplicationsView(applications) {
    const v = findView(STATIC_VIEWS.applications); if (!v) return false;
    if (alreadyPainted(v)) return true;
    const rows = applications.length ? applications.map((a, i) => `
      <tr>
        <td>${fmt.date(a.submitted_at)}</td>
        <td>${esc((a.profiles && (a.profiles.full_name || a.profiles.email)) || a.user_id)}</td>
        <td>${fmt.money(a.amount_requested)}</td>
        <td>${esc(a.applicant_type || '—')}</td>
        <td>${esc(a.purpose || '—')}</td>
        <td><span class="oac-badge ${esc(a.status || '')}">${esc(a.status || '—')}</span></td>
        <td style="text-align:right;white-space:nowrap">
          <a href="#" data-view-static-app="${i}" style="display:inline-block;background:#C0392B;color:#fff;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;margin-right:4px;text-decoration:none">View</a>
          ${contactAnchor(a.profiles && a.profiles.email, 'Loan Application')}
        </td>
      </tr>`).join('') : '<tr><td colspan="7" class="oac-empty">No applications submitted yet.</td></tr>';
    v.innerHTML = viewShell('Loan Applications', 'Submitted via the client portal', `
      <table class="oac-table" style="width:100%"><thead><tr>
        <th>Submitted</th><th>Client</th><th>Amount</th><th>Type</th><th>Purpose</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead><tbody>${rows}</tbody></table>`);
    v.querySelectorAll('[data-view-static-app]').forEach(b => {
      b.addEventListener('click', (e) => { e.preventDefault(); viewApplication(applications[Number(b.dataset.viewStaticApp)]); });
    });
    return true;
  }

  function contactAnchor(email, label) {
    const baseStyle = "display:inline-block;background:#fff;color:#1A1A1A;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;text-decoration:none";
    if (!email) return `<span style="${baseStyle};opacity:.5">No email</span>`;
    return `<a href="mailto:${esc(email)}?subject=${encodeURIComponent('Onix Finance · ' + (label || ''))}" style="${baseStyle}">Contact</a>`;
  }

  // Persistent painter: the admin design renders async AND may re-render
  // when the user switches tabs. We poll every 600ms for the lifetime of the
  // session — paint functions are no-ops once a view is already painted, so
  // the cost is one querySelector per tab per tick.
  function paintStaticAdmin(data) {
    // Invalidate any previously-painted markers so we re-paint with fresh data
    document.querySelectorAll('.' + LIVE_MARKER).forEach(el => el.classList.remove(LIVE_MARKER));
    function tryAll() {
      paintClientsView(data.clients, data.loans, data.investments);
      paintLoansView(data.loans);
      paintInvestmentsView(data.investments);
      paintRaisesView(data.raises);
      paintApplicationsView(data.applications);
    }
    tryAll();
    window.__onixAdminData = data;
    if (window.__onixAdminPainter) clearInterval(window.__onixAdminPainter);
    window.__onixAdminPainter = setInterval(tryAll, 600);
  }

  // (legacy helper kept for backwards compat — no longer used)
  function findStaticAppsTable() {
    const views = [
      document.getElementById('view-applications'),
      document.getElementById('view-loans-app')
    ];
    for (const v of views) {
      if (v) {
        const t = v.querySelector('table');
        if (t && t.querySelector('tbody')) return t;
      }
    }
    return null;
  }

  function buildLiveRow(app, columnCount) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-onix-live-app', app.id);
    tr.style.background = '#FDF0EE';
    const submitted = fmt.date(app.submitted_at);
    const client    = (app.profiles && (app.profiles.full_name || app.profiles.email)) || app.user_id;
    const email     = app.profiles && app.profiles.email;
    const amount    = fmt.money(app.amount_requested);
    const purpose   = app.purpose || '—';
    const applicantType = app.applicant_type || '—';
    const status    = app.status || 'pending';

    const viewBtnStyle = "display:inline-block;background:#C0392B;color:#fff;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #C0392B;border-radius:2px;cursor:pointer;margin-right:4px;text-decoration:none";
    const contactBtnStyle = "display:inline-block;background:#fff;color:#1A1A1A;padding:6px 12px;font:600 .68rem/1 'DM Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em;border:1px solid #E8E8E8;border-radius:2px;cursor:pointer;text-decoration:none";
    const actionsHtml =
      `<a href="#" role="button" data-view-live-app="${esc(app.id)}" style="${viewBtnStyle}">View</a>` +
      (email
        ? `<a href="mailto:${esc(email)}?subject=${encodeURIComponent('Onix Finance · Loan Application')}" style="${contactBtnStyle}">Contact</a>`
        : `<span style="${contactBtnStyle};opacity:.5">No email</span>`);

    // Data cells in display order; actions occupy the last column.
    const data = [
      `<span style="display:inline-block;background:#C0392B;color:#fff;padding:2px 6px;font-size:.55rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:2px;margin-right:6px">Live</span>${esc(submitted)}`,
      esc(client),
      esc(amount),
      esc(purpose),
      esc(applicantType),
      `<span style="display:inline-block;padding:2px 8px;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:2px;background:#FDF5E6;color:#A07818">${esc(status)}</span>`
    ];

    let cells;
    if (columnCount >= 2) {
      // Reserve last column for actions, fit data in the first (columnCount-1)
      const dataLen = Math.min(data.length, columnCount - 1);
      cells = data.slice(0, dataLen);
      while (cells.length < columnCount - 1) cells.push('');
      cells.push(actionsHtml);
    } else {
      cells = [data.join(' · ') + ' ' + actionsHtml];
    }
    tr.innerHTML = cells.map((c, idx) => {
      const style = (idx === cells.length - 1) ? ' style="text-align:right;white-space:nowrap"' : '';
      return `<td${style}>${c}</td>`;
    }).join('');
    return tr;
  }

  function paintStaticApplicationsView(applications) {
    const table = findStaticAppsTable();
    if (!table) return false;
    const tbody = table.querySelector('tbody');
    if (!tbody) return false;
    // Remove any rows we previously inserted
    tbody.querySelectorAll('tr[data-onix-live-app]').forEach(r => r.remove());
    if (!applications || !applications.length) return true;
    // Determine column count from the first existing row (or thead)
    let columnCount = 0;
    const firstRow = tbody.querySelector('tr:not([data-onix-live-app])');
    if (firstRow) columnCount = firstRow.children.length;
    else {
      const headRow = table.querySelector('thead tr');
      if (headRow) columnCount = headRow.children.length;
    }
    if (columnCount < 1) columnCount = 6;
    // Prepend live rows, newest first
    applications.forEach(app => {
      tbody.insertBefore(buildLiveRow(app, columnCount), tbody.firstChild);
    });
    // Wire View buttons (Contact uses a native mailto: anchor, no JS needed)
    tbody.querySelectorAll('[data-view-live-app]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-view-live-app');
        const app = applications.find(a => a.id === id);
        if (app) viewApplication(app);
      });
    });
    return true;
  }

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
      const [clients, pending, loans, investments, raises, applications, payments, distributions, interests] = await Promise.all([
        OnixDB.getAllClients(),
        OnixDB.getPendingClients(),
        OnixDB.getAllLoans(),
        OnixDB.getAllInvestments(),
        OnixDB.getAllRaises(),
        OnixDB.getAllApplications(),
        OnixDB.getAllPayments    ? OnixDB.getAllPayments()    : Promise.resolve([]),
        OnixDB.getAllDistributions ? OnixDB.getAllDistributions() : Promise.resolve([]),
        OnixDB.getAllRaiseInterests ? OnixDB.getAllRaiseInterests() : Promise.resolve([])
      ]);
      // Annotate raises with interest totals so paintRaisesView can show counts.
      const byRaise = new Map();
      (interests || []).forEach(i => {
        const cur = byRaise.get(i.raise_id) || { total: 0, neu: 0 };
        cur.total += 1;
        if (i.status === 'new') cur.neu += 1;
        byRaise.set(i.raise_id, cur);
      });
      raises.forEach(r => {
        const c = byRaise.get(r.id) || { total: 0, neu: 0 };
        r._interest_total = c.total;
        r._interest_new   = c.neu;
      });

      renderOverview({ clients, pending, loans, investments, raises, applications });
      renderApprovals(pending);
      renderClients(clients);
      renderApplications(applications);
      renderLoans(loans);
      renderInvestments(investments);
      renderRaises(raises);
      paintStaticAdmin({ clients, loans, investments, raises, applications, payments, distributions });
      const pendingInterest = (interests || []).filter(i => i.status === 'new').length;
      if (greeting) greeting.textContent = `Loaded · ${clients.length} clients · ${pending.length} pending · ${loans.length} loans · ${applications.length} applications${pendingInterest ? ' · ' + pendingInterest + ' new interest' + (pendingInterest === 1 ? '' : 's') : ''}`;
    } catch (ex) {
      console.error('[onix-admin]', ex);
      if (greeting) greeting.textContent = 'Error loading data — see console';
    }
  }

  function computeInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    const first = parts[0][0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  function renderSidebarUser(profile) {
    const name = (profile && (profile.full_name || profile.email)) || 'Admin';
    const initials = computeInitials(profile && (profile.full_name || profile.email));
    let attempts = 0;
    (function apply() {
      const nameEls   = document.querySelectorAll('.sidebar-user-name');
      const avatarEls = document.querySelectorAll('.sidebar-avatar');
      if (nameEls.length || avatarEls.length) {
        nameEls.forEach(el => el.textContent = name);
        avatarEls.forEach(el => el.textContent = initials);
        return;
      }
      if (++attempts < 30) setTimeout(apply, 100);
    })();
  }

  async function bootstrap() {
    const gate = await OnixDB.requireAdmin();
    if (!gate) return;
    injectStyles();
    buildPanel();
    renderSidebarUser(gate.profile);
    document.getElementById('oac-greeting').textContent = 'Signed in as ' + (gate.profile.full_name || gate.profile.email);
    // Load data eagerly so the static "Loan Applications" tab is populated
    // even before the admin opens the Live Admin Console.
    refreshAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();
