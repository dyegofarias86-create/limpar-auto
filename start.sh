#!/bin/bash
# Script de inicialização do Sistema LimpAr

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR/frontend"

echo ""
echo "🌀 LimpAr Auto — Sistema de Gestão"
echo "===================================="
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale em: https://nodejs.org"
  exit 1
fi

echo "📦 Instalando dependências do backend..."
cd "$BACKEND_DIR"
npm install --silent

echo "📦 Instalando dependências do frontend..."
cd "$FRONTEND_DIR"
npm install --silent

echo ""
echo "🗃️  Inicializando banco de dados e seed..."
cd "$BACKEND_DIR"
node db/seed.js

echo ""
echo "🚀 Iniciando servidores..."
echo ""

# Start backend in background
cd "$BACKEND_DIR"
npm start &
BACKEND_PID=$!

sleep 1

# Start frontend
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Sistema iniciado com sucesso!"
echo ""
echo "   Backend API:  http://localhost:3001/api/health"
echo "   Frontend:     http://localhost:5173"
echo ""
echo "   Logins:"
echo "   Líder:         lider@limpar.com / limpar123"
echo "   Representante: adriano@limpar.com / limpar123"
echo "   Vendedor:      alexandre@limpar.com / limpar123"
echo ""
echo "   Pressione Ctrl+C para parar..."
echo ""

# Handle exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Servidores encerrados.'; exit 0" INT TERM

wait $FRONTEND_PID
