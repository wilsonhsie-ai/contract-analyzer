const $ = (id) => document.getElementById(id);
const MAX_FILES = 3;

const LEGAL_LABELS = [
  'Confidencialidade / NDA', 'Indenizacao / Limitacao', 'Forca maior',
  'LGPD / Dados pessoais', 'Rescisao', 'Foro / Jurisdicao',
  'Propriedade intelectual', 'Anticorrupcao / Compliance', 'Auditoria', 'Non-compete / Exclusividade'
];
const PROCUREMENT_LABELS = [
  'SLA / Niveis de servico', 'Multa / Penalidade', 'Prazo de pagamento',
  'Reajuste IPCA/IGP-M', 'Garantia / Warranty', 'Exclusividade',
  'Volume minimo', 'Renovacao automatica', 'Reembolso / Credito', 'Auditoria de fornecedor'
];

let currentMode = 'legal';
let analyses = [];

$('mode-legal').addEventListener('click', () => switchMode('legal'));
$('mode-procurement').addEventListener('click', () => switchMode('procurement'));
$('file-input').addEventListener('change', handleFileSelect);
$('analyze-btn').addEventListener('click', analyzeAll);

function switchMode(mode) {
  currentMode = mode;
  $('mode-legal').classList.toggle('active', mode === 'legal');
  $('mode-procurement').classList.toggle('active', mode === 'procurement');
  if (mode === 'legal') {
    $('compare-title').textContent = '⚖️ Comparativo de cláusulas — Visão Jurídica';
    $('compare-subtitle').textContent = 'Mapa de risco contratual: cláusulas detectadas e gaps potenciais por contrato.';
  } else {
    $('compare-title').textContent = '🛒 Comparativo de termos — Visão Procurement';
    $('compare-subtitle').textContent = 'Termos comerciais, SLAs, reajustes e cláusulas de risco financeiro lado a lado.';
  }
  if (analyses.length) renderComparison();
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  if (files.length > MAX_FILES) {
    setStatus(`⚠️ Máximo ${MAX_FILES} contratos. Selecione novamente.`, 'error');
    e.target.value = '';
    $('file-list').innerHTML = '';
    return;
  }
  setStatus('');
  $('file-list').innerHTML = files.length
    ? `<strong>${files.length}/${MAX_FILES} selecionados:</strong> ` +
      files.map(f => `<span class="file-pill">${escapeHtml(f.name)} <small>(${(f.size/1024).toFixed(1)} KB)</small></span>`).join('')
    : '';
}

async function analyzeAll() {
  const files = Array.from($('file-input').files || []);
  if (!files.length) {
    setStatus('Selecione pelo menos 1 contrato.', 'error');
    return;
  }
  if (files.length > MAX_FILES) {
    setStatus(`Máximo ${MAX_FILES} contratos.`, 'error');
    return;
  }
  $('analyze-btn').disabled = true;
  analyses = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setStatus(`⏳ Processando ${i + 1}/${files.length}: ${f.name} (Azure DI · 20-60s por contrato)`, '');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await fetch('/api/analyze', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
      analyses.push({ name: f.name, data });
    } catch (e) {
      setStatus(`❌ Erro em ${f.name}: ${e.message}`, 'error');
      $('analyze-btn').disabled = false;
      return;
    }
  }

  setStatus(`✅ ${files.length} contrato(s) analisado(s) com sucesso!`, 'success');
  renderResults();
  $('results').classList.remove('hidden');
  $('results').scrollIntoView({ behavior: 'smooth' });
  $('analyze-btn').disabled = false;
}

function renderResults() {
  renderSummaries();
  renderComparison();
}

function renderSummaries() {
  const grid = $('summaries');
  grid.style.gridTemplateColumns = `repeat(${analyses.length}, minmax(0, 1fr))`;
  grid.innerHTML = analyses.map((a, i) => {
    const s = a.data.summary || {};
    const parties = (a.data.parties || []).map(p => p.name).filter(Boolean).join(' × ') || '—';
    const jurisdictions = (a.data.jurisdictions || []).join(', ') || '—';
    const money = (a.data.monetary_values || []).slice(0, 3).join(' · ') || '—';
    return `
      <div class="summary-card">
        <div class="summary-tag">Contrato ${i + 1}</div>
        <div class="summary-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
        <div class="summary-row"><strong>Partes:</strong> ${escapeHtml(parties)}</div>
        <div class="summary-row"><strong>Tipo:</strong> ${escapeHtml(s.contract_type || '—')}</div>
        <div class="summary-row"><strong>Assinatura:</strong> ${escapeHtml(s.execution_date || '—')}</div>
        <div class="summary-row"><strong>Vigência:</strong> ${escapeHtml(s.effective_date || '—')} → ${escapeHtml(s.expiration_date || '—')}</div>
        <div class="summary-row"><strong>Duração:</strong> ${escapeHtml(s.contract_duration || '—')}</div>
        <div class="summary-row"><strong>Jurisdição:</strong> ${escapeHtml(jurisdictions)}</div>
        <div class="summary-row"><strong>Valores:</strong> ${escapeHtml(money)}</div>
        <div class="summary-row"><strong>Páginas:</strong> ${s.page_count || '—'}</div>
      </div>
    `;
  }).join('');
}

function renderComparison() {
  const labels = currentMode === 'legal' ? LEGAL_LABELS : PROCUREMENT_LABELS;
  const tableData = analyses.map(a =>
    currentMode === 'legal' ? (a.data.legal_clauses || []) : (a.data.procurement_terms || [])
  );

  let html = '<thead><tr><th class="label-col">Cláusula / Termo</th>';
  analyses.forEach((a, i) => {
    html += `<th title="${escapeHtml(a.name)}">Contrato ${i + 1}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (const label of labels) {
    html += `<tr><td class="label-col">${label}</td>`;
    for (const clauses of tableData) {
      const found = clauses.find(c => c.label === label);
      if (found) {
        const tip = (found.snippets || []).join('\n\n').replace(/"/g, '&quot;');
        html += `<td class="cell present" title="${escapeHtml(tip)}">
          <span class="check">✅</span><span class="count">${found.count}</span>
        </td>`;
      } else {
        html += `<td class="cell missing"><span class="warn">⚠️</span><span class="missing-text">ausente</span></td>`;
      }
    }
    html += '</tr>';
  }

  html += `<tr class="totals-row"><td class="label-col"><strong>Total de gaps</strong></td>`;
  for (const clauses of tableData) {
    const found = clauses.map(c => c.label);
    const gaps = labels.filter(l => !found.includes(l)).length;
    const cls = gaps === 0 ? 'gap-zero' : (gaps <= 2 ? 'gap-low' : (gaps <= 5 ? 'gap-mid' : 'gap-high'));
    html += `<td class="cell totals ${cls}"><strong>${gaps}/${labels.length}</strong></td>`;
  }
  html += '</tr></tbody>';

  $('comparison-table').innerHTML = html;
}

function setStatus(msg, cls) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status ' + (cls || '');
}

function escapeHtml(s) {
  return (s || '').toString().replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}
