FROM node:20-alpine

WORKDIR /app

# Instalar dependências do backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Instalar dependências do frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copiar todo o código fonte
COPY . .

# Build do frontend (sempre fresh, sem cache de build)
RUN cd frontend && npm run build

EXPOSE 3000

# Start: baixa arquivos atualizados do GitHub e inicia servidor
CMD REPO=https://raw.githubusercontent.com/dyegofarias86-create/limpar-auto/main && \
    for f in backend/routes/upload.js backend/routes/billing.js backend/routes/dashboard.js backend/server.js backend/routes/clients.js backend/routes/marketing.js; do \
      curl -sf $REPO/$f -o $f && echo "refreshed $f"; \
    done && \
    cd backend && node server.js
