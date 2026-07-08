#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

source_env() {
  set -a
  # shellcheck disable=SC1091
  source .data/database.env
  set +a
}

setup_local_postgres() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql не найден. Установите PostgreSQL или Docker Desktop."
    exit 1
  fi

  echo "Docker недоступен — настраиваю локальный PostgreSQL..."

  psql -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'openweb') THEN
    CREATE ROLE openweb WITH LOGIN PASSWORD 'openweb' CREATEDB;
  END IF;
END
$$;

SELECT 'CREATE DATABASE openweb OWNER openweb'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'openweb')\gexec

GRANT ALL PRIVILEGES ON DATABASE openweb TO openweb;
SQL

  psql "postgresql://openweb:openweb@localhost:5432/openweb" -v ON_ERROR_STOP=1 -c \
    "GRANT ALL ON SCHEMA public TO openweb; ALTER SCHEMA public OWNER TO openweb;"

  echo "Локальная база готова: postgresql://openweb:openweb@localhost:5432/openweb"
}

if docker info >/dev/null 2>&1; then
  docker compose up -d
  echo "PostgreSQL в Docker запущен. Данные: .data/postgres"
  source_env
  echo "Подключение: ${DATABASE_URL}"
else
  setup_local_postgres
fi
