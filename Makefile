.PHONY: dev build test test-frontend test-functions test-all install

# Default target
all: test-all

# Install dependencies
install:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# Build the frontend
build:
	@echo "Building frontend..."
	cd frontend && npm run build

# Run all tests
test-all: test-frontend test-functions
	@echo "✅ All tests passed!"

# Frontend tests using Vitest
test-frontend:
	@echo "Running Frontend tests..."
	cd frontend && npm test

# Supabase Edge Functions tests using Deno
test-functions:
	@echo "Running Supabase Edge Functions tests..."
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/normalize-games/index_test.ts
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/sync-steam/index_test.ts
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/sync-xbox/index_test.ts
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/sync-psn/index_test.ts
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/sync-nintendo/index_test.ts
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/auth-xbox/index_test.ts
	IS_TEST=true deno test --allow-read --allow-env --node-modules-dir=none supabase/functions/sync-all/index_test.ts

# Run the app locally (builds and tests first)
dev: build test-all
	@echo "🚀 Starting development server..."
	cd frontend && npm run dev

# Alias for test-all
test: test-all
