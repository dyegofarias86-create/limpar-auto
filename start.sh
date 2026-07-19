#!/bin/bash
echo "=== LimpAr Auto Startup ==="
echo "Updating backend routes from GitHub..."

# Pull latest routes from GitHub
REPO="https://raw.githubusercontent.com/dyegofarias86-create/limpar-auto/main/backend/routes"
FILES="upload.js billing.js dashboard.js provisions.js expenses.js marketing.js"
for f in $FILES; do
  curl -sf "$REPO/$f" -o "backend/routes/$f" && echo "Updated: $f" || echo "Skipped (failed): $f"
done

echo "Starting backend..."
cd backend && npm install && NODE_ENV=production node server.js
