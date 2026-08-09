FROM node:22-alpine

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=8787 \
    RUN_WORKER=true

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend-app.js backend-cli.js backend-config.js backend-lock.js backend-migrations.js backend-server.js backend-storage.js backend-summary.js backend-support.js backend-worker.js worker.js ./

RUN npm ci --omit=dev --prefer-offline \
    && npm cache clean --force \
    && mkdir -p /app/database/runtime \
    && chown -R node:node /app/database

USER node
EXPOSE 8787
VOLUME ["/app/database/runtime"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:8787/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "backend-server.js"]
