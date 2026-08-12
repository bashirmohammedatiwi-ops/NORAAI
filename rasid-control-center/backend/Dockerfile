FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x docker-entrypoint.sh

ENV PYTHONPATH=/app
ENV APP_ENV=production

EXPOSE 9000

HEALTHCHECK --interval=10s --timeout=8s --retries=18 --start-period=120s \
  CMD curl -f http://127.0.0.1:9000/health/ready || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
