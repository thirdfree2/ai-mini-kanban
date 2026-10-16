FROM golang:1.23-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /server .
FROM alpine:3.21
RUN adduser -D -u 10001 app
USER app
COPY --from=build /server /server
EXPOSE 8080
CMD ["/server"]
