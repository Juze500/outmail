#!/bin/bash
# =============================================================================
# deploy.sh — FRONTEND SERVER only
#
# Run this on the server that hosts the React admin / user interface.
# The Laravel API lives on a separate server — run backend-fresh/deploy.sh there.
#
# Usage (from anywhere on the frontend server):
#   bash /var/www/mail/admin/deploy.sh
#
# What it does:
#   1. git pull (latest code)
#   2. npm ci  (clean, reproducible install)
#   3. npm run build  (compile React → dist/)
#   4. Reload Nginx
# =============================================================================

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"  # e.g. /var/www/mail/admin
ROOT_DIR="$(dirname "$FRONTEND_DIR")"           # e.g. /var/www/mail

echo ""
echo "============================================"
echo "  Mail Manager — Frontend Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ── 1. Pull latest code ────────────────────────────────────────────────────────
echo "▶  Pulling latest code..."
cd "$ROOT_DIR"
git pull origin main
echo "   Done."
echo ""

# ── 2. Install dependencies ────────────────────────────────────────────────────
echo "▶  Installing Node dependencies..."
cd "$FRONTEND_DIR"
npm ci --silent
echo "   Done."
echo ""

# ── 3. Build ───────────────────────────────────────────────────────────────────
echo "▶  Building React app..."
npm run build
echo "   Done."
echo ""

# ── 4. Reload Nginx ───────────────────────────────────────────────────────────
echo "▶  Reloading Nginx..."
sudo systemctl reload nginx
echo "   Done."
echo ""

echo "============================================"
echo "  Frontend deploy complete! ✓"
echo "============================================"
echo ""
