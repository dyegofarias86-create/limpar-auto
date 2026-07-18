# LimpAr Auto — Sistema de Gestão Comercial

Sistema web full-stack para acompanhamento de representantes comerciais, vendedores, faturamento, provisões, verba de marketing e agenda.

## Tecnologias

- **Frontend:** React 18 + Vite + TailwindCSS + Recharts
- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Auth:** JWT
- **Upload:** Multer + xlsx

## Paleta de cores

| Cor | HEX |
|-----|-----|
| Azul Ciano (primário) | `#00AEEF` |
| Teal Escuro | `#0D4F5C` |
| Branco | `#FFFFFF` |

## Como rodar

### Requisitos
- Node.js 18+ ([nodejs.org](https://nodejs.org))
- npm 9+

### Iniciar tudo de uma vez
```bash
chmod +x start.sh
./start.sh
```

### Ou manualmente:

**Backend:**
```bash
cd backend
npm install
node db/seed.js   # popula banco com dados da planilha
npm start         # porta 3001
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev       # porta 5173
```

Acesse: **http://localhost:5173**

## Usuários criados pelo seed

| Perfil | Email | Senha |
|--------|-------|-------|
| Líder | lider@limpar.com | limpar123 |
| Representante | adriano@limpar.com | limpar123 |
| Vendedor | alexandre@limpar.com | limpar123 |

## Módulos

### Dashboard
- KPIs: faturamento, gastos, provisão, verba MKT
- Gráfico faturamento vs gastos (6 meses)
- Ranking por grupo
- Gastos por categoria

### Faturamento
- Listagem por loja com TMO, valor unitário e total
- Controle de NF emitida/enviada
- Filtro por grupo
- Gráfico TMO por produto

### Provisões
- Cálculo automático: TMO × R$/TMO por cliente
- Saldo anterior + provisão mensal = total disponível
- Retiradas de provisão com desconto em tempo real
- Resumo por grupo e detalhe por loja

### Verba de Marketing
- Cálculo: TMO × R$ 0,25
- Histórico anual mensal
- Solicitações de uso com dedução do saldo
- Gráfico mensal verba gerada vs utilizada

### Gastos
- Lançamento de gastos de representante e vendedor
- Categorias: Aluguel Veículo, Combustível, Alimentação, Hospedagem, Pedágio, Balsa, Outros
- Resumo consolidado por categoria

### Agenda
- Calendário mensal estilo planilha atual
- Eventos com: cliente, data, relato da visita, dificuldades, plano de ação
- Líder visualiza agendas de todos os representantes

### Clientes
- Cadastro completo com CNPJ, grupo, marca, cidade/UF
- Indicador de ativo/inativo
- Valor de provisão por TMO por cliente

### Upload
- Importação de planilha .xlsx/.xls/.csv
- Leitura das abas: PROVISÃO, FATURAMENTO, GASTOS REP, GASTOS VEND, REEMBOLSO, VB MKT
- Histórico de uploads com status e contagem de erros

### Representantes (só Líder)
- Lista de representantes com contagem de clientes e vendedores
- Painel de detalhes: faturamento, gastos, provisão, lista de clientes

## Perfis de acesso

| Perfil | Permissões |
|--------|-----------|
| Líder | Tudo: todos os dashboards, todos os representantes, upload |
| Representante | Seus dados + vendedor vinculado; preenche agenda |
| Vendedor | Seus gastos; leitura do dashboard próprio |

## Estrutura do projeto

```
limpar-system/
├── backend/
│   ├── server.js
│   ├── db/
│   │   ├── schema.js    # DDL SQLite
│   │   └── seed.js      # Dados da planilha de julho/2026
│   ├── middleware/
│   │   └── auth.js      # JWT middleware
│   └── routes/
│       ├── auth.js
│       ├── dashboard.js
│       ├── representatives.js
│       ├── expenses.js
│       ├── provisions.js
│       ├── billing.js
│       ├── marketing.js
│       ├── agenda.js
│       ├── clients.js
│       └── upload.js
└── frontend/
    └── src/
        ├── contexts/AuthContext.jsx
        ├── components/
        │   ├── Layout.jsx
        │   ├── Sidebar.jsx
        │   └── Header.jsx
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── Billing.jsx
            ├── Provisions.jsx
            ├── Expenses.jsx
            ├── Marketing.jsx
            ├── Agenda.jsx
            ├── Clients.jsx
            ├── Representatives.jsx
            └── Upload.jsx
```
