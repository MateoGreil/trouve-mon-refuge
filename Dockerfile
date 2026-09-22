FROM nginx:1.30.5-alpine

RUN apk add --no-cache jq curl && mkdir -p /usr/share/nginx/html/data

COPY index.html /usr/share/nginx/html/index.html
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/update-refuges.sh /usr/local/bin/update-refuges
COPY --chmod=755 docker/40-start-refuges-refresh.sh /docker-entrypoint.d/40-start-refuges-refresh.sh

EXPOSE 80
