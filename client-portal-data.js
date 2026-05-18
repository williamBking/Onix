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

  // Find every kpi cell whose label matches. Returns an array (a label like
  // "Total Invested" appears on both the Dashboard and the Investments view).
  function kpiCellsByLabel(labelText) {
    const cells = document.querySelectorAll('.kpi-cell');
    const out = [];
    cells.forEach(c => {
      const label = c.querySelector('.kpi-label');
      if (label && label.textContent.trim().toLowerCase() === labelText.toLowerCase()) {
        out.push({ cell: c, val: c.querySelector('.kpi-val'), sub: c.querySelector('.kpi-sub') });
      }
    });
    return out;
  }

  // Convenience for callers that only need one cell.
  function kpiValueByLabel(labelText) {
    return kpiCellsByLabel(labelText)[0] || { cell: null, val: null, sub: null };
  }

  // Update every kpi cell with the given label.
  function setKpi(labelText, value, subText) {
    const cells = kpiCellsByLabel(labelText);
    cells.forEach(({ val, sub }) => {
      if (val && value != null) val.textContent = value;
      if (sub && subText !== undefined) {
        if (typeof subText === 'string') sub.textContent = subText;
        else if (subText && subText.html) sub.innerHTML = subText.html;
      }
    });
  }

  function renderUserName(profile) {
    const name = profile.full_name || profile.email || 'Client';
    const first = String(name).trim().split(/\s+/)[0];
    document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = name);
    // Also replace any input pre-filled with the old demo name
    document.querySelectorAll('input[value="Carlos Mendoza"]').forEach(el => el.value = name);
    document.querySelectorAll('input[value="carlos.mendoza@email.com"]').forEach(el => el.value = profile.email || '');

    // "Welcome back, …" eyebrow on the Dashboard
    document.querySelectorAll('.page-hd .eyebrow').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (/^Welcome back/i.test(txt) || /^Bienvenid/i.test(txt)) {
        // Preserve EN/ES alternates so the language toggle still works
        el.setAttribute('data-en', 'Welcome back, ' + first);
        el.setAttribute('data-es', 'Bienvenido, ' + first);
        el.textContent = 'Welcome back, ' + first;
      }
    });
  }

  // Update the Loan Details card on the Lending tab using real loan fields.
  // Targets each `.detail-row` by its `.detail-key` label.
  function renderLoanDetails(loan) {
    const card = Array.from(document.querySelectorAll('#view-loans .card')).find(c => {
      const t = c.querySelector('.card-title');
      return t && /Loan Details/i.test(t.textContent || '');
    });
    if (!card) return;
    const setDetail = (label, value) => {
      const rows = card.querySelectorAll('.detail-row');
      rows.forEach(r => {
        const k = r.querySelector('.detail-key');
        if (k && k.textContent.trim().toLowerCase() === label.toLowerCase()) {
          const v = r.querySelector('.detail-val');
          if (v && value != null) v.textContent = value;
        }
      });
    };
    if (!loan) {
      ['Loan ID', 'Principal', 'Term', 'Origination', 'Maturity', 'Origination Fee', 'Collateral']
        .forEach(l => setDetail(l, '—'));
      // Also update the Active badge
      const badge = card.querySelector('.badge');
      if (badge) { badge.textContent = 'No loan'; badge.className = 'badge'; }
      return;
    }
    setDetail('Loan ID', loan.loan_id_display || '—');
    setDetail('Principal', fmt.money(loan.balance));
    setDetail('Term', loan.term_months != null ? loan.term_months + ' months' : '—');
    setDetail('Origination', fmt.date(loan.origination_date));
    setDetail('Maturity', fmt.date(loan.maturity_date));
    setDetail('Origination Fee', loan.origination_fee != null
      ? loan.origination_fee + '%' + (loan.balance ? ' (' + fmt.money(Number(loan.balance) * Number(loan.origination_fee) / 100) + ')' : '')
      : '—');
    setDetail('Collateral', loan.collateral_address || '—');
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.textContent = loan.status === 'active' ? 'Active'
                        : loan.status === 'paid'   ? 'Paid'
                        : loan.status === 'review' ? 'Review'
                        : loan.status || '—';
      badge.className = 'badge ' + (loan.status === 'active' ? 'badge-green'
                                  : loan.status === 'review' ? 'badge-warn'
                                  : 'badge');
    }
  }

  // Override the inline showInvestmentDetail() with one that reads real data.
  function wireInvestmentDetailModal(investments) {
    const map = new Map(investments.map(i => [i.id, i]));
    window.showInvestmentDetail = function (id) {
      const inv = map.get(id);
      if (!inv) return;
      const setT = (sel, val) => { const el = document.querySelector(sel); if (el && val != null) el.textContent = val; };
      const typeLabel = (inv.venture_type === 'deposit') ? 'Deposit · Onix Finance'
                       : (inv.venture_type === 'equity')  ? 'Equity · Private'
                       : (inv.venture_type || 'Investment');
      setT('#det-type', typeLabel);
      setT('#det-name', inv.venture_name || 'Investment');
      setT('#det-amount', fmt.money(inv.amount_invested));
      setT('#det-ownership', inv.ownership_pct != null ? fmt.pct(inv.ownership_pct) : '—');
      setT('#det-roi', inv.expected_return != null ? fmt.pct(inv.expected_return) : '—');
      setT('#det-status', inv.status === 'active' ? 'Active'
                       : inv.status === 'exited' ? 'Exited'
                       : inv.status === 'pending' ? 'Pending' : (inv.status || '—'));
      const details = document.getElementById('det-details');
      if (details) {
        const rows = [
          ['Investment Date', fmt.date(inv.start_date)],
          ['Type', typeLabel],
          ['Venture', inv.venture_name],
          ['Ownership', inv.ownership_pct != null ? fmt.pct(inv.ownership_pct) : '—'],
          ['Expected Return', inv.expected_return != null ? fmt.pct(inv.expected_return) : '—'],
          ['Status', inv.status || '—'],
          ['Amount Invested', fmt.money(inv.amount_invested)]
        ];
        details.innerHTML = rows.map(r =>
          `<div class="detail-row"><span class="detail-key">${escapeHtml(r[0])}</span><span class="detail-val">${escapeHtml(r[1] == null ? '—' : r[1])}</span></div>`
        ).join('');
      }
      const docs = document.getElementById('det-docs');
      if (docs) {
        const list = inv.investment_documents || [];
        docs.innerHTML = list.length ? list.map(d => `
          <div class="doc-row">
            <div><div class="doc-name">${escapeHtml(d.name)}</div>
              <div class="doc-meta">${escapeHtml(fmt.date(d.uploaded_at))}</div></div>
            ${d.dropbox_url ? `<a class="doc-link" href="${escapeAttr(d.dropbox_url)}" target="_blank" rel="noopener">View ↗</a>` : '<span class="doc-link" style="opacity:.5">—</span>'}
          </div>`).join('') : '<div style="padding:14px 16px;color:var(--muted);font-size:.85rem;font-style:italic">No documents on file.</div>';
      }
      // Switch to the detail view
      const all = document.querySelectorAll('.view');
      all.forEach(v => v.classList.remove('active'));
      const target = document.getElementById('view-investment-detail');
      if (target) target.classList.add('active');
    };
  }

  // Replace the Portfolio Allocation pie chart with real data.
  function renderPortfolioChart(investments) {
    const canvas = document.getElementById('allocChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const active = (investments || []).filter(i => i.status !== 'exited');
    const labels = active.map(i => i.venture_name || 'Investment');
    const data   = active.map(i => Number(i.amount_invested || 0));
    const palette = ['#C0392B','#a93226','#d56b5e','#e8a39a','#1A1A1A','#888','#bbb','#EDE8E0'];
    const colors = labels.map((_, i) => palette[i % palette.length]);

    // Destroy any existing Chart instance bound to this canvas before re-creating
    try { const ex = Chart.getChart(canvas); if (ex) ex.destroy(); } catch (e) {}
    if (!labels.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9B9590';
      ctx.font = "italic 14px 'Cormorant Garamond', serif";
      ctx.textAlign = 'center';
      ctx.fillText('No investments yet', canvas.width / 2, canvas.height / 2);
      return;
    }
    new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 }, color: '#555' } } } }
    });
  }

  function renderLoan(loan) {
    // KPIs — update EVERY matching cell on the page (Dashboard + Lending view both have these labels)
    setKpi('Outstanding Loan',    loan ? fmt.money(loan.balance) : '—',
                                  loan ? (loan.loan_id_display || '') : 'No active loan');
    setKpi('Next Payment Due',    loan ? fmt.date(loan.next_due_date) : '—',
                                  loan ? { html: fmt.money(loan.monthly_payment) + ' · <span>' + fmt.days(loan.next_due_date) + '</span>' } : 'No active loan');
    setKpi('Next Due',            loan ? fmt.date(loan.next_due_date) : '—',
                                  loan ? { html: fmt.money(loan.monthly_payment) + ' · <span>' + fmt.days(loan.next_due_date) + '</span>' } : 'No active loan');
    setKpi('Outstanding Balance', loan ? fmt.money(loan.balance)          : '—');
    setKpi('Interest Rate',       loan ? fmt.pct(loan.interest_rate)      : '—');
    setKpi('Monthly Payment',     loan ? fmt.money(loan.monthly_payment)  : '—');

    // Loan Details card (Lending tab) — real loan fields
    renderLoanDetails(loan);

    // Replace loan document rows inside the LENDING view (#view-loans) specifically,
    // and inside the Documents → "Loan" card if present.
    if (loan && loan.loan_documents && loan.loan_documents.length) {
      renderDocRowsInto(document.querySelector('#view-loans'), loan.loan_documents);
      // The "Loan · …" card in view-documents
      renderDocRowsIntoCard(document.querySelector('#view-documents'), 'Loan', loan.loan_documents, loan.loan_id_display);
    }
  }

  // Find a docs container inside `scope` and refill it with these documents.
  function renderDocRowsInto(scope, docs) {
    if (!scope) return;
    const firstDoc = scope.querySelector('.doc-row');
    if (!firstDoc) return;
    const container = firstDoc.parentElement;
    container.querySelectorAll('.doc-row').forEach(r => r.remove());
    const today = new Date();
    docs.forEach(d => {
      const row = document.createElement('div');
      row.className = 'doc-row';
      row.innerHTML =
        '<div><div class="doc-name">' + escapeHtml(d.name) + '</div>' +
        '<div class="doc-meta">PDF · ' + fmt.date(d.uploaded_at || today) + '</div></div>' +
        (d.dropbox_url
          ? '<a class="doc-link" href="' + escapeAttr(d.dropbox_url) + '" target="_blank" rel="noopener">View ↗</a>'
          : '<button class="doc-link" disabled>—</button>');
      container.appendChild(row);
    });
  }

  // Find the .card whose title starts with `titlePrefix` inside `scope`,
  // and refill its .doc-row children.
  function renderDocRowsIntoCard(scope, titlePrefix, docs, titleSuffix) {
    if (!scope) return;
    const cards = scope.querySelectorAll('.card');
    let target = null;
    cards.forEach(card => {
      const title = card.querySelector('.card-title');
      if (title && title.textContent.trim().toLowerCase().startsWith(titlePrefix.toLowerCase())) {
        target = card;
      }
    });
    if (!target) return;
    // Update title
    const title = target.querySelector('.card-title');
    if (title) title.textContent = titlePrefix + (titleSuffix ? ' · ' + titleSuffix : '');
    target.querySelectorAll('.doc-row').forEach(r => r.remove());
    const today = new Date();
    docs.forEach(d => {
      const row = document.createElement('div');
      row.className = 'doc-row';
      row.innerHTML =
        '<div><div class="doc-name">' + escapeHtml(d.name) + '</div>' +
        '<div class="doc-meta">PDF · ' + fmt.date(d.uploaded_at || today) + '</div></div>' +
        (d.dropbox_url
          ? '<a class="doc-link" href="' + escapeAttr(d.dropbox_url) + '" target="_blank" rel="noopener">Download ↓</a>'
          : '<button class="doc-link" disabled>—</button>');
      target.appendChild(row);
    });
  }

  function emptyDocsCard(scope, titlePrefix, emptyMessage) {
    if (!scope) return;
    const cards = scope.querySelectorAll('.card');
    cards.forEach(card => {
      const title = card.querySelector('.card-title');
      if (title && title.textContent.trim().toLowerCase().startsWith(titlePrefix.toLowerCase())) {
        card.querySelectorAll('.doc-row').forEach(r => r.remove());
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:14px 16px;color:var(--muted);font-size:.85rem;font-style:italic';
        empty.textContent = emptyMessage;
        card.appendChild(empty);
      }
    });
  }

  function renderNoLoan() {
    // When the user has no active loan, dim every loan KPI cell
    ['Outstanding Loan', 'Next Payment Due', 'Next Due', 'Outstanding Balance', 'Interest Rate', 'Monthly Payment']
      .forEach(label => setKpi(label, '—', 'No active loan'));
    renderLoanDetails(null);
    // Empty out the loan documents card on My Documents
    emptyDocsCard(document.querySelector('#view-documents'), 'Loan', 'No loan documents on file.');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ---------- Investments ----------
  function renderInvestments(investments) {
    // KPIs: Total Invested / ROI Earned / Across N companies
    renderInvestmentKpis(investments);
    // Documents card on the My Documents view
    renderInvestmentDocs(investments);

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
      card.setAttribute('onclick', "showInvestmentDetail('" + inv.id + "')");
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
    // Wire detail modal + portfolio chart with the same dataset
    wireInvestmentDetailModal(investments);
    renderPortfolioChart(investments);
  }

  function renderInvestmentKpis(investments) {
    const list = investments || [];
    const totalInvested = list.filter(i => i.status !== 'exited').reduce((s, i) => s + Number(i.amount_invested || 0), 0);
    const ventureCount  = list.filter(i => i.status !== 'exited').length;
    // Weighted projected annual return (sum of amount * expected_return%) / total
    const projectedDollars = list
      .filter(i => i.status !== 'exited' && i.expected_return != null)
      .reduce((s, i) => s + (Number(i.amount_invested || 0) * Number(i.expected_return) / 100), 0);
    const blendedReturn = totalInvested > 0
      ? list.filter(i => i.status !== 'exited' && i.expected_return != null)
            .reduce((s, i) => s + Number(i.amount_invested || 0) * Number(i.expected_return), 0) / totalInvested
      : null;

    setKpi('Total Invested',
      fmt.money(totalInvested),
      ventureCount === 1 ? 'Across 1 company' : `Across ${ventureCount} companies`);

    if (projectedDollars > 0) {
      setKpi('ROI Earned',
        fmt.money(projectedDollars),
        { html: (blendedReturn != null ? fmt.pct(blendedReturn) : '—') + ' <span>blended IRR</span>' });
    } else {
      // No data to compute — show a neutral state instead of fake numbers
      setKpi('ROI Earned', '—', 'No realized return yet');
    }
  }

  function renderInvestmentDocs(investments) {
    const docsView = document.querySelector('#view-documents');
    if (!docsView) return;
    const allDocs = (investments || []).flatMap(inv =>
      (inv.investment_documents || []).map(d => ({ ...d, venture_name: inv.venture_name }))
    );
    if (allDocs.length) {
      renderDocRowsIntoCard(docsView, 'Investments', allDocs);
    } else {
      emptyDocsCard(docsView, 'Investments', 'No investment documents yet.');
    }
    // No schema source for Tax & Statements yet — empty it instead of demo content
    emptyDocsCard(docsView, 'Tax', 'No tax documents on file.');
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
  function wireLoanApplicationForm(userId, profile) {
    // The portal already calls submitLoanApp(event) inline. Override that global
    // so it inserts into Supabase and triggers the email notification.
    window.submitLoanApp = async function (e) {
      e.preventDefault();
      const form = e.target;
      const inputs = form.querySelectorAll('.field-input, .field-select, .field-textarea');
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

      // Insert with .select() so we get the new row's id back for the email
      const { data: inserted, error } = await OnixDB.client
        .from('loan_applications')
        .insert([{
          user_id: userId,
          amount_requested: amount,
          purpose: purpose || null,
          applicant_type: applicantType,
          notes: notes || null
        }])
        .select('id, submitted_at')
        .single();
      const ok = !error && inserted;

      if (ok) {
        // Trigger the Resend email via Edge Function (fire-and-forget; UI doesn't block on it)
        OnixDB.client.functions.invoke('send-loan-app-email', {
          body: {
            application_id:   inserted.id,
            applicant_name:   (profile && (profile.full_name || profile.email)) || 'Unknown',
            applicant_email:  (profile && profile.email) || 'Unknown',
            amount_requested: amount,
            purpose,
            applicant_type:   applicantType,
            notes
          }
        }).catch(err => console.error('[onix] send-loan-app-email failed:', err));
      } else if (error) {
        console.error('[onix] loan_applications insert failed:', error);
      }

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

    wireLoanApplicationForm(userId, profile);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
