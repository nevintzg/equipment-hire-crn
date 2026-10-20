# Only needed if the team deploys to a container host instead of Render's
# native Node runtime. Multi-stage keeps the final image free of build tools.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
# argon2 is a native addon — it needs a toolchain to build, but only here.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY src ./src
USER node
EXPOSE 4000
# Liveness check that never touches the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
