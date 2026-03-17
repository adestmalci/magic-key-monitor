FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .

CMD ["dumb-init", "npm", "run", "worker:disney"]
