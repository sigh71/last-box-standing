# Single-stage image: installs workspace deps, builds the client SPA, and runs
# the Hono server (which serves the API + the built SPA) via tsx.
FROM node:22-bookworm-slim
WORKDIR /app

# Toolchain for compiling better-sqlite3 if a prebuilt binary isn't available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching.
# NODE_ENV is left unset here so devDependencies (vite, tsx) are installed.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

# Copy the rest of the sources and build the client.
COPY . .
RUN npm run build --workspace client

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "server"]
