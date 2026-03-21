FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_GIT_RUN_NUMBER=0
ARG VITE_GIT_REVISION=unknown
ARG VITE_MANAGEMENT_API_BASE_URL=

ENV VITE_GIT_RUN_NUMBER=${VITE_GIT_RUN_NUMBER}
ENV VITE_GIT_REVISION=${VITE_GIT_REVISION}
ENV VITE_MANAGEMENT_API_BASE_URL=${VITE_MANAGEMENT_API_BASE_URL}

RUN pnpm build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
