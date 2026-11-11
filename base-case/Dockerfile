FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Small droplets (1 GB) run out of heap in the Vite build; let Node use swap instead of aborting.
RUN NODE_OPTIONS=--max-old-space-size=2048 npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.json ./
EXPOSE 8787
USER node
CMD ["npx", "tsx", "server/index.ts"]
