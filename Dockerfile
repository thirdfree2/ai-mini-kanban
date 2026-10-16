FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.23-alpine AS backend-build
WORKDIR /build/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /build/server .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
WORKDIR /app
COPY --from=backend-build --chown=app:app /build/server /app/server
COPY --from=frontend-build --chown=app:app /build/frontend/dist /app/public
ENV STATIC_DIR=/app/public PORT=8080 GIN_MODE=release
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["/app/server"]
