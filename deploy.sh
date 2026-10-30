#!/usr/bin/env bash

# ==============================================================================
# Dr. Hair Backend - Local CI/CD Build & Production Deployment Pipeline
# ==============================================================================
# Usage:
#   npm run deploy
#   or:
#   ./deploy.sh "optional commit message"
# ==============================================================================

set -e

# Terminal colors
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}${CYAN}=====================================================${NC}"
echo -e "${BOLD}${CYAN} 🚀 DR. HAIR BACKEND - LOCAL CI/CD PIPELINE         ${NC}"
echo -e "${BOLD}${CYAN}=====================================================${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 1: Environment & Toolchains Check
# ------------------------------------------------------------------------------
echo -e "${BOLD}[1/4] 🔍 Verifying Environment & Toolchains...${NC}"

if [ -d "/Users/sunil/Documents/all_sdk/nodejs/bin" ]; then
  export PATH="/Users/sunil/Documents/all_sdk/nodejs/bin:$PATH"
fi

echo -e "  • Node version: $(node -v)"
echo -e "  • NPM version:  $(npm -v)"
echo -e "  • Vercel CLI:   $(npx --yes vercel --version)"
echo -e "${GREEN}  ✓ Environment verified!${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 2: Smoke Check Server & API Index
# ------------------------------------------------------------------------------
echo -e "${BOLD}[2/4] 🏗️  Validating Backend API & Serverless Handler...${NC}"

node -e "
import('./api/index.js').then(() => {
  console.log('  ✓ API handler verified successfully!');
  process.exit(0);
}).catch((err) => {
  console.error('  ✗ API validation failed:', err);
  process.exit(1);
});
"

echo -e "${GREEN}  ✓ Validation passed with 0 errors!${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 3: Deploy Directly to Vercel Production
# ------------------------------------------------------------------------------
echo -e "${BOLD}[3/4] ☁️  Deploying Live to Vercel Production...${NC}"

npx --yes vercel --prod --yes

# Ensure SSO protection stays disabled for public API access
npx --yes vercel project protection disable backend --sso --yes 2>/dev/null || true

echo -e "${GREEN}  ✓ Successfully published to Vercel Production!${NC}"
echo ""

# ------------------------------------------------------------------------------
# STEP 4: Git Sync (Commit & Push to GitHub)
# ------------------------------------------------------------------------------
echo -e "${BOLD}[4/4] 📦 Synchronizing GitHub Repository (sunil2037/dr_hair_backend)...${NC}"

if [ -d ".git" ]; then
  git add -A
  if git diff-index --quiet HEAD --; then
    echo -e "  • Git working tree is already clean. Nothing to commit."
  else
    COMMIT_MSG="${1:-deploy: update backend and deploy to production}"
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}  ✓ Changes committed: '$COMMIT_MSG'${NC}"
  fi

  git push origin main
  echo -e "${GREEN}  ✓ GitHub repository synced with latest code!${NC}"
else
  echo -e "${YELLOW}  • No .git folder detected in current folder, skipping git push.${NC}"
fi

echo ""
echo -e "${BOLD}${GREEN}=====================================================${NC}"
echo -e "${BOLD}${GREEN} 🎉 CI/CD PIPELINE COMPLETE! YOUR BACKEND IS LIVE!   ${NC}"
echo -e "${BOLD}${GREEN}=====================================================${NC}"
echo -e "  🌐 Production API:  ${BOLD}${CYAN}https://backend-ten-kappa-69.vercel.app${NC}"
echo -e "  📋 Health Check:    ${BOLD}${CYAN}https://backend-ten-kappa-69.vercel.app/health${NC}"
echo -e "  📦 GitHub Repo:     ${BOLD}https://github.com/sunil2037/dr_hair_backend${NC}"
echo ""
