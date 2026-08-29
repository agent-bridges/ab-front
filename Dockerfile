FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
ARG BACKEND_URL
RUN test -n "$BACKEND_URL" || (echo >&2 "BACKEND_URL build argument is required"; exit 1)
RUN BACKEND_URL="$BACKEND_URL" npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 deploy/docker/10-require-backend-upstream.sh /docker-entrypoint.d/10-require-backend-upstream.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5180

CMD ["nginx", "-g", "daemon off;"]
