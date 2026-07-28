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

  // Chart.js only shows tooltips on hover by default. Clicking anywhere
  // along the X axis finds the nearest point and shows its tooltip too —
  // handy on touch devices, or for anyone who'd rather click than hover.
  // Charts here get destroyed and recreated on every re-render, so this
  // just needs to be called again each time a chart is (re)created.
  function enableClickToShowValue(chart) {
    if (!chart) return;
    chart.canvas.addEventListener('click', (evt) => {
      const points = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
      if (!points.length) return;
      chart.tooltip.setActiveElements(points, { x: evt.offsetX, y: evt.offsetY });
      chart.update();
    });
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
      if (val && value != null) {
        val.textContent = value;
        // Drop stale i18n attrs so the EN/ES MutationObserver doesn't
        // overwrite the live value with the bundled demo string.
        val.removeAttribute('data-en');
        val.removeAttribute('data-es');
      }
      if (sub && subText !== undefined) {
        if (typeof subText === 'string') {
          sub.textContent = subText;
          sub.removeAttribute('data-en');
          sub.removeAttribute('data-es');
        } else if (subText && (subText.en != null || subText.es != null)) {
          // Bilingual sub: keep the EN/ES toggle working.
          sub.setAttribute('data-en', subText.en || '');
          sub.setAttribute('data-es', subText.es || '');
          const lang = (window.OnixLang && OnixLang.getLang && OnixLang.getLang()) || 'en';
          sub.textContent = (lang === 'es' ? subText.es : subText.en) || subText.en || '';
        } else if (subText && subText.html) {
          sub.innerHTML = subText.html;
          sub.removeAttribute('data-en');
          sub.removeAttribute('data-es');
        }
      }
    });
  }

  function computeInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    const first = parts[0][0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  function renderUserName(profile) {
    const name = profile.full_name || profile.email || 'Client';
    const first = String(name).trim().split(/\s+/)[0];
    const initials = computeInitials(profile.full_name || profile.email);
    document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = name);
    document.querySelectorAll('.sidebar-avatar').forEach(el => el.textContent = initials);
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

  // Wire the Profile tab: fill inputs from the real profile, and make Save
  // Changes actually update Supabase.
  function wireProfileForm(profile, userId) {
    const view = document.querySelector('#view-profile');
    if (!view) return;
    const card = Array.from(view.querySelectorAll('.card')).find(c => {
      const t = c.querySelector('.card-title');
      return t && /Personal Information/i.test(t.textContent || '');
    });
    if (!card) return;
    const fields = card.querySelectorAll('.field-input');
    if (fields.length < 5) return;
    // Pre-fill from real profile
    fields[0].value = profile.full_name || '';
    fields[1].value = profile.email || '';
    fields[1].setAttribute('readonly', 'readonly');
    fields[1].style.background = '#f4f4f4';
    fields[1].style.cursor = 'not-allowed';
    fields[1].setAttribute('title', 'Email cannot be changed from here');
    fields[2].value = profile.phone || '';
    fields[3].value = profile.address || '';
    // date_of_birth is stored as YYYY-MM-DD, which is exactly what
    // <input type="date"> expects — no conversion needed either direction.
    fields[4].value = profile.date_of_birth || '';

    const saveBtn = card.querySelector('.btn-red');
    if (!saveBtn) return;
    // Replace the alert-based onclick with a real save
    saveBtn.removeAttribute('onclick');
    // Avoid attaching multiple listeners on repeated renders
    if (saveBtn.dataset.onixWired === '1') return;
    saveBtn.dataset.onixWired = '1';
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const orig = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>Saving…</span>';
      const payload = {
        full_name:     (fields[0].value || '').trim() || null,
        phone:         (fields[2].value || '').trim() || null,
        address:       (fields[3].value || '').trim() || null,
        date_of_birth: fields[4].value || null
      };
      const { error } = await OnixDB.client
        .from('profiles')
        .update(payload)
        .eq('id', userId);
      saveBtn.disabled = false;
      saveBtn.innerHTML = orig;
      if (error) {
        alert('Could not save profile: ' + error.message);
        return;
      }
      // Reflect the new name everywhere on the page
      profile.full_name     = payload.full_name;
      profile.phone         = payload.phone;
      profile.address       = payload.address;
      profile.date_of_birth = payload.date_of_birth;
      renderUserName(profile);
      // Small inline confirmation
      let banner = card.querySelector('[data-onix-profile-ok]');
      if (!banner) {
        banner = document.createElement('div');
        banner.setAttribute('data-onix-profile-ok', '1');
        banner.style.cssText = 'margin-top:14px;padding:10px 12px;background:var(--success-bg);color:var(--success-text);border-left:3px solid var(--success);font-size:.85rem';
        banner.textContent = '✓ Profile updated';
        saveBtn.after(banner);
      }
      banner.style.opacity = '1';
      setTimeout(() => { banner.style.transition = 'opacity 1s'; banner.style.opacity = '0'; }, 2500);
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
      // Also update the Active badge. Setting data-en/data-es too — a
      // periodic language-toggle sync re-reads those attributes and would
      // otherwise silently put "Active" back a moment after this runs.
      const badge = card.querySelector('.badge');
      if (badge) {
        badge.textContent = 'No loan';
        badge.className = 'badge';
        badge.setAttribute('data-en', 'No loan');
        badge.setAttribute('data-es', 'Sin préstamo');
      }
      return;
    }
    // "Principal" is the ORIGINAL loan amount (does not change as payments are made).
    // Fall back to current balance for legacy loans without principal_amount.
    const principal = loan.principal_amount != null ? loan.principal_amount : loan.balance;
    setDetail('Loan ID', loan.loan_id_display || '—');
    setDetail('Principal', fmt.money(principal));
    setDetail('Term', loan.term_months != null ? loan.term_months + ' months' : '—');
    setDetail('Origination', fmt.date(loan.origination_date));
    setDetail('Maturity', fmt.date(loan.maturity_date));
    setDetail('Origination Fee', loan.origination_fee != null
      ? loan.origination_fee + '%' + (principal ? ' (' + fmt.money(Number(principal) * Number(loan.origination_fee) / 100) + ')' : '')
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
  function wireInvestmentDetailModal(investments, distributions) {
    const map = new Map(investments.map(i => [i.id, i]));
    const allDist = distributions || [];
    const distKindLabel = (k) => ({
      distribution: 'Distribution', interest: 'Interest', dividend: 'Dividend',
      return_of_capital: 'Return of Capital', other: 'Other'
    })[k] || (k || 'Distribution');

    window.showInvestmentDetail = function (id) {
      const inv = map.get(id);
      if (!inv) return;
      const setT = (sel, val) => { const el = document.querySelector(sel); if (el && val != null) el.textContent = val; };
      const typeLabel = (inv.venture_type === 'deposit') ? 'Deposit · Onix Finance'
                       : (inv.venture_type === 'equity')  ? 'Equity · Private'
                       : (inv.venture_type || 'Investment');

      // Distributions for THIS investment (newest first)
      const myDist = allDist
        .filter(d => d.investment_id === inv.id)
        .sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0));
      const totalDist = myDist.reduce((s, d) => s + Number(d.amount || 0), 0);
      const invested  = Number(inv.amount_invested || 0);
      const currentValue = invested + totalDist;          // simple: principal + payouts received
      const totalReturnPct = invested > 0 ? (totalDist / invested) * 100 : null;

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
          ['Amount Invested', fmt.money(inv.amount_invested)],
          ['Distributions to Date', fmt.money(totalDist)],
          ['Current Value', fmt.money(currentValue)],
          ['Total Return', totalReturnPct != null ? fmt.pct(totalReturnPct) : '—']
        ];
        if (inv._monthly_payment != null) {
          rows.push(['Monthly Payment', fmt.money(inv._monthly_payment)]);
        }
        details.innerHTML = rows.map(r =>
          `<div class="detail-row"><span class="detail-key">${escapeHtml(r[0])}</span><span class="detail-val">${escapeHtml(r[1] == null ? '—' : r[1])}</span></div>`
        ).join('');
      }

      // Distribution history table (#det-distributions tbody)
      const distBody = document.getElementById('det-distributions');
      if (distBody) {
        distBody.innerHTML = myDist.length
          ? myDist.map(d => `
            <tr>
              <td>${escapeHtml(fmt.date(d.paid_at))}</td>
              <td>${escapeHtml(distKindLabel(d.kind))}</td>
              <td>${escapeHtml(fmt.money(d.amount))}</td>
            </tr>`).join('') +
            `<tr style="font-weight:700">
              <td>Total</td><td></td><td>${escapeHtml(fmt.money(totalDist))}</td>
            </tr>`
          : '<tr><td colspan="3" style="padding:14px 16px;color:var(--muted);font-size:.85rem;font-style:italic">No distributions yet.</td></tr>';
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

      // Tier 2: performance card (annualized return, progress vs target,
      // cash-flow chart, next-distribution estimate).
      renderInvestmentPerformance(inv, myDist, { invested, totalDist, currentValue });

      // Switch to the detail view
      const all = document.querySelectorAll('.view');
      all.forEach(v => v.classList.remove('active'));
      const target = document.getElementById('view-investment-detail');
      if (target) {
        target.classList.add('active');
        // CRITICAL: this view's cards use the .reveal animation (opacity:0
        // until .visible). showView() normally adds .visible, but we switch
        // views manually here — so reveal them ourselves or the page is blank.
        target.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
        window.scrollTo(0, 0);
      }
    };
  }

  // Tier 2 "Performance" card for the investment detail view. Injected once
  // (before the Documents card) and refreshed on each open. All derived from
  // real data: amount invested, distribution history, start date, expected
  // (annual) return target.
  function renderInvestmentPerformance(inv, myDist, totals) {
    const view = document.getElementById('view-investment-detail');
    if (!view) return;
    const invested = Number(totals.invested || 0);
    const totalDist = Number(totals.totalDist || 0);

    // Holding period in years (from start_date to today)
    let years = null;
    if (inv.start_date) {
      const ms = Date.now() - new Date(inv.start_date).getTime();
      if (ms > 0) years = ms / (365.25 * 24 * 3600 * 1000);
    }
    const totalReturnPct = invested > 0 ? (totalDist / invested) * 100 : 0;
    // Compound annualized return on (invested + distributions) vs invested.
    let annualizedPct = null;
    if (invested > 0 && years && years >= 0.08) {
      annualizedPct = (Math.pow((invested + totalDist) / invested, 1 / years) - 1) * 100;
    } else if (invested > 0 && years) {
      annualizedPct = totalReturnPct; // too early to annualize meaningfully
    }
    const targetPct = inv.expected_return != null ? Number(inv.expected_return) : null;
    // Tracking vs the annual target (both annual %), capped 0..100 for the bar.
    const trackPct = (targetPct && annualizedPct != null && targetPct > 0)
      ? Math.max(0, Math.min(100, (annualizedPct / targetPct) * 100)) : null;

    // Next distribution estimate from the average gap between payouts.
    let nextEst = null;
    const sortedAsc = myDist.slice().filter(d => d.paid_at).sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at));
    if (sortedAsc.length >= 2) {
      let gaps = 0;
      for (let i = 1; i < sortedAsc.length; i++) {
        gaps += new Date(sortedAsc[i].paid_at) - new Date(sortedAsc[i - 1].paid_at);
      }
      const avgGap = gaps / (sortedAsc.length - 1);
      nextEst = new Date(new Date(sortedAsc[sortedAsc.length - 1].paid_at).getTime() + avgGap);
    }

    // Build / locate the card (insert before the Documents card)
    let card = document.getElementById('det-performance');
    if (!card) {
      card = document.createElement('div');
      card.id = 'det-performance';
      card.className = 'card reveal visible';
      const docsCard = (document.getElementById('det-docs') || {}).closest
        ? document.getElementById('det-docs').closest('.card') : null;
      if (docsCard && docsCard.parentElement) docsCard.parentElement.insertBefore(card, docsCard);
      else view.appendChild(card);
    }
    card.classList.add('visible');

    const stat = (label, val) =>
      '<div style="flex:1;min-width:120px"><div style="font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;margin-bottom:6px">' +
      escapeHtml(label) + '</div><div style="font-family:var(--serif);font-style:italic;font-size:1.35rem;font-weight:500">' + escapeHtml(val) + '</div></div>';

    card.innerHTML =
      '<div class="card-title" data-en="Performance" data-es="Rendimiento">Performance</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:20px">' +
        stat('Total Return', fmt.pct(totalReturnPct)) +
        stat('Annualized (est.)', annualizedPct != null ? fmt.pct(annualizedPct) : '—') +
        stat('Target Return', targetPct != null ? fmt.pct(targetPct) : '—') +
        stat('Next Distribution (est.)', nextEst ? fmt.date(nextEst.toISOString()) : '—') +
      '</div>' +
      (trackPct != null
        ? '<div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:6px">' +
            '<span style="color:var(--muted)">Tracking vs ' + fmt.pct(targetPct) + ' annual target</span>' +
            '<span style="color:var(--red);font-weight:700">' + trackPct.toFixed(0) + '%</span></div>' +
          '<div class="progress-wrap" style="height:8px;margin-bottom:22px"><div class="progress-fill" style="width:' + trackPct.toFixed(1) + '%"></div></div>'
        : '') +
      '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;margin-bottom:10px">Distributions Over Time</div>' +
      '<div style="height:200px;position:relative"><canvas id="det-cashflow-chart"></canvas></div>';

    // Cash-flow chart: each distribution as a bar by date.
    const canvas = document.getElementById('det-cashflow-chart');
    if (canvas && typeof Chart !== 'undefined') {
      try { const ex = Chart.getChart(canvas); if (ex) ex.destroy(); } catch (e) {}
      if (sortedAsc.length) {
        const cashflowChart = new Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: sortedAsc.map(d => new Date(d.paid_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })),
            datasets: [{
              data: sortedAsc.map(d => Number(d.amount || 0)),
              backgroundColor: '#C0392B', borderWidth: 0, borderRadius: 2, maxBarThickness: 38
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '$' + Number(c.parsed.y).toLocaleString() } } },
            scales: {
              y: { grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 10 }, callback: v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v) } },
              x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } }
            }
          }
        });
        enableClickToShowValue(cashflowChart);
      } else {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9B9590'; ctx.font = "italic 14px 'Cormorant Garamond', serif"; ctx.textAlign = 'center';
        ctx.fillText('No distributions yet', canvas.width / 2, canvas.height / 2);
      }
    }
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

  // Top-level Lending tab orchestrator. Renders a loan picker (only visible
  // when the client has 2+ loans) plus the detail card for whichever loan
  // is currently selected. Switching the picker re-runs renderLoan against
  // the new selection — no full page refresh, no re-fetch.
  function renderLoanView(loans, payments) {
    if (!loans || !loans.length) { renderNoLoan(); return; }

    // Remember the user's last choice across page loads.
    const STORE_KEY = 'onix-selected-loan';
    const stored = localStorage.getItem(STORE_KEY);
    let current = loans.find(l => l.id === stored) || loans[0];

    // Shared selection handler — runs whichever picker fires (My Loan or
    // Payments) and keeps the OTHER picker's value in sync.
    function onPick(nextId) {
      const next = loans.find(l => l.id === nextId);
      if (!next) return;
      current = next;
      localStorage.setItem(STORE_KEY, nextId);
      renderLoan(next, payments);
      renderPayments(payments, next);
      document.querySelectorAll('[data-onix-loan-select]').forEach(sel => {
        if (sel.value !== nextId) sel.value = nextId;
      });
    }

    renderLoanSelector(loans, current.id, onPick, '#view-loans');
    renderLoanSelector(loans, current.id, onPick, '#view-payments');

    renderLoan(current, payments);
    renderPayments(payments, current);
  }

  // Inject (or update) a labeled <select> at the top of a view that lists
  // every active loan by its loan_id_display. Hidden when there's only one
  // loan — no need to clutter the UI. Used on both the My Loan and Payments
  // tabs; viewSelector picks which.
  function renderLoanSelector(loans, currentLoanId, onChange, viewSelector) {
    const view = document.querySelector(viewSelector || '#view-loans');
    if (!view) return;

    let host = view.querySelector('[data-onix-loan-picker]');

    if (loans.length < 2) {
      if (host) host.remove();
      return;
    }

    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-onix-loan-picker', '1');
      host.style.cssText = 'display:flex;align-items:center;gap:14px;margin:0 0 22px;padding:12px 16px;background:#fff;border:1px solid var(--border);border-left:3px solid var(--red)';

      const label = document.createElement('span');
      label.style.cssText = 'font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;flex-shrink:0';
      label.setAttribute('data-en', 'Select Loan');
      label.setAttribute('data-es', 'Seleccionar Préstamo');
      label.textContent = 'Select Loan';
      host.appendChild(label);

      const select = document.createElement('select');
      select.setAttribute('data-onix-loan-select', '1');
      select.style.cssText = 'flex:1;padding:9px 12px;border:1px solid var(--border);background:#fff;font-family:inherit;font-size:.92rem;color:var(--dark);outline:none;border-radius:2px;cursor:pointer';
      select.addEventListener('focus', () => { select.style.borderColor = 'var(--red)'; });
      select.addEventListener('blur',  () => { select.style.borderColor = 'var(--border)'; });
      select.addEventListener('change', () => onChange(select.value));
      host.appendChild(select);

      const count = document.createElement('span');
      count.setAttribute('data-onix-loan-count', '1');
      count.style.cssText = 'font-size:.74rem;color:var(--light);font-style:italic;flex-shrink:0';
      host.appendChild(count);

      // Insert just below the page header (or at the top of the view if no header)
      const header = view.querySelector('.page-hd');
      if (header && header.parentElement === view) {
        header.after(host);
      } else {
        view.insertBefore(host, view.firstChild);
      }
    }

    const select = host.querySelector('[data-onix-loan-select]');
    const count  = host.querySelector('[data-onix-loan-count]');

    // Rebuild options (data may have changed between renders)
    select.innerHTML = loans.map(l => {
      const label = (l.loan_id_display || 'Loan') +
                    ' · ' + fmt.money(l.balance) +
                    (l.status && l.status !== 'active' ? ' · ' + l.status : '');
      return '<option value="' + l.id + '"' +
             (l.id === currentLoanId ? ' selected' : '') + '>' +
             escapeHtml(label) + '</option>';
    }).join('');

    if (count) count.textContent = loans.length + ' active loans';
  }

  function renderLoan(loan, payments) {
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

    // Repayment progress card — bar width, percent label, paid X-of-Y, dates,
    // and the Paid-to-Date / Remaining / Total Interest summary boxes all from real data.
    renderRepaymentProgress(loan, payments || []);

    // My Loan tab "Loan Documents" card — show every real doc tied to this
    // loan: admin-uploaded loan_documents PLUS the supporting docs the
    // client uploaded on the original loan application (linked via
    // client_documents.application_id = loan.application_id).
    renderLoanDocsCardForLoan(loan).catch(err =>
      console.error('[onix] loan docs render failed:', err)
    );
    // My Documents tab "Loan" card keeps mirroring admin-uploaded loan_documents
    // (application supporting docs already appear there under their own header).
    if (loan && loan.loan_documents && loan.loan_documents.length) {
      renderDocRowsIntoCard(document.querySelector('#view-documents'), 'Loan', loan.loan_documents, loan.loan_id_display);
    }
  }

  // Combined doc list for the My Loan tab. loan_documents rows can come with
  // either a dropbox_url or a storage_path; client_documents rows from the
  // application form always have a storage_path. Both render as a View ↗
  // link that resolves a 1-hour signed URL for storage-backed files.
  async function renderLoanDocsCardForLoan(loan) {
    const card = findCardByTitle(document.querySelector('#view-loans'),
      txt => /Loan Documents|Documentos/i.test(txt));
    if (!card) return;

    // Pull supporting docs uploaded with the loan's application
    let appDocs = [];
    if (loan && loan.application_id) {
      const { data, error } = await OnixDB.client
        .from('client_documents')
        .select('id, name, storage_path, dropbox_url, uploaded_at')
        .eq('application_id', loan.application_id)
        .order('uploaded_at', { ascending: false });
      if (error) console.error('[onix] application docs fetch failed:', error);
      appDocs = (data || []).map(d => Object.assign({ source: 'application' }, d));
    }
    const loanDocs = (loan && loan.loan_documents || []).map(d =>
      Object.assign({ source: 'loan' }, d));
    const allDocs = loanDocs.concat(appDocs).sort((a, b) =>
      new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));

    // Clear the hardcoded rows + any prior empty/state markers
    card.querySelectorAll('.doc-row, [data-loan-docs-empty]').forEach(el => el.remove());

    if (!allDocs.length) {
      const empty = document.createElement('div');
      empty.setAttribute('data-loan-docs-empty', '');
      empty.style.cssText = 'padding:18px;color:var(--light);font-style:italic;text-align:center;font-size:.84rem';
      empty.setAttribute('data-en', 'No loan documents on file yet.');
      empty.setAttribute('data-es', 'Aún no hay documentos.');
      empty.textContent = 'No loan documents on file yet.';
      card.appendChild(empty);
      return;
    }

    allDocs.forEach(d => {
      const row = document.createElement('div');
      row.className = 'doc-row';
      const dateStr = fmt.date(d.uploaded_at || new Date());
      const sourceLbl = d.source === 'application' ? 'From your application' : 'Loan document';
      let actionHtml;
      if (d.storage_path) {
        actionHtml =
          '<a href="#" class="doc-link" data-loandocs-storage-path="' +
          escapeAttr(d.storage_path) + '">View ↗</a>';
      } else if (d.dropbox_url) {
        actionHtml =
          '<a class="doc-link" href="' + escapeAttr(d.dropbox_url) +
          '" target="_blank" rel="noopener">View ↗</a>';
      } else {
        actionHtml = '<button class="doc-link" disabled>—</button>';
      }
      row.innerHTML =
        '<div><div class="doc-name">' + escapeHtml(d.name) + '</div>' +
        '<div class="doc-meta">' + escapeHtml(sourceLbl) + ' · ' + escapeHtml(dateStr) + '</div></div>' +
        actionHtml;
      card.appendChild(row);
    });

    // Wire storage-backed View links to generate signed URLs on click
    card.querySelectorAll('[data-loandocs-storage-path]').forEach(a => {
      a.addEventListener('click', async e => {
        e.preventDefault();
        const path = a.getAttribute('data-loandocs-storage-path');
        const orig = a.textContent;
        a.textContent = 'Opening…';
        const r = await OnixDB.client.storage
          .from('client-documents').createSignedUrl(path, 3600);
        a.textContent = orig;
        if (r.error || !r.data) {
          alert('Could not open file: ' + (r.error && r.error.message || 'unknown'));
          return;
        }
        window.open(r.data.signedUrl, '_blank', 'noopener');
      });
    });
  }

  // Drive the Repayment Progress card on the Lending tab from real loan + payment data.
  // Updates: card title, "Paid — X of Y months" text, percent badge, progress bar fill,
  // origination/maturity date range, and the three summary boxes (Paid to Date,
  // Remaining, Total Interest).
  function renderRepaymentProgress(loan, payments) {
    const bar = document.getElementById('loanProgress');
    if (!bar) return;
    const wrap = bar.closest('.card') || document.querySelector('#view-loans');

    if (!loan) {
      // No active loan — reset the whole card instead of leaving the
      // bundled demo content (title, dates, paid/remaining figures) showing.
      bar.style.width = '0%';
      bar.setAttribute('aria-valuenow', '0');
      if (wrap) {
        const title = wrap.querySelector('.card-title');
        if (title) {
          title.textContent = 'Repayment Progress';
          if (title.hasAttribute('data-en')) title.setAttribute('data-en', title.textContent);
        }
        const progressWrap = wrap.querySelector('.progress-wrap');
        const headerRow = progressWrap ? progressWrap.previousElementSibling : null;
        if (headerRow) {
          const spans = headerRow.querySelectorAll('span');
          if (spans[0]) {
            spans[0].textContent = 'No active loan';
            if (spans[0].hasAttribute('data-en')) spans[0].setAttribute('data-en', spans[0].textContent);
          }
          if (spans[1]) spans[1].textContent = '—';
        }
        const dateRow = progressWrap ? progressWrap.nextElementSibling : null;
        if (dateRow) {
          const dateSpans = dateRow.querySelectorAll('span');
          if (dateSpans[0]) dateSpans[0].textContent = '—';
          if (dateSpans[1]) dateSpans[1].textContent = '—';
        }
        const boxes = wrap.querySelectorAll('div[style*="display:grid"] > div, div[style*="display: grid"] > div');
        boxes.forEach(box => {
          if (box.children.length >= 2) box.children[1].textContent = '—';
        });
      }
      return;
    }

    // Filter payments to this loan only (getMyPayments returns all of the user's payments)
    const myPayments = (payments || []).filter(p => p.loan_id === loan.id);
    const paidRows   = myPayments.filter(p => p.status === 'paid');

    const principal = Number(loan.principal_amount != null ? loan.principal_amount : loan.balance) || 0;
    const balance   = Number(loan.balance) || 0;
    const paidPrincipal = Math.max(0, principal - balance);
    const pct       = principal > 0 ? Math.max(0, Math.min(100, (paidPrincipal / principal) * 100)) : 0;

    bar.style.width = pct.toFixed(2) + '%';
    bar.setAttribute('aria-valuenow', pct.toFixed(1));

    if (!wrap) return;

    // 1. Card title — "Repayment Progress · ONX-2025-0042 · 24-month term"
    const title = wrap.querySelector('.card-title');
    if (title) {
      const idPart   = loan.loan_id_display ? ' · ' + loan.loan_id_display : '';
      const termPart = loan.term_months != null ? ' · ' + loan.term_months + '-month term' : '';
      title.textContent = 'Repayment Progress' + idPart + termPart;
      if (title.hasAttribute('data-en')) title.setAttribute('data-en', title.textContent);
    }

    // 2. "Paid — X of Y months" muted span (left) + percent badge (right) above the bar.
    //    The HTML has this as the first non-title flex row inside the card.
    const progressWrap = wrap.querySelector('.progress-wrap');
    const headerRow = progressWrap ? progressWrap.previousElementSibling : null;
    if (headerRow) {
      const spans = headerRow.querySelectorAll('span');
      if (spans.length >= 2) {
        const paidMonths = paidRows.length;
        const totalMonths = loan.term_months != null ? loan.term_months : '—';
        spans[0].textContent = 'Paid — ' + paidMonths + ' of ' + totalMonths +
          (totalMonths === 1 ? ' month' : ' months');
        if (spans[0].hasAttribute('data-en')) spans[0].setAttribute('data-en', spans[0].textContent);
        spans[1].textContent = pct.toFixed(1) + '%';
      }
    }

    // 3. Origination / Maturity date range below the bar (next sibling of progress-wrap)
    const dateRow = progressWrap ? progressWrap.nextElementSibling : null;
    if (dateRow) {
      const dateSpans = dateRow.querySelectorAll('span');
      const formatMonthYear = (d) => {
        if (!d) return '—';
        const dt = new Date(d);
        if (isNaN(dt)) return '—';
        return dt.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      };
      if (dateSpans[0]) dateSpans[0].textContent = formatMonthYear(loan.origination_date);
      if (dateSpans[1]) dateSpans[1].textContent = formatMonthYear(loan.maturity_date);
    }

    // 4. The three summary boxes: Paid to Date / Remaining / Total Interest.
    //    Find them by their label text (more resilient than positional indexing).
    const totalPaid     = paidRows.reduce((s, p) => s + Number(p.amount_due || 0), 0);
    const totalInterest = paidRows.reduce((s, p) => s + Number(p.interest   || 0), 0);
    const summaryValues = {
      'paid to date':   fmt.money(totalPaid),
      'remaining':      fmt.money(balance),
      'total interest': fmt.money(totalInterest)
    };

    const boxes = wrap.querySelectorAll('div[style*="display:grid"] > div, div[style*="display: grid"] > div');
    boxes.forEach(box => {
      const children = box.children;
      if (children.length < 2) return;
      const label = (children[0].textContent || '').trim().toLowerCase();
      const value = summaryValues[label];
      if (value != null) children[1].textContent = value;
    });
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
    renderRepaymentProgress(null, []);
    // "Loan Documents" card on the My Loan tab itself — already handles
    // loan == null correctly, just was never called from this path.
    renderLoanDocsCardForLoan(null).catch(err =>
      console.error('[onix] loan docs render failed:', err)
    );
    // Empty out the loan documents card on My Documents
    emptyDocsCard(document.querySelector('#view-documents'), 'Loan', 'No loan documents on file.');
    // The page header's "Active Loan" eyebrow is static demo text — update
    // it too so the page doesn't imply a loan exists when it doesn't.
    const eyebrow = document.querySelector('#view-loans .page-hd .eyebrow');
    if (eyebrow) {
      eyebrow.textContent = 'No Active Loan';
      eyebrow.setAttribute('data-en', 'No Active Loan');
      eyebrow.setAttribute('data-es', 'Sin Préstamo Activo');
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ---------- Investments ----------
  function renderInvestments(investments, distributions) {
    // KPIs: Total Invested / ROI Expected / Across N companies
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
    wireInvestmentDetailModal(investments, distributions || []);
    renderPortfolioChart(investments);
  }

  function renderInvestmentKpis(investments) {
    const list = investments || [];
    const activeRows = list.filter(i => i.status !== 'exited');
    const totalInvested = activeRows.reduce((s, i) => s + Number(i.amount_invested || 0), 0);
    // Count UNIQUE companies, not rows — a client may have multiple
    // investments in the same venture (e.g. two top-ups into Bari Caffè).
    const uniqueVentures = new Set(
      activeRows
        .map(i => (i.venture_name || '').trim().toLowerCase())
        .filter(n => n)
    );
    const ventureCount = uniqueVentures.size;
    // Weighted projected annual return (sum of amount * expected_return%) / total
    const projectedDollars = activeRows
      .filter(i => i.expected_return != null)
      .reduce((s, i) => s + (Number(i.amount_invested || 0) * Number(i.expected_return) / 100), 0);
    const blendedReturn = totalInvested > 0
      ? activeRows.filter(i => i.expected_return != null)
            .reduce((s, i) => s + Number(i.amount_invested || 0) * Number(i.expected_return), 0) / totalInvested
      : null;

    const subEn = ventureCount === 0 ? 'No active investments'
                : ventureCount === 1 ? 'Across 1 company'
                : `Across ${ventureCount} companies`;
    const subEs = ventureCount === 0 ? 'Sin inversiones activas'
                : ventureCount === 1 ? 'En 1 empresa'
                : `En ${ventureCount} empresas`;
    setKpi('Total Invested', fmt.money(totalInvested), { en: subEn, es: subEs });

    if (projectedDollars > 0) {
      setKpi('ROI Expected',
        fmt.money(projectedDollars),
        { html: (blendedReturn != null ? fmt.pct(blendedReturn) : '—') + ' <span>blended IRR</span>' });
    } else {
      // No data to compute — show a neutral state instead of fake numbers
      setKpi('ROI Expected', '—', 'No realized return yet');
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
  // Update the small count badges on the client sidebar (e.g. the hardcoded
  // "3" next to Investment Opportunities). Matches each sidebar item by its
  // data-en label, patches the .sidebar-item-badge inside it, and hides the
  // badge when the count is zero.
  function paintClientSidebarBadges(data) {
    const counts = {
      'Investment Opportunities': (data.raises || []).length
    };
    document.querySelectorAll('.sidebar-item-badge').forEach(badge => {
      const parent = badge.closest('button, a');
      if (!parent) return;
      const labelEl = parent.querySelector('[data-en]');
      const key = labelEl ? labelEl.getAttribute('data-en') : '';
      if (!(key in counts)) return;
      const n = counts[key];
      const desired = String(n);
      if (badge.textContent !== desired) badge.textContent = desired;
      badge.style.display = n > 0 ? '' : 'none';
    });
  }

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

    // Wire details buttons — open the real raise details modal
    document.querySelectorAll('[data-raise-details]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Stop the document-level "view details" delegated listener (which
        // falls back to a hardcoded OPP_DATA map) from also firing.
        e.preventDefault();
        e.stopPropagation();
        const raiseId = btn.getAttribute('data-raise-details');
        const raise   = raises.find(x => x.id === raiseId);
        if (raise) openRaiseDetailsModal(raise, userId);
      });
    });
  }

  // Standalone styled modal for an Open Raise. Reuses the existing
  // .cp-overlay / .cp-sheet shell so it matches the rest of the portal.
  function ensureRaiseDetailsModal() {
    if (document.getElementById('cp-raise-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'cp-raise-modal';
    overlay.className = 'cp-overlay';
    overlay.innerHTML =
      '<div class="cp-sheet wide">' +
        '<div class="cp-hd">' +
          '<div>' +
            '<div class="cp-eyebrow">Investment Opportunity</div>' +
            '<h2 id="cp-rd-name">Opportunity</h2>' +
            '<div class="cp-sub" id="cp-rd-sub"></div>' +
          '</div>' +
          '<button class="cp-close" data-rd-close type="button">×</button>' +
        '</div>' +
        '<div class="cp-body">' +
          '<div id="cp-rd-kpis" class="opp-detail-kpi"></div>' +
          '<p id="cp-rd-desc" style="font-size:.88rem;line-height:1.65;color:var(--muted);margin-bottom:18px"></p>' +
          '<div id="cp-rd-structure-section" style="margin-bottom:18px">' +
            '<div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px">Structure</div>' +
            '<div id="cp-rd-structure" style="font-size:.88rem;line-height:1.55;color:var(--dark)"></div>' +
          '</div>' +
          '<div id="cp-rd-docs-section" style="margin-bottom:18px">' +
            '<div style="font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px">Documents</div>' +
            '<div id="cp-rd-docs"></div>' +
          '</div>' +
          '<div style="height:1px;background:var(--border);margin:20px 0"></div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
            '<div style="flex:1;height:6px;background:#f0f0f0;border-radius:3px;overflow:hidden">' +
              '<div id="cp-rd-bar" style="height:100%;background:var(--red);border-radius:3px;transition:width 1s cubic-bezier(.4,0,.2,1)"></div>' +
            '</div>' +
            '<span id="cp-rd-pct" style="font-size:.78rem;font-weight:700;color:var(--red);white-space:nowrap"></span>' +
          '</div>' +
          '<div id="cp-rd-progress-meta" style="display:flex;justify-content:space-between;font-size:.74rem;color:var(--light)"></div>' +
        '</div>' +
        '<div class="cp-footer">' +
          '<button class="cp-btn cp-btn-ghost" data-rd-close type="button">Close</button>' +
          '<button class="cp-btn cp-btn-red" id="cp-rd-interest-btn" type="button">Express Interest →</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
    overlay.querySelectorAll('[data-rd-close]').forEach(b =>
      b.addEventListener('click', () => overlay.classList.remove('show')));
  }

  function openRaiseDetailsModal(raise, userId) {
    ensureRaiseDetailsModal();
    const minIRR = raise.projected_return_min;
    const maxIRR = raise.projected_return_max;
    const irrTxt = (minIRR != null && maxIRR != null)
      ? minIRR + '–' + maxIRR + '%'
      : (maxIRR != null ? maxIRR + '%' : '—');
    const typeLbl = raise.venture_type === 'deposit' ? 'Deposit · Onix Finance'
                  : raise.venture_type === 'equity'  ? 'Equity · Private'
                  : (raise.venture_type || '');

    document.getElementById('cp-rd-name').textContent = raise.venture_name || 'Opportunity';
    document.getElementById('cp-rd-sub').textContent  = typeLbl;
    document.getElementById('cp-rd-kpis').innerHTML =
      '<div class="kc"><div class="kc-lbl">Target IRR</div><div class="kc-val">' + escapeHtml(irrTxt) + '</div></div>' +
      '<div class="kc"><div class="kc-lbl">Hold Period</div><div class="kc-val">' + escapeHtml(raise.investment_horizon || '—') + '</div></div>' +
      '<div class="kc"><div class="kc-lbl">Minimum</div><div class="kc-val">' + fmt.money(raise.minimum_investment) + '</div></div>' +
      '<div class="kc"><div class="kc-lbl">Raise Goal</div><div class="kc-val">' + fmt.money(raise.total_raise_target) + '</div></div>';
    document.getElementById('cp-rd-desc').textContent = raise.description || '';

    const structureSection = document.getElementById('cp-rd-structure-section');
    if (raise.structure) {
      document.getElementById('cp-rd-structure').textContent = raise.structure;
      structureSection.style.display = '';
    } else {
      structureSection.style.display = 'none';
    }

    const docs = raise.raise_documents || [];
    const docsSection = document.getElementById('cp-rd-docs-section');
    if (docs.length) {
      document.getElementById('cp-rd-docs').innerHTML = docs.map(d => {
        const action = d.dropbox_url
          ? '<a class="doc-link" href="' + escapeAttr(d.dropbox_url) + '" target="_blank" rel="noopener">View ↗</a>'
          : '<span class="doc-link" style="opacity:.5">—</span>';
        return '<div class="doc-row">' +
          '<div><div class="doc-name">' + escapeHtml(d.name) + '</div></div>' + action +
        '</div>';
      }).join('');
      docsSection.style.display = '';
    } else {
      document.getElementById('cp-rd-docs').innerHTML =
        '<div style="padding:10px 14px;background:var(--bg);color:var(--light);font-style:italic;font-size:.8rem">No documents posted yet.</div>';
      docsSection.style.display = '';
    }

    // Progress bar
    const target = Number(raise.total_raise_target || 0);
    const raised = Number(raise.amount_raised || 0);
    const pct    = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;
    const bar    = document.getElementById('cp-rd-bar');
    bar.style.width = '0%';
    setTimeout(() => { bar.style.width = pct + '%'; }, 60);
    document.getElementById('cp-rd-pct').textContent = pct + '% funded';
    document.getElementById('cp-rd-progress-meta').innerHTML =
      '<span>' + fmt.money(raised) + ' raised</span>' +
      '<span>' + fmt.money(target - raised) + ' remaining</span>';

    // Express Interest — submit to Supabase
    const interestBtn = document.getElementById('cp-rd-interest-btn');
    interestBtn.disabled = false;
    interestBtn.textContent = 'Express Interest →';
    interestBtn.onclick = async () => {
      interestBtn.disabled = true;
      interestBtn.textContent = 'Submitting…';
      const ok = await OnixDB.submitRaiseInterest(userId, raise.id);
      if (ok) {
        interestBtn.textContent = '✓ Interest recorded';
        interestBtn.style.background = '#3B8B3B';
        interestBtn.style.borderColor = '#3B8B3B';
      } else {
        interestBtn.disabled = false;
        interestBtn.textContent = 'Express Interest →';
        alert('Could not record interest. Please try again.');
      }
    };

    document.getElementById('cp-raise-modal').classList.add('show');
  }

  // ---------- Loan Application Form ----------
  // Captured supporting documents the user has selected, kept in a closure
  // so they survive any browser/form clearing of the underlying <input type=file>.
  let pickedSupportingFiles = [];

  // ---------- live thousands-separator on money inputs ----------
  // Mirrors the helper used in admin-portal-data.js. Any input marked
  // data-money gets reformatted to "1,234,567.89" on every keystroke.
  function formatMoneyString(raw) {
    const cleaned = String(raw == null ? '' : raw).replace(/[^0-9.]/g, '');
    const dot = cleaned.indexOf('.');
    const intRaw = dot === -1 ? cleaned : cleaned.slice(0, dot);
    const decRaw = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    const intClean = intRaw.replace(/^0+(?=\d)/, '');
    const intFormatted = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return intFormatted + (decRaw == null ? '' : '.' + decRaw);
  }

  function wireMoneyInput(input) {
    if (!input || input.__moneyWired) return;
    input.__moneyWired = true;
    if (input.type === 'number') {
      input.type = 'text';
      if (!input.getAttribute('inputmode')) input.setAttribute('inputmode', 'decimal');
    }
    if (input.value) input.value = formatMoneyString(input.value);
    input.addEventListener('input', () => {
      const raw = input.value;
      const caret = input.selectionStart != null ? input.selectionStart : raw.length;
      const beforeCaret = (raw.slice(0, caret).match(/[0-9.]/g) || []).length;
      const formatted = formatMoneyString(raw);
      if (formatted !== raw) {
        input.value = formatted;
        let pos = 0, seen = 0;
        while (pos < formatted.length && seen < beforeCaret) {
          if (/[0-9.]/.test(formatted[pos])) seen++;
          pos++;
        }
        try { input.setSelectionRange(pos, pos); } catch (_) {}
      }
    });
  }

  function wireMoneyInputs(scope) {
    (scope || document).querySelectorAll('input[data-money]').forEach(wireMoneyInput);
  }

  function wireLoanApplicationForm(userId, profile) {
    // The apply form's Loan Amount input is marked data-money in the HTML.
    // Wire it (and any other future money inputs) for live comma formatting.
    wireMoneyInputs(document.querySelector('#view-apply') || document);

    function renderPickedFiles() {
      const zone = document.querySelector('.upload-zone');
      if (!zone) return;
      let summary = zone.querySelector('[data-files-summary]');
      if (!summary) {
        summary = document.createElement('div');
        summary.setAttribute('data-files-summary', '');
        summary.style.cssText = 'margin-top:8px;font-size:.74rem;color:var(--red);font-weight:600;line-height:1.4';
        zone.appendChild(summary);
      }
      if (!pickedSupportingFiles.length) { summary.textContent = ''; return; }
      summary.textContent = pickedSupportingFiles.length === 1
        ? '📎 ' + pickedSupportingFiles[0].name
        : '📎 ' + pickedSupportingFiles.length + ' files: ' + pickedSupportingFiles.map(f => f.name).join(', ');
    }

    function addFiles(fileList) {
      if (!fileList || !fileList.length) return;
      for (const f of fileList) pickedSupportingFiles.push(f);
      renderPickedFiles();
    }

    const zone = document.querySelector('.upload-zone');
    const fileInput = document.getElementById('fileInput');
    if (zone && fileInput && !zone.dataset.captureWired) {
      zone.dataset.captureWired = '1';
      ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        zone.style.borderColor = 'var(--red)';
      }));
      ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        zone.style.borderColor = '';
      }));
      zone.addEventListener('drop', e => {
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
      });
      // Capture on every pick. Files captured into pickedSupportingFiles
      // survive even if fileInput.files later gets cleared.
      fileInput.addEventListener('change', () => addFiles(fileInput.files));

      // Reset clears our captured list too.
      const form = document.querySelector('#view-apply form');
      if (form) form.addEventListener('reset', () => {
        pickedSupportingFiles = [];
        renderPickedFiles();
      });
    }

    // The portal already calls submitLoanApp(event) inline. Override that global
    // so it inserts into Supabase, uploads supporting docs, and triggers email.
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

      let uploadedCount = 0;
      let uploadErrors = [];
      if (ok) {
        // Read from the closure-captured list (fileInput.files can be cleared
        // by form behavior or browser quirks; pickedSupportingFiles survives).
        // Fall back to fileInput.files if for some reason capture didn't run.
        const captured = pickedSupportingFiles.slice();
        const fallback = Array.from((document.getElementById('fileInput') || {}).files || []);
        const files = captured.length ? captured : fallback;
        console.log('[onix] submitting application ' + inserted.id + ' with ' + files.length + ' supporting file(s)');
        for (const file of files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
          const key = userId + '/applications/' + inserted.id + '/' + Date.now() + '-' + safeName;
          try {
            const upRes = await OnixDB.client.storage
              .from('client-documents')
              .upload(key, file, { upsert: false, contentType: file.type || undefined });
            if (upRes.error) {
              uploadErrors.push(file.name + ': ' + upRes.error.message);
              console.error('[onix] storage upload failed for', file.name, upRes.error);
              continue;
            }
            const ins = await OnixDB.client.from('client_documents').insert({
              profile_id: userId,
              application_id: inserted.id,
              category: 'loan_application',
              name: file.name,
              storage_path: key
            });
            if (ins.error) {
              uploadErrors.push(file.name + ': ' + ins.error.message);
              console.error('[onix] client_documents insert failed for', file.name, ins.error);
              // Roll back the file so the bucket doesn't drift from the table
              OnixDB.client.storage.from('client-documents').remove([key]).catch(() => {});
            } else {
              uploadedCount++;
            }
          } catch (ex) {
            uploadErrors.push(file.name + ': ' + (ex && ex.message ? ex.message : String(ex)));
            console.error('[onix] unexpected error uploading', file.name, ex);
          }
        }
        // Clear captured list after this submission
        pickedSupportingFiles = [];

        // Trigger the Resend email via Edge Function (fire-and-forget; UI doesn't block on it)
        OnixDB.client.functions.invoke('send-loan-app-email', {
          body: {
            application_id:   inserted.id,
            applicant_name:   (profile && (profile.full_name || profile.email)) || 'Unknown',
            applicant_email:  (profile && profile.email) || 'Unknown',
            amount_requested: amount,
            purpose,
            applicant_type:   applicantType,
            notes,
            attachment_count: uploadedCount
          }
        }).catch(err => console.error('[onix] send-loan-app-email failed:', err));
      } else if (error) {
        console.error('[onix] loan_applications insert failed:', error);
      }

      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = orig; }
      const banner = document.getElementById('loan-ok');
      if (ok) {
        if (banner) {
          banner.style.display = 'block';
          if (uploadedCount > 0) {
            const note = ' ' + uploadedCount + ' document' + (uploadedCount === 1 ? '' : 's') + ' attached.';
            banner.textContent = (banner.textContent || '').replace(/\s+\d+ documents? attached\.?$/, '') + note;
          }
        }
        form.reset();
        const summary = document.querySelector('[data-files-summary]');
        if (summary) summary.textContent = '';
        if (uploadErrors.length) {
          alert('Application submitted, but some files failed to upload:\n\n' + uploadErrors.join('\n'));
        }
      } else {
        alert('Could not submit application. Please try again.');
      }
    };
  }

  // ---------- Payments History (Lending tab) ----------
  function findCardByTitle(scope, titleMatcher) {
    const cards = (scope || document).querySelectorAll('.card');
    for (const c of cards) {
      const t = c.querySelector('.card-title');
      if (t && titleMatcher(t.textContent.trim())) return c;
    }
    return null;
  }

  function renderPayments(payments, selectedLoan) {
    // Filter to the selected loan so the Payments tab agrees with My Loan.
    // When no loan is selected (e.g. client has no active loans), show all.
    const scoped = selectedLoan
      ? (payments || []).filter(p => p.loan_id === selectedLoan.id)
      : (payments || []);
    const paid = scoped.filter(p => p.status === 'paid' || p.paid_at);

    // Update the Payments tab's eyebrow so it's clear which loan is shown.
    const eyebrow = document.querySelector('#view-payments .page-hd .eyebrow');
    if (eyebrow) {
      if (selectedLoan && selectedLoan.loan_id_display) {
        const baseEn = 'Payment Schedule · ' + selectedLoan.loan_id_display;
        const baseEs = 'Calendario de Pagos · ' + selectedLoan.loan_id_display;
        eyebrow.setAttribute('data-en', baseEn);
        eyebrow.setAttribute('data-es', baseEs);
        const lang = (window.OnixLang && OnixLang.getLang && OnixLang.getLang()) || 'en';
        eyebrow.textContent = lang === 'es' ? baseEs : baseEn;
      } else {
        eyebrow.setAttribute('data-en', 'Payment Schedule');
        eyebrow.setAttribute('data-es', 'Calendario de Pagos');
        const lang = (window.OnixLang && OnixLang.getLang && OnixLang.getLang()) || 'en';
        eyebrow.textContent = lang === 'es' ? 'Calendario de Pagos' : 'Payment Schedule';
      }
    }

    const historyRowsHtml = paid.length
      ? paid.slice(0, 24).map(p => `
          <tr>
            <td>${fmt.date(p.paid_at || p.due_date)}</td>
            <td style="font-weight:600">${fmt.money(p.amount_due)}</td>
            <td>${fmt.money(p.principal)}</td>
            <td>${fmt.money(p.interest)}</td>
            <td>${fmt.money(p.balance_after)}</td>
            <td><span class="pay-status paid"></span><span>Paid</span></td>
          </tr>`).join('')
      : '<tr><td colspan="6" style="color:var(--light);font-style:italic;text-align:center;padding:18px">No payments recorded yet</td></tr>';

    // Lending tab: Payment History card
    const lendHist = findCardByTitle(document.querySelector('#view-loans'), txt => /Payment History/i.test(txt));
    if (lendHist) {
      const tbody = lendHist.querySelector('tbody');
      if (tbody) tbody.innerHTML = historyRowsHtml;
    }

    // Payments tab: Payment History card (was 5 hardcoded demo rows)
    const payHist = findCardByTitle(document.querySelector('#view-payments'), txt => /Payment History/i.test(txt));
    if (payHist) {
      const tbody = payHist.querySelector('tbody');
      if (tbody) tbody.innerHTML = historyRowsHtml;
    }

    // Payments view: Upcoming Payments table (#upcoming-rows)
    // Use the same loan-scoped list so it agrees with My Loan + Payment History.
    const upTbody = document.getElementById('upcoming-rows');
    if (upTbody) {
      const upcoming = scoped.filter(p => p.status !== 'paid' && !p.paid_at)
        .sort((a,b) => (a.due_date || '').localeCompare(b.due_date || ''))
        .slice(0, 6);
      upTbody.innerHTML = upcoming.length
        ? upcoming.map(p => `
            <tr>
              <td>${fmt.date(p.due_date)}</td>
              <td style="font-weight:600">${fmt.money(p.amount_due)}</td>
              <td>${fmt.money(p.principal)}</td>
              <td>${fmt.money(p.interest)}</td>
            </tr>`).join('')
        : '<tr><td colspan="4" style="color:var(--light);font-style:italic;text-align:center;padding:18px">No upcoming payments scheduled</td></tr>';
    }

    // Payments tab: Payment Breakdown (chart + the two summary boxes)
    renderPaymentBreakdown(paid);
  }

  // Render the Payment Breakdown card on the Payments tab using real paid
  // payments — totals of principal vs interest. Replaces the demo
  // [2698, 1520] hardcoded chart, and neutralizes the legacy
  // initBreakdownChart() in client-portal.html that would otherwise
  // overwrite the chart on every Payments-tab visit.
  function renderPaymentBreakdown(paidPayments) {
    const totalPrincipal = paidPayments.reduce((s, p) => s + Number(p.principal || 0), 0);
    const totalInterest  = paidPayments.reduce((s, p) => s + Number(p.interest  || 0), 0);

    // Update the two summary boxes (Principal / Interest amounts)
    const card = findCardByTitle(document.querySelector('#view-payments'), txt => /Payment Breakdown/i.test(txt));
    if (card) {
      card.querySelectorAll('div[style*="background"]').forEach(box => {
        const eyebrow = box.querySelector('[data-en]');
        const label = eyebrow ? (eyebrow.textContent || '').trim().toLowerCase() : '';
        // The eyebrow label div and the value div both happen to use
        // font-weight:700, so a substring selector on that matches both —
        // grabbing the label first left the real value (a sibling right
        // after it) permanently stuck on its static demo number. The
        // value is always the very next element, so address it directly.
        const val = eyebrow ? eyebrow.nextElementSibling : null;
        if (!val) return;
        if (label === 'principal') val.textContent = fmt.money(totalPrincipal);
        else if (label === 'interest') val.textContent = fmt.money(totalInterest);
      });
    }

    // Update / create the doughnut chart
    const canvas = document.getElementById('breakdownChart');
    if (canvas && typeof Chart !== 'undefined') {
      try { const ex = Chart.getChart(canvas); if (ex) ex.destroy(); } catch (e) {}
      if (totalPrincipal + totalInterest <= 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9B9590';
        ctx.font = "italic 14px 'Cormorant Garamond', serif";
        ctx.textAlign = 'center';
        ctx.fillText('No payments yet', canvas.width / 2, canvas.height / 2);
      } else {
        new Chart(canvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Principal', 'Interest'],
            datasets: [{ data: [totalPrincipal, totalInterest], backgroundColor: ['#C0392B', '#EDE8E0'], borderWidth: 0 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: '#555' } },
              tooltip: { callbacks: { label: c => c.label + ': ' + fmt.money(c.parsed) } }
            }
          }
        });
      }
    }

    // Stop the legacy demo function from clobbering our chart on tab clicks.
    window.initBreakdownChart = function(){};
  }

  // ---------- Distribution History (Investments tab) ----------
  function renderDistributions(distributions) {
    const card = findCardByTitle(document.querySelector('#view-investments'), txt => /Distribution History/i.test(txt));
    if (!card) return;
    const tbody = card.querySelector('tbody');
    if (!tbody) return;
    const rows = (distributions || []).slice(0, 20);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--light);font-style:italic;text-align:center;padding:18px">No distributions yet</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(d => {
      const venture = (d.investments && d.investments.venture_name) || 'Investment';
      const kindLabel = d.kind === 'distribution' ? 'Distribution'
                     : d.kind === 'interest' ? 'Interest'
                     : d.kind === 'dividend' ? 'Dividend'
                     : d.kind === 'return_of_capital' ? 'Return of Capital'
                     : (d.kind || 'Payment');
      return `
        <tr>
          <td>${fmt.date(d.paid_at)}</td>
          <td>${escapeHtml(venture)}</td>
          <td>${escapeHtml(kindLabel)}</td>
          <td style="font-weight:600;color:var(--red)">+${fmt.money(d.amount)}</td>
          <td><span class="pay-status paid"></span><span>Received</span></td>
        </tr>`;
    }).join('');
  }

  // ---------- Upcoming events sidebar (Dashboard) ----------
  // Replace the hardcoded NOTIFS demo array on client-portal.html with real events
  function renderNotifications(payments, distributions, applications) {
    if (typeof window.NOTIFS === 'undefined') return; // bell not present on this page
    const items = [];
    const now = new Date();
    (distributions || []).forEach(d => items.push({
      ts: new Date(d.paid_at),
      msg: '<b>' + (d.kind === 'interest' ? 'Interest' : 'Distribution') + '</b> of ' + fmt.money(d.amount) + ' deposited' + ((d.investments && d.investments.venture_name) ? ' from ' + d.investments.venture_name : ''),
      read: (now - new Date(d.paid_at)) > 14 * 86400000 // older than 14 days marked read
    }));
    (payments || []).forEach(p => {
      const due = p.due_date ? new Date(p.due_date) : null;
      const paid = p.paid_at ? new Date(p.paid_at) : null;
      const isDeposit = !!(p.loans && p.loans.data_source === 'ous_pasiva');
      if (paid) {
        items.push({
          ts: paid,
          msg: (isDeposit ? '<b>' + fmt.money(p.amount_due) + '</b> in interest earned' : 'Loan payment of <b>' + fmt.money(p.amount_due) + '</b> recorded') + ((p.loans && p.loans.loan_id_display) ? ' on ' + p.loans.loan_id_display : ''),
          read: (now - paid) > 14 * 86400000
        });
      } else if (due && (due - now) < 7 * 86400000 && (due - now) > -2 * 86400000) {
        items.push({
          ts: due,
          msg: (isDeposit ? '<b>Interest Earned</b> ' : '<b>Loan payment due</b> ') + fmt.money(p.amount_due) + ' · ' + fmt.date(due),
          read: false
        });
      }
    });
    (applications || []).forEach(a => {
      if (a.status && a.status !== 'pending') {
        items.push({
          ts: new Date(a.submitted_at),
          msg: 'Your loan application is <b>' + a.status + '</b>',
          read: false
        });
      }
    });
    if (!items.length) {
      items.push({
        ts: now,
        msg: 'You are all caught up. We will notify you here when new activity arrives.',
        read: true
      });
    }
    // Sort newest first, take top 8
    items.sort((a, b) => b.ts - a.ts);
    const top = items.slice(0, 8);
    window.NOTIFS = top.map(i => ({
      msg: i.msg,
      time: fmt.date(i.ts),
      read: i.read
    }));
    // Re-render the existing panel if it has been built
    const panel = document.getElementById('cp-notif-panel');
    if (panel && typeof window.renderNotifPanel === 'function') {
      window.renderNotifPanel(panel);
    } else if (panel) {
      // Trigger a click event to force the inline script's render to re-evaluate
      // (no-op fallback — page reload will pick it up)
    }
    // Show/hide the red dot based on unread count
    const dot = document.querySelector('.icon-btn-dot');
    if (dot) dot.style.display = top.some(i => !i.read) ? '' : 'none';
  }

  function renderUpcomingEvents(payments, distributions) {
    const card = findCardByTitle(document.querySelector('#view-dashboard'), txt => /^Upcoming/i.test(txt));
    if (!card) return;
    const events = [];
    (payments || []).forEach(p => {
      if (p.status !== 'paid' && p.due_date) {
        // OUS Pasiva deposits pay interest TO the client (money coming in),
        // the reverse of a genuine loan payment (money owed by the client)
        // — same distinction as the admin calendar's Interest/Payment Due.
        const isDeposit = !!(p.loans && p.loans.data_source === 'ous_pasiva');
        events.push({
          date: new Date(p.due_date),
          title: isDeposit ? 'Interest Earned' : 'Loan Payment Due',
          sub: fmt.money(p.amount_due) + (p.loans && p.loans.loan_id_display ? ' · ' + p.loans.loan_id_display : ''),
          accent: isDeposit ? 'var(--success)' : 'var(--red)',
          bg: isDeposit ? 'var(--bg)' : 'var(--red-light)'
        });
      }
    });
    (distributions || []).slice(0, 3).forEach(d => {
      events.push({
        date: new Date(d.paid_at),
        title: (d.kind === 'distribution' ? 'Distribution' : 'Interest') + ' Received',
        sub: '+' + fmt.money(d.amount) + ((d.investments && d.investments.venture_name) ? ' · ' + d.investments.venture_name : ''),
        accent: 'var(--success)',
        bg: 'var(--bg)'
      });
    });
    events.sort((a, b) => Math.abs(a.date - new Date()) - Math.abs(b.date - new Date()));
    const top3 = events.slice(0, 3);
    // Preserve the card title; replace everything below it.
    const titleEl = card.querySelector('.card-title');
    card.innerHTML = '';
    if (titleEl) card.appendChild(titleEl);
    if (!top3.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:18px 4px;color:var(--muted);font-size:.85rem;font-style:italic';
      empty.textContent = 'No upcoming events.';
      card.appendChild(empty);
      return;
    }
    top3.forEach((e, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:flex-start;gap:14px;padding:14px 0;' + (idx < top3.length - 1 ? 'border-bottom:1px solid #f4f4f4;' : '');
      const day = e.date.getDate();
      const mon = e.date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      row.innerHTML = `
        <div style="width:44px;height:44px;background:${e.bg};border-left:3px solid ${e.accent};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">
          <div style="font-family:var(--serif);font-style:italic;font-size:1.1rem;color:${e.accent};font-weight:500">${day}</div>
          <div style="font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700">${escapeHtml(mon)}</div>
        </div>
        <div>
          <div style="font-weight:600;font-size:.88rem">${escapeHtml(e.title)}</div>
          <div style="font-size:.75rem;color:var(--light);margin-top:2px">${escapeHtml(e.sub)}</div>
        </div>`;
      card.appendChild(row);
    });
  }

  // ---------- 12-Month Performance chart (Dashboard) ----------
  // Net portfolio = sum of investments active by month + cumulative distributions to that month.
  function renderPerformanceChart(investments, distributions) {
    const canvas = document.getElementById('perfChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const today = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d);
    }
    const values = months.map(m => {
      // End-of-month cutoff
      const cutoff = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const activeInv = (investments || [])
        .filter(i => i.status !== 'exited' && (!i.start_date || new Date(i.start_date) <= cutoff))
        .reduce((s, i) => s + Number(i.amount_invested || 0), 0);
      const distSum = (distributions || [])
        .filter(d => d.paid_at && new Date(d.paid_at) <= cutoff)
        .reduce((s, d) => s + Number(d.amount || 0), 0);
      return Math.round((activeInv + distSum) / 1000); // $K
    });
    try { const ex = Chart.getChart(canvas); if (ex) ex.destroy(); } catch (e) {}
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, 'rgba(192,57,43,0.15)');
    g.addColorStop(1, 'rgba(192,57,43,0)');
    const perfChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map(m => m.toLocaleString('en-US', { month: 'short' })),
        datasets: [{ data: values, borderColor: '#C0392B', backgroundColor: g, fill: true, tension: .35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => '$' + c.parsed.y + 'K' } }
        },
        scales: {
          y: { grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 10 }, callback: v => '$' + v + 'K' } },
          x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } }
        }
      }
    });
    enableClickToShowValue(perfChartInstance);
  }

  // ---------- main ----------
  // ---------- Global smart search ----------
  // Module-scope cache of everything loaded for this client, so the search
  // bar can search across loans / investments / payments / docs / raises
  // without re-querying Supabase on every keystroke.
  const searchData = {
    loans: [], investments: [], raises: [], payments: [],
    distributions: [], applications: [], clientDocs: []
  };
  let currentResults = []; // last-rendered results, for click + keyboard handlers
  let kbIndex = -1;        // currently keyboard-focused row in the dropdown

  function buildSearchIndex() {
    const index = [];
    const lang = (window.OnixLang && OnixLang.getLang && OnixLang.getLang()) || 'en';
    const sections = [
      {key:'dashboard',   en:'Dashboard',                  es:'Inicio',          sub:'Account overview & KPIs'},
      {key:'loans',       en:'My Loan',                    es:'Mi Préstamo',     sub:'Loan details, balance, documents'},
      {key:'payments',    en:'Payments',                   es:'Pagos',           sub:'Payment history & upcoming'},
      {key:'apply',       en:'Apply for a New Loan',       es:'Solicitar Préstamo', sub:'Submit a new application'},
      {key:'investments', en:'My Investments',             es:'Mis Inversiones', sub:'Portfolio positions'},
      {key:'raises',      en:'Investment Opportunities',   es:'Oportunidades',   sub:'Open raises you can join'},
      {key:'documents',   en:'My Documents',               es:'Mis Documentos',  sub:'Loan + investment files'},
      {key:'profile',     en:'Profile & Preferences',      es:'Perfil',          sub:'Account settings'}
    ];
    sections.forEach(s => index.push({
      category: 'Sections',
      title: (lang === 'es' ? s.es : s.en),
      subtitle: s.sub,
      haystack: (s.en + ' ' + s.es + ' ' + s.sub).toLowerCase(),
      onClick: () => showView(s.key)
    }));

    (searchData.loans || []).forEach(l => {
      index.push({
        category: 'Loans',
        title: l.loan_id_display || 'Loan',
        subtitle: [l.status, fmt.money(l.balance), l.collateral_address].filter(Boolean).join(' · '),
        amount: l.balance != null ? fmt.money(l.balance) : '',
        haystack: [l.loan_id_display, l.status, l.balance, l.collateral_address, l.term_months, l.interest_rate].filter(x => x != null).join(' ').toLowerCase(),
        onClick: () => showView('loans')
      });
      (l.loan_documents || []).forEach(d => index.push({
        category: 'Documents',
        title: d.name,
        subtitle: 'Loan document · ' + (l.loan_id_display || 'Loan'),
        haystack: (d.name + ' ' + (l.loan_id_display || '') + ' loan document').toLowerCase(),
        onClick: () => showView('documents')
      }));
    });

    (searchData.investments || []).forEach(inv => {
      index.push({
        category: 'Investments',
        title: inv.venture_name || 'Investment',
        subtitle: [inv.venture_type, fmt.money(inv.amount_invested), inv.status].filter(Boolean).join(' · '),
        amount: inv.amount_invested != null ? fmt.money(inv.amount_invested) : '',
        haystack: [inv.venture_name, inv.venture_type, inv.amount_invested, inv.status, inv.expected_return].filter(x => x != null).join(' ').toLowerCase(),
        onClick: () => {
          showView('investments');
          if (window.showInvestmentDetail) window.showInvestmentDetail(inv.id);
        }
      });
      (inv.investment_documents || []).forEach(d => index.push({
        category: 'Documents',
        title: d.name,
        subtitle: 'Investment document · ' + (inv.venture_name || 'Investment'),
        haystack: (d.name + ' ' + (inv.venture_name || '') + ' investment document').toLowerCase(),
        onClick: () => showView('documents')
      }));
    });

    (searchData.distributions || []).forEach(d => {
      const venture = (d.investments && d.investments.venture_name) || 'Investment';
      index.push({
        category: 'Distributions',
        title: 'Distribution · ' + venture,
        subtitle: [fmt.money(d.amount), fmt.date(d.paid_at), d.kind].filter(Boolean).join(' · '),
        amount: d.amount != null ? fmt.money(d.amount) : '',
        haystack: ['distribution', venture, d.amount, d.kind, fmt.date(d.paid_at)].filter(x => x != null).join(' ').toLowerCase(),
        onClick: () => showView('investments')
      });
    });

    (searchData.payments || []).forEach(p => {
      const loanId = (p.loans && p.loans.loan_id_display) || '';
      const paid = !!p.paid_at;
      index.push({
        category: 'Payments',
        title: 'Payment' + (loanId ? ' · ' + loanId : ''),
        subtitle: [fmt.money(p.amount_due), paid ? 'paid ' + fmt.date(p.paid_at) : 'due ' + fmt.date(p.due_date)].filter(Boolean).join(' · '),
        amount: p.amount_due != null ? fmt.money(p.amount_due) : '',
        haystack: ['payment', loanId, p.amount_due, paid ? 'paid' : 'due', fmt.date(p.paid_at || p.due_date)].filter(x => x != null).join(' ').toLowerCase(),
        onClick: () => showView('payments')
      });
    });

    (searchData.raises || []).forEach(r => {
      const goal = fmt.money(r.total_raise_target);
      const raised = fmt.money(r.amount_raised);
      index.push({
        category: 'Open Raises',
        title: r.venture_name || 'Open Raise',
        subtitle: [r.venture_type, fmt.money(r.minimum_investment) + ' min', raised + ' / ' + goal].filter(Boolean).join(' · '),
        amount: goal,
        haystack: [r.venture_name, r.venture_type, r.structure, r.description, r.minimum_investment, r.total_raise_target, r.investment_horizon].filter(x => x != null).join(' ').toLowerCase(),
        onClick: () => showView('raises')
      });
    });

    (searchData.applications || []).forEach(a => {
      index.push({
        category: 'Applications',
        title: 'Loan application · ' + fmt.money(a.amount_requested),
        subtitle: [a.status, fmt.date(a.submitted_at)].filter(Boolean).join(' · '),
        amount: a.amount_requested != null ? fmt.money(a.amount_requested) : '',
        haystack: ['application', a.status, a.amount_requested, fmt.date(a.submitted_at)].filter(x => x != null).join(' ').toLowerCase(),
        onClick: () => showView('apply')
      });
    });

    (searchData.clientDocs || []).forEach(d => index.push({
      category: 'Documents',
      title: d.name,
      subtitle: [(d.category || 'document').replace(/_/g, ' '), fmt.date(d.uploaded_at)].filter(Boolean).join(' · '),
      haystack: (d.name + ' ' + (d.category || '') + ' document').toLowerCase(),
      onClick: () => showView('documents')
    }));

    return index;
  }

  function searchScore(tokens, hay) {
    let score = 0;
    for (const t of tokens) {
      if (!t) continue;
      if (hay.indexOf(t) >= 0) score += 1;
      if (hay.startsWith(t))   score += 0.5;
    }
    return score;
  }

  function runSearch(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    return buildSearchIndex()
      .map(it => ({ ...it, score: searchScore(tokens, it.haystack) }))
      .filter(it => it.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }

  function renderSearchResults(results) {
    const box = document.getElementById('cp-search-results');
    if (!box) return;
    currentResults = results;
    kbIndex = -1;
    if (!results.length) {
      box.innerHTML = '<div class="cp-search-empty">No matches</div>';
      box.hidden = false;
      return;
    }
    const groups = {};
    const groupOrder = [];
    results.forEach((r, i) => {
      if (!groups[r.category]) { groups[r.category] = []; groupOrder.push(r.category); }
      groups[r.category].push({ ...r, _idx: i });
    });
    const html = groupOrder.map(cat =>
      '<div class="cp-search-group">' + escapeHtml(cat) + '</div>' +
      groups[cat].map(r =>
        '<div class="cp-search-row" data-idx="' + r._idx + '">' +
          '<div>' +
            '<div class="t">' + escapeHtml(r.title || '') + '</div>' +
            (r.subtitle ? '<div class="s">' + escapeHtml(r.subtitle) + '</div>' : '') +
          '</div>' +
          (r.amount ? '<div class="amt">' + escapeHtml(r.amount) + '</div>' : '') +
        '</div>'
      ).join('')
    ).join('');
    box.innerHTML = html;
    box.hidden = false;
  }

  function closeSearchDropdown() {
    const box = document.getElementById('cp-search-results');
    if (box) box.hidden = true;
    kbIndex = -1;
  }

  function activateResult(idx) {
    const r = currentResults[idx];
    if (!r || typeof r.onClick !== 'function') return;
    closeSearchDropdown();
    const input = document.getElementById('cp-global-search');
    if (input) { input.value = ''; input.blur(); }
    try { r.onClick(); } catch (ex) { console.error('[onix-search] onClick failed:', ex); }
  }

  function setKbFocus(newIdx) {
    const box = document.getElementById('cp-search-results');
    if (!box || !currentResults.length) return;
    const rows = box.querySelectorAll('.cp-search-row');
    if (!rows.length) return;
    kbIndex = ((newIdx % rows.length) + rows.length) % rows.length;
    rows.forEach((r, i) => r.classList.toggle('kb-focus', i === kbIndex));
    const row = rows[kbIndex];
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  function wireGlobalSearch() {
    const input = document.getElementById('cp-global-search');
    const box   = document.getElementById('cp-search-results');
    if (!input || !box || input.__searchWired) return;
    input.__searchWired = true;

    input.addEventListener('input', () => {
      const q = input.value;
      if (!q.trim()) { closeSearchDropdown(); return; }
      renderSearchResults(runSearch(q));
    });

    input.addEventListener('focus', () => {
      if (input.value.trim()) renderSearchResults(runSearch(input.value));
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeSearchDropdown(); return; }
      if (!currentResults.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setKbFocus(kbIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setKbFocus(kbIndex - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        activateResult(kbIndex >= 0 ? kbIndex : 0);
      }
    });

    box.addEventListener('mousedown', (e) => {
      const row = e.target && e.target.closest && e.target.closest('.cp-search-row');
      if (!row) return;
      e.preventDefault(); // keep focus, prevent the blur-close from racing
      const idx = Number(row.dataset.idx);
      if (Number.isFinite(idx)) activateResult(idx);
    });

    // Close when clicking outside the search container
    document.addEventListener('mousedown', (e) => {
      if (!box.hidden && !e.target.closest('.cp-search')) closeSearchDropdown();
    });
  }

  // ============================================================
  // MY DOCUMENTS TAB
  // ============================================================
  // Same category set as the admin Documents modal so uploads slot
  // directly into the matching group on the admin side.
  const CLIENT_DOC_CATEGORIES = [
    { key: 'id',                label: 'ID' },
    { key: 'passport',          label: 'Passport' },
    { key: 'proof_of_address',  label: 'Proof of Address' },
    { key: 'loan_application',  label: 'Loan Application Supporting Docs' },
    { key: 'loan_doc',          label: 'Loan Documents' },
    { key: 'promissory_note',   label: 'Promissory Notes' },
    { key: 'tax',               label: 'RFC or Tax ID' },
    { key: 'other',             label: 'Other' }
  ];
  // Display grouping for the "My Documents" list below: ID and Passport
  // render as one combined "ID/Passport" card (either satisfies the
  // identity-doc requirement — see hasEitherIdent in renderClientDocList).
  // The upload picker above still lists them separately (CLIENT_DOC_CATEGORIES)
  // since an uploaded file needs one specific real category value.
  const CLIENT_DOC_DISPLAY_GROUPS = [
    { key: 'id_or_passport',   label: 'ID/Passport',                       categories: ['id', 'passport'] },
    { key: 'proof_of_address', label: 'Proof of Address',                  categories: ['proof_of_address'] },
    { key: 'loan_application', label: 'Loan Application Supporting Docs',  categories: ['loan_application'] },
    { key: 'loan_doc',         label: 'Loan Documents',                    categories: ['loan_doc'] },
    { key: 'promissory_note',  label: 'Promissory Notes',                  categories: ['promissory_note'] },
    { key: 'tax',              label: 'RFC or Tax ID',                     categories: ['tax'] },
    { key: 'other',            label: 'Other',                             categories: ['other'] }
  ];
  const CLIENT_DOC_BUCKET = 'client-documents';

  // Reusable so any callsite (upload, list) can fetch the latest docs
  async function fetchClientDocs(userId) {
    const { data, error } = await OnixDB.client
      .from('client_documents')
      .select('id, name, category, uploaded_at, storage_path, dropbox_url')
      .eq('profile_id', userId)
      .order('uploaded_at', { ascending: false });
    if (error) console.error('[onix] client_documents fetch failed:', error);
    return data || [];
  }

  function renderClientDocList(docs) {
    const root = document.getElementById('doc-list-root');
    if (!root) return;
    const byCat = {};
    (docs || []).forEach(d => {
      const k = d.category || 'other';
      (byCat[k] = byCat[k] || []).push(d);
    });
    const fmtDate = s => {
      try { return new Date(s).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
      catch (_) { return ''; }
    };
    const linkStyle = 'font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--red);background:transparent;border:1px solid var(--red);padding:6px 12px;border-radius:2px;text-decoration:none;cursor:pointer';
    // Required-doc rule: every client must have ID OR Passport (either is fine),
    // a Proof of Address, and an RFC / Tax ID on file. Compute flags once so
    // the same answer drives both ID and Passport headers.
    const hasIdDoc       = (byCat['id'] || []).length > 0;
    const hasPassportDoc = (byCat['passport'] || []).length > 0;
    const hasEitherIdent = hasIdDoc || hasPassportDoc;
    const isMissingForGroup = key => {
      if (key === 'id_or_passport')   return !hasEitherIdent;
      if (key === 'proof_of_address') return (byCat['proof_of_address'] || []).length === 0;
      if (key === 'tax')              return (byCat['tax'] || []).length === 0;
      return false;
    };
    const missingBadge = '<span class="cl-doc-missing">⚠ Missing</span>';
    // Always render one card per display group (matching the original "Loan /
    // Investments / Tax & Statements" layout) so clients always see every
    // type they can have on file. Empty groups show a quiet message.
    let html = '';
    CLIENT_DOC_DISPLAY_GROUPS.forEach((group, i) => {
      const list = group.categories.reduce((acc, k) => acc.concat(byCat[k] || []), []);
      const revealCls = i === 0 ? 'card reveal' : 'card reveal reveal-d' + Math.min(i, 3);
      const missing = isMissingForGroup(group.key);
      html +=
        '<div class="' + revealCls + '" style="margin-top:20px' + (missing ? ';border-top:3px solid var(--red);box-shadow:0 0 0 1px rgba(192,57,43,.18)' : '') + '">' +
          '<div class="card-title">' + escapeHtml(group.label) +
            (list.length
              ? ' <span style="color:var(--light);font-weight:600;margin-left:6px">(' + list.length + ')</span>'
              : '') +
            (missing ? ' ' + missingBadge : '') +
          '</div>';
      if (!list.length) {
        html +=
          '<div style="padding:18px 4px;color:var(--light);font-style:italic;font-size:.84rem">' +
            '<span data-en="No documents uploaded yet." data-es="Aún no hay documentos.">' +
              'No documents uploaded yet.</span>' +
          '</div>';
      } else {
        html += list.map(d => {
          const meta = (d.storage_path ? 'Uploaded' : (d.dropbox_url ? 'Dropbox' : 'No link')) +
                       ' · ' + fmtDate(d.uploaded_at);
          const action = d.storage_path
            ? '<a href="#" data-cl-storage-path="' + escapeAttr(d.storage_path) + '" style="' + linkStyle + '">View ↗</a>'
            : (d.dropbox_url
                ? '<a href="' + escapeAttr(d.dropbox_url) + '" target="_blank" rel="noopener" style="' + linkStyle + '">View ↗</a>'
                : '<span style="font-size:.7rem;color:var(--light)">—</span>');
          return '<div class="doc-row">' +
            '<div><div class="doc-name">' + escapeHtml(d.name) + '</div>' +
                 '<div class="doc-meta">' + escapeHtml(meta) + '</div></div>' +
            action +
          '</div>';
        }).join('');
      }
      html += '</div>';
    });
    root.innerHTML = html;

    // Storage-backed links → signed URL on click
    root.querySelectorAll('[data-cl-storage-path]').forEach(a => {
      a.addEventListener('click', async e => {
        e.preventDefault();
        const path = a.getAttribute('data-cl-storage-path');
        const orig = a.textContent;
        a.textContent = 'Opening…';
        const r = await OnixDB.client.storage.from(CLIENT_DOC_BUCKET).createSignedUrl(path, 3600);
        a.textContent = orig;
        if (r.error || !r.data) {
          alert('Could not open file: ' + (r.error && r.error.message || 'unknown error'));
          return;
        }
        window.open(r.data.signedUrl, '_blank', 'noopener');
      });
    });
  }

  function wireDocumentsTab(userId, initialDocs) {
    const zone   = document.getElementById('doc-dropzone');
    const input  = document.getElementById('docDropInput');
    const status = document.getElementById('doc-drop-status');
    const catEl  = document.getElementById('doc-category');
    if (!zone || !input || !catEl) return;

    // Initial render of any docs already on file
    renderClientDocList(initialDocs || []);

    // Browse on click (we removed the inline onclick when we edited the HTML)
    zone.addEventListener('click', () => input.click());

    // Drag-and-drop UX
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      zone.style.borderColor = 'var(--red)';
      zone.style.background  = 'var(--red-light)';
    }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      zone.style.borderColor = 'var(--border)';
      zone.style.background  = 'var(--bg)';
    }));

    async function uploadFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const category = catEl.value || 'other';
      const catLabel = (CLIENT_DOC_CATEGORIES.find(c => c.key === category) || {}).label || category;
      let ok = 0;
      const errors = [];
      for (const file of files) {
        status.style.color = 'var(--muted)';
        status.textContent = 'Uploading "' + file.name + '" as ' + catLabel + '…';
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const key  = userId + '/' + category + '/' + Date.now() + '-' + safe;
        try {
          const up = await OnixDB.client.storage
            .from(CLIENT_DOC_BUCKET)
            .upload(key, file, { upsert: false, contentType: file.type || undefined });
          if (up.error) { errors.push(file.name + ': ' + up.error.message); continue; }
          const ins = await OnixDB.client.from('client_documents').insert({
            profile_id:  userId,
            category:    category,
            name:        file.name,
            storage_path: key
          });
          if (ins.error) {
            errors.push(file.name + ': ' + ins.error.message);
            OnixDB.client.storage.from(CLIENT_DOC_BUCKET).remove([key]).catch(() => {});
            continue;
          }
          ok++;
        } catch (ex) {
          errors.push(file.name + ': ' + (ex && ex.message ? ex.message : String(ex)));
        }
      }
      if (ok) {
        status.style.color = 'var(--success-text, #2D6A2D)';
        status.textContent = '✓ Uploaded ' + ok + ' file' + (ok === 1 ? '' : 's') + ' as ' + catLabel + '.';
      }
      if (errors.length) {
        status.style.color = 'var(--red)';
        status.textContent = (ok ? status.textContent + ' ' : '') +
          'Could not upload: ' + errors.join(' | ');
      }
      // Refresh the list from Supabase so the new rows show up
      const fresh = await fetchClientDocs(userId);
      searchData.clientDocs = fresh;
      renderClientDocList(fresh);
      input.value = '';
    }

    input.addEventListener('change', () => uploadFiles(input.files));
    zone.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
    });
  }

  // Reshapes an OUS Pasiva deposit row (data_source === 'ous_pasiva') into
  // the shape renderInvestments / wireInvestmentDetailModal /
  // renderPerformanceChart already expect. Display-only — the underlying
  // loans row is untouched. Only ever called on getMyOusDeposits() results
  // — never on real (manual or OUS Activa) loan rows.
  //   balance         -> amount_invested
  //   interest_rate   -> expected_return (annual %, shown as "Expected Return")
  //   monthly_payment -> _monthly_payment (shown as its own "Monthly Payment"
  //                      detail row — this isn't a real distributions table
  //                      row, so it doesn't appear in Distribution History)
  function ousDepositToInvestmentShape(loan) {
    return {
      id: loan.id,
      user_id: loan.user_id,
      venture_name: loan.loan_id_display || ('Deposit ' + String(loan.id).slice(0, 8)),
      venture_type: 'deposit',
      amount_invested: loan.balance,
      expected_return: loan.interest_rate,
      ownership_pct: null,
      status: loan.status === 'active' ? 'active' : (loan.status || 'active'),
      start_date: loan.origination_date || loan.created_at,
      investment_documents: loan.loan_documents || [],
      _monthly_payment: loan.monthly_payment
    };
  }

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
    wireProfileForm(profile, userId);
    wireGlobalSearch();

    // Fetch everything in parallel
    const [loans, investments, ousDeposits, raises, payments, distributions] = await Promise.all([
      OnixDB.getMyLoans(userId),
      OnixDB.getMyInvestments(userId),
      OnixDB.getMyOusDeposits(userId),
      OnixDB.getOpenRaises(),
      OnixDB.getMyPayments(userId),
      OnixDB.getMyDistributions(userId)
    ]);

    // The loan_payments table is currently empty for every client — real
    // payment schedules live on the loan/deposit row itself (next_due_date +
    // monthly_payment), the same source the admin calendar already falls
    // back to. Synthesize "next payment due" rows from each OUS Pasiva
    // deposit, shaped like a loan_payments row so every existing
    // payments-consumer (Payments tab, Upcoming card) picks them up for
    // free. Skipped if a real loan_payments row already covers that same
    // loan+date, so nothing gets double-counted once real rows exist.
    const haveLoanPaymentOn = new Set(
      (payments || []).map(p => (p.loan_id || '') + '|' + p.due_date)
    );
    const depositNextDue = (ousDeposits || [])
      .filter(d => d.next_due_date && !haveLoanPaymentOn.has(d.id + '|' + d.next_due_date))
      .map(d => ({
        id: 'ousdue-' + d.id,
        loan_id: d.id,
        due_date: d.next_due_date,
        amount_due: d.monthly_payment,
        principal: null,
        interest: null,
        balance_after: null,
        paid_at: null,
        status: 'pending',
        loans: { id: d.id, loan_id_display: d.loan_id_display, user_id: d.user_id, data_source: d.data_source }
      }));
    const allPayments = (payments || []).concat(depositNextDue);

    // Active loans only — paid-off / closed loans can be added back later
    // via a separate filter on the loan picker if the team wants that.
    const activeLoans = (loans || []).filter(l => l.status !== 'paid' && l.status !== 'closed');
    if (activeLoans.length) {
      // renderLoanView also calls renderPayments(payments, selectedLoan)
      // so the Payments tab is filtered to the same loan as My Loan.
      renderLoanView(activeLoans, allPayments);
    } else {
      renderNoLoan();
      // No active loans — render the Payments tab in its global empty state.
      renderPayments(allPayments, null);
    }
    // OUS Pasiva loan rows are actually deposits, not loans — reshape them
    // to look like investment records (display-only; nothing in the
    // database is moved) and fold them into My Investments.
    const allInvestments = (investments || []).concat((ousDeposits || []).map(ousDepositToInvestmentShape));
    renderInvestments(allInvestments, distributions);
    renderRaises(raises, userId);
    paintClientSidebarBadges({ raises });
    renderDistributions(distributions);
    renderUpcomingEvents(allPayments, distributions);
    renderPerformanceChart(allInvestments, distributions);

    // Bell-icon notifications panel (also fetch the user's applications)
    const { data: applications } = await OnixDB.client
      .from('loan_applications')
      .select('id, status, submitted_at, amount_requested')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    renderNotifications(allPayments, distributions, applications || []);

    // Client documents (uploaded with applications or by admin)
    const { data: clientDocs } = await OnixDB.client
      .from('client_documents')
      .select('id, name, category, uploaded_at, storage_path, dropbox_url')
      .eq('profile_id', userId)
      .order('uploaded_at', { ascending: false });

    // Stash everything for the global search index
    searchData.loans         = loans || [];
    searchData.investments   = allInvestments;
    searchData.raises        = raises || [];
    searchData.payments      = payments || [];
    searchData.distributions = distributions || [];
    searchData.applications  = applications || [];
    searchData.clientDocs    = clientDocs || [];

    wireLoanApplicationForm(userId, profile);
    wireDocumentsTab(userId, clientDocs || []);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
