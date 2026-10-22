FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
ENV NODE_ENV=production PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/services/scrapers/requirements.txt ./services/scrapers/requirements.txt
RUN npm ci --omit=dev && npx playwright install --with-deps chromium \
    && apt-get update && apt-get install -y --no-install-recommends python3 python3-venv antiword \
    && python3 -m venv /opt/scraper \
    && /opt/scraper/bin/pip install --no-cache-dir -r services/scrapers/requirements.txt \
    && rm -rf /var/lib/apt/lists/* /root/.cache \
    && chmod -R a+rX /opt/browsers
ENV PYTHON_BIN=/opt/scraper/bin/python
COPY --chown=node:node backend/ ./
COPY --from=frontend /build/frontend/dist /app/frontend/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
