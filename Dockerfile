FROM node:20-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --include=dev
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production

CMD ["dumb-init", "npm", "run", "worker:disney"]
