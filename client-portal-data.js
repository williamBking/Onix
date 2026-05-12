/* ============================================================
   Onix Finance — Client Portal data bootstrap
   Replaces hardcoded demo data with the signed-in user's real
   data from Supabase. Loaded after supabase.js so OnixDB is
   available. Idempotent: if an element is missing, skip it.
   ============================================================ */
(function () {
  'use strict';

  // ---------- helpers ----------
  const fmt = {
    money: n => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })),
    pct:   n => (n == null ? '—' : Number(n).toFixed(1) + '%'),
    date:  s => (s == null ? '—' : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
    days:  s => {
      if (!s) return '';
      const diff = Math.ceil((new Date(s) - new Date()) / 86400000);
      if (diff < 0) return Math.abs(diff) + ' days overdue';
      if (diff === 0) return 'today';
      return 'in ' + diff + ' days';
    }
  };

  function setText(el, value) {
    if (el && value != null) el.textContent = value;
  }

  // Find a kpi cell by its English label text. Returns the .kpi-val inside it.
  function kpiValueByLabel(labelText) {
    const cells = document.querySelectorAll('.kpi-cell');
    for (const c of cells) {
      const label = c.querySelector('.kpi-label');
      if (label && label.textContent.trim().toLowerCase() === labelText.toLowerCase()) {
        return { cell: c, val: c.querySelector('.kpi-val'), sub: c.querySelector('.kpi-sub') };
      }
    }
    return { cell: null, val: null, sub: null };
  }

  function renderUserName(profile) {
    const name = profile.full_name || profile.email || 'Client';
    document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = name);
    // Also replace any input pre-filled with the old demo name
    document.querySelectorAll('input[value="Carlos Mendoza"]').forEach(el => el.value = name);
    document.querySelectorAll('input[value="carlos.mendoza@email.com"]').forEach(el => el.value = profile.email || '');
  }

  function renderLoan(loan) {
    // KPIs
    const outstanding = kpiValueByLabel('Outstanding Loan');
    setText(outstanding.val, loan ? fmt.money(loan.balance) : '—');
    setText(outstanding.sub, loan ? (loan.loan_id_display || '') : '');

    const nextDue = kpiValueByLabel('Next Payment Due');
    setText(nextDue.val, loan ? fmt.date(loan.next_due_date) : '—');
    if (nextDue.sub && loan) {
      nextDue.sub.innerHTML = fmt.money(loan.monthly_payment) + ' · <span>' + fmt.days(loan.next_due_date) + '</span>';
    }

    const balance = kpiValueByLabel('Outstanding Balance');
    setText(balance.val, loan ? fmt.money(loan.balance) : '—');

    const rate = kpiValueByLabel('Interest Rate');
    setText(rate.val, loan ? fmt.pct(loan.interest_rate) : '—');

    const monthly = kpiValueByLabel('Monthly Payment');
    setText(monthly.val, loan ? fmt.money(loan.monthly_payment) : '—');

    // Replace loan document rows inside the lending view's docs panel.
    // We identify the docs panel by being the first .doc-row container in the page.
    if (loan && loan.loan_documents && loan.loan_documents.length) {
      const firstDoc = document.querySelector('.doc-row');
      if (firstDoc) {
        const docsContainer = firstDoc.parentElement;
        // Wipe existing static rows, then re-add from data
        docsContainer.querySelectorAll('.doc-row').forEach(r => r.remove());
        const today = new Date();
        loan.loan_documents.forEach(d => {
          const row = document.createElement('div');
          row.className = 'doc-row';
          row.innerHTML =
            '<div><div class="doc-name">' + escapeHtml(d.name) + '</div>' +
            '<div class="doc-meta">PDF · ' + fmt.date(d.uploaded_at || today) + '</div></div>' +
            (d.dropbox_url
              ? '<a class="doc-link" href="' + escapeAttr(d.dropbox_url) + '" target="_blank" rel="noopener">View ↗</a>'
              : '<button class="doc-link" disabled>—</button>');
          docsContainer.appendChild(row);
        });
      }
    }
  }

  function renderNoLoan() {
    // When the user has no active loan, dim all loan KPI values
    ['Outstanding Loan', 'Next Payment Due', 'Outstanding Balance', 'Interest Rate', 'Monthly Payment'].forEach(label => {
      const { val, sub } = kpiValueByLabel(label);
      setText(val, '—');
      if (sub) sub.textContent = 'No active loan';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ---------- Investments ----------
  function renderInvestments(investments) {
    const grid = document.querySelector('#view-investments .inv-grid');
    if (!grid) return;
    // Clear demo cards
    grid.querySelectorAll('.inv-card').forEach(c => c.remove());
    if (!investments || !investments.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);background:#fff;border:1px solid var(--border);border-top:3px solid var(--red);';
      empty.innerHTML = '<div style="font-family:var(--serif);font-style:italic;font-size:1.4rem;margin-bottom:8px">No active investments</div>' +
        '<div style="font-size:.85rem">Explore current opportunities in the Open Raises section.</div>';
      grid.appendChild(empty);
      return;
    }
    investments.forEach(inv => {
      const card = document.createElement('div');
      card.className = 'inv-card';
      const typeLabel = (inv.venture_type === 'deposit') ? 'Deposit · Onix Finance'
                       : (inv.venture_type === 'equity')  ? 'Equity · Private'
                       : (inv.venture_type || 'Investment');
      card.innerHTML =
        '<div class="inv-card-name">' + escapeHtml(inv.venture_name || 'Investment') + '</div>' +
        '<div class="inv-card-type">' + escapeHtml(typeLabel) + '</div>' +
        '<div class="inv-card-amount">' + fmt.money(inv.amount_invested) + '</div>' +
        '<div class="inv-card-lbl">Invested</div>' +
        (inv.ownership_pct != null
          ? '<div class="inv-card-footer"><span>Ownership</span><span class="v">' + fmt.pct(inv.ownership_pct) + '</span></div>'
          : '') +
        (inv.expected_return != null
          ? '<div class="inv-card-footer" style="border-top:none;padding-top:0;margin-top:6px"><span>Expected Return</span><span class="v" style="color:var(--red)">' + fmt.pct(inv.expected_return) + '</span></div>'
          : '');
      grid.appendChild(card);
    });
  }

  // ---------- Open Raises ----------
  function renderRaises(raises, userId) {
    const grid = document.querySelector('#view-raises .row-3');
    if (!grid) return;
    grid.querySelectorAll('.opp-card').forEach(c => c.remove());
    if (!raises || !raises.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;padding:40px;text-align:center;color:var(--muted);background:#fff;border:1px solid var(--border);border-top:3px solid var(--red);';
      empty.innerHTML = '<div style="font-family:var(--serif);font-style:italic;font-size:1.4rem;margin-bottom:8px">No open opportunities right now</div>' +
        '<div style="font-size:.85rem">Check back soon — Onix Finance opens new raises periodically.</div>';
      grid.appendChild(empty);
      return;
    }
    raises.forEach(r => {
      const target  = Number(r.total_raise_target || 0);
      const raised  = Number(r.amount_raised || 0);
      const pct     = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;
      const minIRR  = r.projected_return_min;
      const maxIRR  = r.projected_return_max;
      const irrTxt  = (minIRR != null && maxIRR != null) ? minIRR + '–' + maxIRR + '%'
                    : (maxIRR != null) ? maxIRR + '%' : '—';
      const subtype = (r.venture_type === 'deposit' ? 'Deposit' : 'Equity')
                    + (r.investment_horizon ? ' · ' + r.investment_horizon : '');
      const card = document.createElement('div');
      card.className = 'opp-card';
      card.innerHTML =
        '<div class="opp-hd"><div class="opp-name">' + escapeHtml(r.venture_name) + '</div>' +
        '<div class="opp-subtype">' + escapeHtml(subtype) + '</div></div>' +
        '<div class="opp-body">' +
          '<div class="opp-stat-row">' +
            '<div><div class="opp-stat-lbl">Target IRR</div><div class="opp-stat-val red">' + irrTxt + '</div></div>' +
            '<div><div class="opp-stat-lbl">Hold</div><div class="opp-stat-val">' + escapeHtml(r.investment_horizon || '—') + '</div></div>' +
            '<div><div class="opp-stat-lbl">Minimum</div><div class="opp-stat-val">' + fmt.money(r.minimum_investment) + '</div></div>' +
            '<div><div class="opp-stat-lbl">Raise Goal</div><div class="opp-stat-val">' + fmt.money(target) + '</div></div>' +
          '</div>' +
          '<div class="opp-progress"><div class="opp-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="opp-pct-row"><span>' + pct + '% funded</span><span>' + fmt.money(raised) + ' / ' + fmt.money(target) + '</span></div>' +
        '</div>' +
        '<div class="opp-footer">' +
          '<button class="btn btn-outline" style="flex:1;justify-content:center" data-raise-details="' + escapeAttr(r.id) + '">View Details</button>' +
          '<button class="btn btn-red"     style="flex:1;justify-content:center" data-raise-interest="' + escapeAttr(r.id) + '">Express Interest</button>' +
        '</div>';
      grid.appendChild(card);
    });

    // Wire interest buttons
    document.querySelectorAll('[data-raise-interest]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const raiseId = btn.getAttribute('data-raise-interest');
        btn.disabled = true;
        btn.innerHTML = 'Submitting…';
        const ok = await OnixDB.submitRaiseInterest(userId, raiseId);
        if (ok) {
          btn.innerHTML = '✓ Interest recorded';
          btn.style.background = '#3B8B3B';
          btn.style.borderColor = '#3B8B3B';
        } else {
          btn.disabled = false;
          btn.innerHTML = 'Express Interest';
          alert('Could not record interest. Please try again.');
        }
      });
    });

    // Wire details buttons (modal stub for now — opens raise documents in new tabs)
    document.querySelectorAll('[data-raise-details]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const raiseId = btn.getAttribute('data-raise-details');
        const raise = raises.find(x => x.id === raiseId);
        if (!raise) return;
        const docs = raise.raise_documents || [];
        const docLinks = docs.length
          ? docs.map(d => '• ' + d.name + ': ' + d.dropbox_url).join('\n')
          : '(no documents posted)';
        alert(raise.venture_name + '\n\n' + (raise.description || '') + '\n\n' +
              'Structure: ' + (raise.structure || '—') + '\n\n' +
              'Documents:\n' + docLinks);
      });
    });
  }

  // ---------- Loan Application Form ----------
  function wireLoanApplicationForm(userId) {
    // The portal already calls submitLoanApp(event) inline. Override that global
    // so it inserts into Supabase instead of showing a fake success banner.
    window.submitLoanApp = async function (e) {
      e.preventDefault();
      const form = e.target;
      const inputs = form.querySelectorAll('.field-input, .field-select, .field-textarea');
      // Inputs by order in the markup (no name attrs in current design):
      //   0: Loan Amount, 1: Applicant Type, 2: Term, 3: Purpose,
      //   4: Collateral, 5: Notes
      const amountRaw = (inputs[0] && inputs[0].value || '').replace(/[^0-9.]/g, '');
      const amount    = amountRaw ? Number(amountRaw) : null;
      const applicantTypeText = (inputs[1] && inputs[1].value || '').toLowerCase();
      const applicantType = applicantTypeText.includes('business') ? 'business' : 'individual';
      const term       = (inputs[2] && inputs[2].value)  || '';
      const purpose    = (inputs[3] && inputs[3].value)  || '';
      const collateral = (inputs[4] && inputs[4].value)  || '';
      const notesField = (inputs[5] && inputs[5].value)  || '';
      const notes = [
        term ? 'Requested term: ' + term : null,
        collateral ? 'Collateral: ' + collateral : null,
        notesField || null
      ].filter(Boolean).join('\n\n');

      const submitBtn = form.querySelector('button[type="submit"]');
      const orig = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span>Submitting…</span>'; }

      const ok = await OnixDB.submitLoanApplication(userId, {
        amount_requested: amount,
        purpose: purpose || null,
        applicant_type: applicantType,
        notes: notes || null
      });

      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = orig; }
      const banner = document.getElementById('loan-ok');
      if (ok) {
        if (banner) banner.style.display = 'block';
        form.reset();
      } else {
        alert('Could not submit application. Please try again.');
      }
    };
  }

  // ---------- main ----------
  async function bootstrap() {
    if (!window.OnixDB) {
      console.error('[onix] supabase.js not loaded — OnixDB missing');
      return;
    }
    const gate = await OnixDB.requireClient();
    if (!gate) return; // already redirected to login
    const { profile, session } = gate;
    const userId = session.user.id;

    renderUserName(profile);

    // Fetch loan, investments, and open raises in parallel
    const [loan, investments, raises] = await Promise.all([
      OnixDB.getMyLoan(userId),
      OnixDB.getMyInvestments(userId),
      OnixDB.getOpenRaises()
    ]);

    if (loan) renderLoan(loan); else renderNoLoan();
    renderInvestments(investments);
    renderRaises(raises, userId);

    wireLoanApplicationForm(userId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
