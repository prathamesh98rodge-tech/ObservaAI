.PHONY: help install dev up down logs test typecheck build build-jetbrains clean reset migrate migrate-new

help:
	@echo "ObservaAI — make targets"
	@echo ""
	@echo "  make install          Install all deps (Node + Python venv)"
	@echo "  make dev              Run gateway + dashboard in dev mode (foreground)"
	@echo "  make up               Start everything in Docker (detached)"
	@echo "  make down             Stop Docker stack"
	@echo "  make logs             Tail Docker logs"
	@echo "  make test             Run gateway pytest suite"
	@echo "  make typecheck        Type-check all TS apps + Python"
	@echo "  make build            Build dashboard + VS Code extension bundles"
	@echo "  make build-jetbrains  Build JetBrains plugin ZIP (requires JDK 21 + network)"
	@echo "  make migrate          Apply pending Alembic migrations (Postgres)"
	@echo "  make migrate-new      Run autogenerate to create a new migration"
	@echo "  make clean            Remove build artifacts, caches, venv"
	@echo "  make reset            Drop the local SQLite database"

install:
	pnpm install
	python3 -m venv apps/gateway/.venv
	apps/gateway/.venv/bin/pip install -q -r apps/gateway/requirements.txt
	@test -f .env || cp .env.example .env
	@test -f apps/gateway/.env || cp .env.example apps/gateway/.env

dev:
	@command -v concurrently >/dev/null || pnpm add -wD concurrently
	pnpm exec concurrently \
	  -n gateway,dashboard \
	  -c yellow,blue \
	  "cd apps/gateway && .venv/bin/uvicorn app.main:app --port 8000 --reload" \
	  "pnpm --filter @observaai/dashboard dev"

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

test:
	cd apps/gateway && .venv/bin/python -m pytest -q

typecheck:
	pnpm --filter @observaai/dashboard exec tsc --noEmit
	pnpm --filter observaai-vscode exec tsc --noEmit
	@echo "✓ All TypeScript apps pass typecheck"

build:
	pnpm --filter @observaai/dashboard build
	pnpm --filter observaai-vscode build

build-jetbrains:
	cd apps/jetbrains-plugin && ./gradlew buildPlugin

clean:
	rm -rf node_modules apps/*/node_modules apps/*/.next apps/*/dist apps/*/.turbo
	rm -rf apps/gateway/.venv apps/gateway/**/__pycache__
	find . -name "*.pyc" -delete

migrate:
	cd apps/gateway && .venv/bin/alembic upgrade head

migrate-new:
	@read -p "Migration message: " msg; \
	cd apps/gateway && .venv/bin/alembic revision --autogenerate -m "$$msg"

reset:
	rm -f apps/gateway/observaai.db
	@echo "✓ Database reset"
