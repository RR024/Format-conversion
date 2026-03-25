# Build frontend
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Build backend runtime
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# LibreOffice is required for some Word conversion flows (.doc/.docx -> pdf and .doc import)
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt

COPY server /app/server
COPY --from=client-builder /app/client/dist /app/server/static

EXPOSE 5000
CMD ["sh", "-c", "uvicorn main:app --app-dir /app/server --host 0.0.0.0 --port ${PORT:-5000}"]
