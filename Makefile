.PHONY: help run prod stop logs db-migrate db-generate

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

run: ## Run dev mode (hot reload, source maps)
	docker compose --env-file .env -f docker compose.yml -f docker compose.dev.yml up --build

prod: ## Run prod mode
	docker compose --env-file .env up --build -d

stop: ## Stop all containers
	docker compose down

logs: ## Follow logs
	docker compose logs -f app

db-generate: ## Generate database migrations
	npm run db:generate

db-migrate: ## Apply database migrations locally
	npm run db:migrate
