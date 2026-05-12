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

  // Wire the loan application form (if present) to insert into loan_applications.
  function wireLoanApplicationForm(userId) {
    const form = document.querySelector('form#loan-application-form, form[data-onix-form="loan-application"]');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const ok = await OnixDB.submitLoanApplication(userId, {
        amount_requested: Number(fd.get('amount')) || null,
        purpose:          fd.get('purpose')        || null,
        applicant_type:   fd.get('applicant_type') || null,
        notes:            fd.get('notes')          || null
      });
      const banner = document.getElementById('loan-ok');
      if (ok && banner) { banner.style.display = 'block'; form.reset(); }
      else if (!ok) alert('Could not submit application. Please try again.');
    });
  }

  // Wire "I'm Interested" buttons that carry data-raise-id
  function wireInterestButtons(userId) {
    document.querySelectorAll('[data-raise-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const raiseId = btn.getAttribute('data-raise-id');
        const ok = await OnixDB.submitRaiseInterest(userId, raiseId);
        if (ok) {
          btn.textContent = '✓ Interest recorded';
          btn.disabled = true;
        } else {
          alert('Could not record interest. Please try again.');
        }
      });
    });
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

    const loan = await OnixDB.getMyLoan(userId);
    if (loan) renderLoan(loan); else renderNoLoan();

    wireLoanApplicationForm(userId);
    wireInterestButtons(userId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
