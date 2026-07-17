FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev

COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS builder

COPY . .
RUN npm run test:server

FROM deps AS production

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# copy TanStack Start runtime output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/mesher-backend-origin.mjs ./mesher-backend-origin.mjs
COPY --from=builder /app/public ./public
RUN npm prune --omit=dev

EXPOSE 3000
USER node

CMD ["node", "server.mjs"]
