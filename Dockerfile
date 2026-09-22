ARG ALPINE_VERSION=3.22
ARG NGINX_VERSION=1.31.6

FROM alpine:${ALPINE_VERSION} AS updater
ARG TARGETARCH
ARG SUPERCRONIC_VERSION=v0.2.45
ARG SUPERCRONIC_SHA256_AMD64=bb6da5af8d5547c9a5cbb4cf58d9f5541f0433df2188bfe4f1a54b04ad253db6
ARG SUPERCRONIC_SHA256_ARM64=c0f21174f7bb3c80a9b33567ba0cfbeb3e51e765fe9808267ba72a1ac88c3dba
ENV TZ=UTC
RUN apk add --no-cache ca-certificates curl jq \
    && architecture="${TARGETARCH:-$(apk --print-arch)}" \
    && case "$architecture" in \
      amd64|x86_64) binaire=amd64; checksum="$SUPERCRONIC_SHA256_AMD64" ;; \
      arm64|aarch64) binaire=arm64; checksum="$SUPERCRONIC_SHA256_ARM64" ;; \
      *) echo "Architecture non supportée: $architecture" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${binaire}" -o /usr/local/bin/supercronic \
    && echo "$checksum  /usr/local/bin/supercronic" | sha256sum -c - \
    && chmod 755 /usr/local/bin/supercronic \
    && mkdir -p /usr/share/nginx/html/data
COPY --chmod=755 docker/update-refuges.sh /usr/local/bin/update-refuges
COPY --chmod=755 docker/updater-entrypoint.sh /usr/local/bin/updater-entrypoint
COPY --chmod=755 docker/check-snapshot.sh /usr/local/bin/check-snapshot
COPY docker/refuges.crontab /etc/refuges.crontab
ENTRYPOINT ["/usr/local/bin/updater-entrypoint"]
HEALTHCHECK --interval=1m --timeout=10s --retries=3 --start-period=30s CMD ["/usr/local/bin/check-snapshot"]

FROM nginx:${NGINX_VERSION}-alpine AS web
RUN mkdir -p /usr/share/nginx/html/data
COPY index.html /usr/share/nginx/html/index.html
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY docker/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
