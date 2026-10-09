FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.js security.js finance-state.js zkh-state.js family-zkh.js passkeys.js ./
COPY --chown=node:node dist ./dist
USER node
EXPOSE 3000
CMD ["node", "server.js"]
