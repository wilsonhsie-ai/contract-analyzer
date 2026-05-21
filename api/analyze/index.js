const Busboy = require('busboy');

const ENDPOINT = (process.env.DOC_INTELLIGENCE_ENDPOINT || '').replace(/\/+$/, '');
const KEY = process.env.DOC_INTELLIGENCE_KEY || '';
const API_VERSION = '2024-11-30';
const MODEL_ID = 'prebuilt-contract';

const LEGAL_PATTERNS = {
  'Confidencialidade / NDA': /confidencialidad|sigil|n[aã]o.divulga|NDA/i,
  'Indenizacao / Limitacao': /indeniza[cç][aã]o|limita[cç][aã]o de responsabilidade|indemnif/i,
  'Forca maior': /for[cç]a maior|caso fortuito|force majeure/i,
  'LGPD / Dados pessoais': /LGPD|prote[cç][aã]o de dados|dados pessoais|GDPR/i,
  'Rescisao': /rescis[aã]o|termina[cç][aã]o|encerrament/i,
  'Foro / Jurisdicao': /foro|jurisdi[cç][aã]o|comarca/i,
  'Propriedade intelectual': /propriedade intelectual|direitos autorais|IP rights/i,
  'Anticorrupcao / Compliance': /anticorrup[cç][aã]o|compliance|FCPA|Lei 12\.846/i,
  'Auditoria': /auditori[ao]|right to audit/i,
  'Non-compete / Exclusividade': /n[aã]o.concorr|exclusividade|non.compete/i,
};

const PROCUREMENT_PATTERNS = {
  'SLA / Niveis de servico': /SLA|n[ií]vel de servi[cç]o|service level|disponibilidade.*9[59]/i,
  'Multa / Penalidade': /multa|penalidade|liquidated damages|penalty/i,
  'Prazo de pagamento': /\b(\d{2,3})\s*dias?\s*(corridos?|[uú]teis)?/i,
  'Reajuste IPCA/IGP-M': /IPCA|IGP.M|INPC|reajuste|infla[cç][aã]o/i,
  'Garantia / Warranty': /garanti|warranty/i,
  'Exclusividade': /exclusividade|exclusive supplier/i,
  'Volume minimo': /volume m[ií]nimo|minimum commitment|minimum order/i,
  'Renovacao automatica': /renova[cç][aã]o autom[aá]tica|auto.renew|t[aá]cita recondu[cç][aã]o/i,
  'Reembolso / Credito': /reembolso|cr[eé]dito|refund|chargeback/i,
  'Auditoria de fornecedor': /auditori[ao].*fornece|vendor audit/i,
};

const MONEY_RE = /(R\$|US\$|USD|EUR|\$)\s?[\d\.,]+(?:\s*(?:milh[oõ]es?|mil|thousand|million))?/gi;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers || {})) headers[k.toLowerCase()] = v;
    const bb = Busboy({ headers, limits: { fileSize: 50 * 1024 * 1024 } });
    let fileBuf = null;
    let mimetype = 'application/pdf';
    bb.on('file', (_name, file, info) => {
      mimetype = info.mimeType || mimetype;
      const chunks = [];
      file.on('data', c => chunks.push(c));
      file.on('end', () => { fileBuf = Buffer.concat(chunks); });
    });
    bb.on('finish', () => resolve({ fileBuf, mimetype }));
    bb.on('error', reject);
    bb.end(req.body);
  });
}

async function analyzeContract(fileBuf, contentType) {
  const url = `${ENDPOINT}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}`;
  const submitResp = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': contentType },
    body: fileBuf,
  });
  if (submitResp.status !== 202) {
    const text = await submitResp.text();
    throw new Error(`Submit failed: ${submitResp.status} ${text}`);
  }
  const opUrl = submitResp.headers.get('operation-location');
  if (!opUrl) throw new Error('Missing Operation-Location header');

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pr = await fetch(opUrl, { headers: { 'Ocp-Apim-Subscription-Key': KEY } });
    const data = await pr.json();
    if (data.status === 'succeeded') return data.analyzeResult;
    if (data.status === 'failed') throw new Error(`Analysis failed: ${JSON.stringify(data)}`);
  }
  throw new Error('Polling timeout (>120s)');
}

const firstField = (fields, name) => {
  const f = (fields || {})[name] || {};
  return f.valueString || f.content || f.valueDate || null;
};

function extractParties(fields) {
  const items = ((fields || {}).Parties || {}).valueArray || [];
  return items.map(item => {
    const sub = item.valueObject || {};
    return {
      name: (sub.Name || {}).valueString || (sub.Name || {}).content || null,
      address: (sub.Address || {}).content || null,
    };
  });
}

function extractJurisdictions(fields) {
  const items = ((fields || {}).Jurisdictions || {}).valueArray || [];
  return items.map(i => (i.valueString || i.content || '').trim()).filter(Boolean);
}

function findClauses(content, patterns) {
  const out = [];
  for (const [label, regex] of Object.entries(patterns)) {
    const globalRe = new RegExp(regex.source, 'gi');
    const matches = [...content.matchAll(globalRe)];
    if (matches.length === 0) continue;
    const snippets = matches.slice(0, 2).map(m => {
      const start = Math.max(0, m.index - 80);
      const end = Math.min(content.length, m.index + (m[0] || '').length + 80);
      return '...' + content.slice(start, end).replace(/\n/g, ' ') + '...';
    });
    out.push({ label, count: matches.length, snippets });
  }
  return out;
}

function findMoney(content) {
  const matches = content.match(MONEY_RE) || [];
  return [...new Set(matches)].slice(0, 10);
}

module.exports = async function (context, req) {
  context.res = { headers: { 'Content-Type': 'application/json' } };

  if (!ENDPOINT || !KEY) {
    context.res.status = 500;
    context.res.body = { error: 'DOC_INTELLIGENCE_ENDPOINT/KEY not configured in app settings' };
    return;
  }

  try {
    const { fileBuf, mimetype } = await parseMultipart(req);
    if (!fileBuf) {
      context.res.status = 400;
      context.res.body = { error: 'Arquivo nao enviado' };
      return;
    }

    const result = await analyzeContract(fileBuf, mimetype);
    const docs = result.documents || [];
    const fields = (docs[0] || {}).fields || {};
    const content = result.content || '';

    context.res.status = 200;
    context.res.body = {
      summary: {
        contract_type: firstField(fields, 'ContractType'),
        execution_date: firstField(fields, 'ExecutionDate'),
        effective_date: firstField(fields, 'EffectiveDate'),
        expiration_date: firstField(fields, 'ExpirationDate'),
        renewal_date: firstField(fields, 'RenewalDate'),
        contract_duration: firstField(fields, 'ContractDuration'),
        contract_id: firstField(fields, 'ContractId'),
        page_count: (result.pages || []).length,
        char_count: content.length,
      },
      parties: extractParties(fields),
      jurisdictions: extractJurisdictions(fields),
      legal_clauses: findClauses(content, LEGAL_PATTERNS),
      procurement_terms: findClauses(content, PROCUREMENT_PATTERNS),
      monetary_values: findMoney(content),
    };
  } catch (e) {
    context.log.error(e);
    context.res.status = 500;
    context.res.body = { error: e.message || String(e) };
  }
};
