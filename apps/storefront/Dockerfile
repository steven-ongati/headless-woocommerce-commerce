FROM node:22.22.2-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci

FROM node:22.22.2-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @commerce/storefront

FROM node:22.22.2-alpine AS runtime
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]
