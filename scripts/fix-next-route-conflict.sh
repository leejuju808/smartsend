#!/usr/bin/env bash
set -euo pipefail

APP_DIR="src/app/dashboard/campaigns"
PAGES_DIR="pages/dashboard/campaigns"
TS=$(date +"%Y%m%d-%H%M%S")

# Quick sanity
if [ ! -d "src/app" ] && [ ! -d "pages" ]; then
  echo "No src/app/ or pages/ directories found. Run this from your project root."
  exit 1
fi

# Specific conflict: /dashboard/campaigns/[id]
APP_TARGET="$APP_DIR/[id]"
PAGES_TARGET="$PAGES_DIR"

has_app_target=false
has_pages_target=false

if [ -d "$APP_TARGET" ] || [ -f "$APP_TARGET/page.tsx" ] || [ -f "$APP_TARGET/page.jsx" ]; then
  has_app_target=true
fi

if [ -d "$PAGES_TARGET" ]; then
  # only treat it as a conflict if it contains a dynamic route matching [id].tsx/.jsx
  if compgen -G "$PAGES_TARGET/[id].tsx" > /dev/null || compgen -G "$PAGES_TARGET/[id].jsx" > /dev/null; then
    has_pages_target=true
  fi
fi

if $has_app_target && $has_pages_target; then
  echo "✅ Detected duplicate route for /dashboard/campaigns/[id] in both App and Pages routers."
  BACKUP="backup_pages_dashboard_campaigns_$TS"
  mkdir -p ".route_backups/$BACKUP"
  echo "→ Backing up $PAGES_DIR to .route_backups/$BACKUP/"
  cp -R "$PAGES_DIR" ".route_backups/$BACKUP/"

  echo "→ Removing Pages router duplicate at $PAGES_DIR"
  rm -rf "$PAGES_DIR"

  echo "Done. App Router version now owns /dashboard/campaigns/[id]."
  exit 0
fi

# If no specific conflict above, still check for any same-path duplicates under /dashboard
if [ -d "$APP_DIR" ] && [ -d "$PAGES_TARGET" ]; then
  echo "⚠️  Found both $APP_DIR (App) and $PAGES_TARGET (Pages)."
  echo "Keeping App Router. Backing up and removing Pages directory to prevent future conflicts."
  BACKUP="backup_pages_dashboard_campaigns_$TS"
  mkdir -p ".route_backups/$BACKUP"
  cp -R "$PAGES_TARGET" ".route_backups/$BACKUP/"
  rm -rf "$PAGES_TARGET"
  echo "Done."
  exit 0
fi

echo "No duplicate /dashboard/campaigns conflicts found. Nothing to do."
