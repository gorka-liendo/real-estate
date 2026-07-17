#!/usr/bin/env bash
# Mata cualquier proceso de dev colgado y libera los puertos 3000-3002.
# Se ejecuta automáticamente antes de `pnpm dev` / `pnpm dev:up` (hooks pre*).
set -e

pkill -f "turbo dev" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
pkill -f "tsx/dist/cli.mjs watch" 2>/dev/null || true

for port in 3000 3001 3002; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
done

echo "✓ puertos 3000-3002 libres y procesos de dev limpios"
