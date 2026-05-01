#!/bin/bash
# =============================================================================
# deploy.sh — BACKEND SERVER only
#
# Run this on the server that hosts the Laravel API.
# The frontend lives on a separate server — run admin/deploy.sh there.
#
# Usage (from anywhere on the backend server):
#   bash /var/www/mail/backend-fresh/deploy.sh
#
# What it does:
#   1. git pull (latest code)
#   2. composer install --no-dev
#   3. php artisan migrate --force  ← SAFE: insertOrIgnore never overwrites data
#   4. Rebuild config / route / view caches
#   5. Fix storage permissions
#   6. Reload PHP-FPM
# =============================================================================

set -e

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"   # e.g. /var/www/mail/backend-fresh
ROOT_DIR="$(dirname "$BACKEND_DIR")"            # e.g. /var/www/mail

echo ""
echo "============================================"
echo "  Mail Manager — Backend Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ── 1. Pull latest code ────────────────────────────────────────────────────────
echo "▶  Pulling latest code..."
cd "$ROOT_DIR"
git pull origin main
echo "   Done."
echo ""

# ── 2. PHP dependencies ────────────────────────────────────────────────────────
echo "▶  Installing PHP dependencies..."
cd "$BACKEND_DIR"
composer install --no-dev --optimize-autoloader --quiet
echo "   Done."
echo ""

# ── 3. Database migrations (SAFE) ─────────────────────────────────────────────
# New settings use insertOrIgnore — existing data is NEVER touched.
# Only brand-new rows are added; nothing already in the database is changed.
echo "▶  Running migrations (existing data preserved)..."
php artisan migrate --force
echo "   Done."
echo ""

# ── 4. Rebuild caches ─────────────────────────────────────────────────────────
echo "▶  Rebuilding caches..."
php artisan config:clear  && php artisan config:cache
php artisan route:clear   && php artisan route:cache
php artisan view:clear    && php artisan view:cache
echo "   Done."
echo ""

# ── 5. Fix permissions ────────────────────────────────────────────────────────
echo "▶  Fixing permissions..."
sudo chown -R www-data:www-data "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache"
sudo chmod -R 775              "$BACKEND_DIR/storage" "$BACKEND_DIR/bootstrap/cache"
echo "   Done."
echo ""

# ── 6. Reload PHP-FPM ─────────────────────────────────────────────────────────
echo "▶  Reloading PHP-FPM..."
sudo systemctl reload php8.2-fpm
echo "   Done."
echo ""

echo "============================================"
echo "  Backend deploy complete! ✓"
echo "============================================"
echo ""
