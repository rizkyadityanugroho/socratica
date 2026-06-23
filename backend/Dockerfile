FROM node:20-alpine
WORKDIR /app

# Install production deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# .env mounted at runtime via docker-compose, but include a fallback
# so the container doesn't crash if .env is missing at build time
RUN touch .env

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode!==200?1:0)).on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
