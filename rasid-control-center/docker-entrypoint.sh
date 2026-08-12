#!/bin/sh
set -eu

# nginx config uses fixed upstream api:9000 (Docker Compose service name)
if [ -f /etc/nginx/templates/default.conf.template ]; then
  cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf
fi

exec "$@"
