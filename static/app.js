const $ = (id) => document.getElementById(id);
let currentMode = 'legal';

$('mode-legal').addEventListener('click', () => switchMode('legal'));
$('mode-procurement').addEventListener('click', () => switchMode('procurement'));

function switchMode(mode) {
  currentMode = mode;
  $('mode-legal').classList.toggle('active', mode === 'legal');
  $('mode-procurement').classList.toggle('active', mode === 'procurement');
  $('legal-view').classList.toggle('hidden', mode !== 'legal');
  $('procurement-view').classList.toggle('hidden', mode !== 'procurement');
}

$('analyze-btn').addEventListener('click', async () => {
  const file = $('file-input').files[0];
  if (!file) {
    setStatus('Selecione um arquivo primeiro.', 'error');
    return;
  }
  setStatus('⏳ Enviando para Azure Document Intelligence... (pode levar 20-60s)', '');
  $('analyze-btn').disabled = true;

  const fd = new FormData();
  fd.append('file', file);

  try {
    const r = await fetch('/api/analyze', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro desconhecido');
    render(data);
    setStatus('✅ Análise concluída!', 'success');
    $('results').classList.remove('hidden');
    $('results').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    setStatus('❌ ' + e.message, 'error');
  } finally {
    $('analyze-btn').disabled = false;
  }
});

function setStatus(msg, cls) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status ' + (cls || '');
}

function field(label, value) {
  return `<div class="field"><strong>${label}:</strong> ${value || '—'}</div>`;
}

function render(d) {
  const s = d.summary || {};
  $('summary').innerHTML =
    field('Tipo', s.contract_type) +
    field('Assinatura', s.execution_date) +
    field('Vigência início', s.effective_date) +
    field('Vigência fim', s.expiration_date) +
    field('Renovação', s.renewal_date) +
    field('Duração', s.contract_duration) +
    field('Páginas', s.page_count);

  $('parties').innerHTML = (d.parties || []).length
    ? d.parties.map(p => `<div class="field"><strong>•</strong> ${p.name || '(sem nome)'} ${p.address ? '<br><small>' + p.address + '</small>' : ''}</div>`).join('')
    : '<em>Nenhuma parte detectada</em>';

  $('jurisdictions').innerHTML = (d.jurisdictions || []).length
    ? d.jurisdictions.map(j => `<span class="pill">${j}</span>`).join('')
    : '<em>—</em>';

  $('money').innerHTML = (d.monetary_values || []).length
    ? d.monetary_values.map(m => `<span class="pill">${m}</span>`).join('')
    : '<em>—</em>';

  renderClauses('legal-clauses', d.legal_clauses, [
    'Confidencialidade / NDA', 'Indenizacao / Limitacao', 'Forca maior',
    'LGPD / Dados pessoais', 'Rescisao', 'Foro / Jurisdicao',
    'Propriedade intelectual', 'Anticorrupcao / Compliance', 'Auditoria', 'Non-compete / Exclusividade'
  ]);
  renderClauses('procurement-clauses', d.procurement_terms, [
    'SLA / Niveis de servico', 'Multa / Penalidade', 'Prazo de pagamento',
    'Reajuste IPCA/IGP-M', 'Garantia / Warranty', 'Exclusividade',
    'Volume minimo', 'Renovacao automatica', 'Reembolso / Credito', 'Auditoria de fornecedor'
  ]);
}

function renderClauses(targetId, found, allLabels) {
  const foundMap = {};
  (found || []).forEach(c => foundMap[c.label] = c);
  const html = allLabels.map(label => {
    const c = foundMap[label];
    if (c) {
      return `<div class="clause">
        <div class="clause-label">✅ ${label} <span class="clause-count">${c.count}</span></div>
        ${(c.snippets || []).map(s => `<div class="clause-snippet">${escapeHtml(s)}</div>`).join('')}
      </div>`;
    } else {
      return `<div class="clause missing">
        <div class="clause-label">⚠️ ${label} — não detectado</div>
        <div class="clause-snippet">Cláusula ausente ou não identificada. Considerar incluir/revisar.</div>
      </div>`;
    }
  }).join('');
  $(targetId).innerHTML = html;
}

function escapeHtml(s) {
  return (s || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
}
