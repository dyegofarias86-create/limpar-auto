#!/bin/bash
set -e
echo "=== LimpAr Auto Startup v2.4 ==="
echo "CWD: $(pwd)"

# ── Atualiza arquivos do backend via GitHub ──────────────────────────────────
echo "Updating backend files from GitHub..."
REPO="https://raw.githubusercontent.com/dyegofarias86-create/limpar-auto/main/backend"

ROUTES="upload.js billing.js dashboard.js provisions.js expenses.js marketing.js notifications.js onedrive.js faturamento-upload.js"
for f in $ROUTES; do
  if curl -sf "$REPO/routes/$f" -o "backend/routes/$f" 2>/dev/null; then
    echo "  ✓ routes/$f"
  fi
done

if curl -sf "$REPO/server.js" -o "backend/server.js" 2>/dev/null; then
  echo "  ✓ server.js"
fi

# ── Atualiza e reconstrói o frontend via GitHub ──────────────────────────────
echo "Updating frontend pages from GitHub..."
FE_REPO="https://raw.githubusercontent.com/dyegofarias86-create/limpar-auto/main/frontend/src"

PAGES="pages/Dashboard.jsx pages/Billing.jsx pages/Provisions.jsx pages/Expenses.jsx pages/Marketing.jsx pages/Clients.jsx pages/Representatives.jsx pages/OneDriveSync.jsx pages/Upload.jsx pages/Agenda.jsx pages/Login.jsx"
for f in $PAGES; do
  if curl -sf "$FE_REPO/$f" -o "frontend/src/$f" 2>/dev/null; then
    echo "  ✓ $f"
  fi
done

COMPONENTS="components/MultiSelect.jsx components/Header.jsx components/Sidebar.jsx components/Layout.jsx"
for f in $COMPONENTS; do
  if curl -sf "$FE_REPO/$f" -o "frontend/src/$f" 2>/dev/null; then
    echo "  ✓ $f"
  fi
done

# Rebuild frontend with latest code
echo "Building frontend..."
cd frontend && npm install --silent && npm run build && cd ..
echo "  ✓ Frontend rebuilt"

# ── Inicia o backend ─────────────────────────────────────────────────────────
echo "Starting backend..."
cd backend && npm install --silent && NODE_ENV=production node server.js
