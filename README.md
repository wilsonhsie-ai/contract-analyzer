# Contract Analyzer — Demo Dual-Mode (Jurídico + Procurement)

> **Live demo:** [contract-analyzer-whsie.azurestaticapps.net](https://contract-analyzer-whsie.azurestaticapps.net) *(disponível após primeiro deploy)*

Demo de **Azure AI Document Intelligence** (`prebuilt-contract`) que analisa um contrato sob duas perspectivas: **Jurídica** (mapa de risco, cláusulas LGPD/anticorrupção/força maior) e **Procurement** (SLA, reajuste IPCA, exclusividade, multas). Mesma engine de IA, duas lentes de interpretação.

**Apresentador:** Wilson Hsie · DSAS Microsoft Brasil
**Custo:** R$ 0,00/mês · Azure Document Intelligence F0 + Static Web Apps Free

## Arquitetura

```
[GitHub Repo: wilsonhsie-ai/contract-analyzer]
       ↓ push to main
[GitHub Actions]
       ↓ build & deploy
[Azure Static Web Apps Free]
   ├── Static frontend (HTML+CSS+JS)
   └── Managed API (Node 20 Function)
            ↓ proxy seguro com app setting
       [Azure Document Intelligence F0]
              ↓ analyzeResult
       [Function aplica regex Jurídico + Procurement]
              ↓ JSON
       [Browser renderiza dual-view]
```

## Estrutura

```
contract-analyzer/
├── index.html                         # Frontend
├── static/
│   ├── style.css
│   └── app.js
├── api/                               # Azure Functions (managed)
│   ├── host.json
│   ├── package.json
│   └── analyze/
│       ├── function.json
│       └── index.js                   # Handler que chama Doc Intelligence
├── samples/                           # Contratos de exemplo (fictícios)
│   ├── MSA-PT-completo.pdf
│   ├── Contrato-fornecedor-gap.pdf
│   └── MSA-EN-global.pdf
├── staticwebapp.config.json           # Routing rules
└── .github/workflows/
    └── azure-static-web-apps-*.yml    # Auto-gerado pelo SWA
```

## Setup (uma vez por máquina)

Pré-requisitos: Node 20+, gh CLI, Azure CLI.

```bash
# Clone
gh repo clone wilsonhsie-ai/contract-analyzer
cd contract-analyzer

# Test local com SWA CLI (opcional)
npm install -g @azure/static-web-apps-cli
cd api && npm install && cd ..
swa start . --api-location api
# acessível em http://localhost:4280
```

## App settings necessários (no portal SWA)

| Nome | Valor |
|---|---|
| `DOC_INTELLIGENCE_ENDPOINT` | `https://di-whsie-demos.cognitiveservices.azure.com/` |
| `DOC_INTELLIGENCE_KEY` | (key1 do recurso) |

Configurar via:
```bash
az staticwebapp appsettings set \
  --name contract-analyzer-whsie \
  --setting-names DOC_INTELLIGENCE_ENDPOINT=https://di-whsie-demos.cognitiveservices.azure.com/ \
                 DOC_INTELLIGENCE_KEY=<KEY>
```

## Como demonstrar

1. Abra a URL pública (ou compartilhe com o cliente em tempo real)
2. Faça upload de um contrato em PDF (use `samples/` ou um do cliente)
3. Aguarde 20-60s — Doc Intelligence extrai campos estruturados
4. Toggle **⚖️ Jurídico** ↔ **🛒 Procurement** no topo direito
5. Mostre cláusulas detectadas (✅) e ausentes (⚠️)
6. Encerre com narrativa: Copilot Studio agents consumindo a mesma API

Roteiro completo: ver `Roteiro-Demo-Contract-Analyzer.docx` na pasta original do projeto.

## Limitações conhecidas

- Document Intelligence F0: 500 páginas/mês, 1 req/seg
- Static Web Apps Free: 100 GB banda/mês, 0,5 GB tamanho do app, sem SLA
- Modelo `prebuilt-contract` foi treinado majoritariamente em inglês; campos estruturados (datas, partes) funcionam bem em PT, mas a detecção de cláusulas em PT-BR é feita pela camada de regex desta API

## Próximos passos

- [ ] Conectar com Copilot Studio (agente publicado em Teams)
- [ ] Adicionar Content Safety para PII redaction
- [ ] AI Search para histórico de contratos analisados
- [ ] Power Automate trigger em SharePoint Document Library
