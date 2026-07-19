#!/bin/bash
set -e
echo "=== LimpAr Auto Startup v2.3 ==="
echo "CWD: $(pwd)"
echo "Updating backend routes from GitHub..."

REPO="https://raw.githubusercontent.com/dyegofarias86-create/limpar-auto/main/backend/routes"
FILES="upload.js billing.js dashboard.js provisions.js expenses.js marketing.js notifications.js"

for f in $FILES; do
  if curl -sf "$REPO/$f" -o "backend/routes/$f" 2>/dev/null; then
    echo "✓ Updated: $f"
  else
    echo "⚠ Kept existing: $f"
  fi
done

# Also update server.js
if curl -sf "https://raw.githubusercontent.com/dyegofarias86-create/limpar-auto/main/backend/server.js" -o "backend/server.js" 2>/dev/null; then
  echo "✓ Updated: server.js"
fi

echo "Starting backend..."
cd backend && npm install --silent && NODE_ENV=production node server.js
