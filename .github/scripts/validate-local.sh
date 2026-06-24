#!/bin/bash

# Local validation script - mimics GitHub Actions validation
# Usage: ./.github/scripts/validate-local.sh

set -e  # Exit on error

echo "🚀 Running local validation (mimics GitHub Actions)..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILED=0

# Function to print status
print_status() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ $2${NC}"
  else
    echo -e "${RED}❌ $2${NC}"
    FAILED=$((FAILED + 1))
  fi
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. Manifest Validation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Validating manifest.json..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "manifest.json" ]; then
  print_status 1 "manifest.json not found"
else
  # Validate JSON syntax
  if jq empty manifest.json 2>/dev/null; then
    print_status 0 "Valid JSON syntax"
  else
    print_status 1 "Invalid JSON syntax"
  fi

  # Check manifest version
  MANIFEST_VERSION=$(jq -r '.manifest_version' manifest.json)
  if [ "$MANIFEST_VERSION" = "3" ]; then
    print_status 0 "Manifest version 3"
  else
    print_status 1 "Manifest version must be 3, got: $MANIFEST_VERSION"
  fi

  # Check semantic versioning
  VERSION=$(jq -r '.version' manifest.json)
  if echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    print_status 0 "Valid version format: $VERSION"
  else
    print_status 1 "Invalid version format: $VERSION"
  fi

  # Check icon files
  ICONS_OK=0
  for icon in icon16.png icon32.png icon48.png icon128.png; do
    if [ ! -f "$icon" ]; then
      print_status 1 "Icon missing: $icon"
      ICONS_OK=1
    fi
  done
  if [ $ICONS_OK -eq 0 ]; then
    print_status 0 "All icon files exist"
  fi
fi

echo ""

# 2. Icon Dimensions (requires ImageMagick)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Validating icon dimensions..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v identify &> /dev/null; then
  declare -A EXPECTED_SIZES=(
    ["icon16.png"]="16x16"
    ["icon32.png"]="32x32"
    ["icon48.png"]="48x48"
    ["icon128.png"]="128x128"
  )

  ICONS_SIZE_OK=0
  for icon in "${!EXPECTED_SIZES[@]}"; do
    if [ -f "$icon" ]; then
      ACTUAL_SIZE=$(identify -format "%wx%h" "$icon")
      EXPECTED="${EXPECTED_SIZES[$icon]}"
      if [ "$ACTUAL_SIZE" = "$EXPECTED" ]; then
        print_status 0 "$icon: $ACTUAL_SIZE"
      else
        print_status 1 "$icon: $ACTUAL_SIZE (expected $EXPECTED)"
        ICONS_SIZE_OK=1
      fi
    fi
  done
else
  print_warning "ImageMagick not installed - skipping icon dimension check"
  print_warning "Install with: brew install imagemagick"
fi

echo ""

# 3. JavaScript Linting
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Running JavaScript linting..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -d "node_modules" ]; then
  print_warning "node_modules not found - installing dependencies..."
  npm install --silent
fi

if npx eslint *.js --max-warnings 50; then
  print_status 0 "ESLint passed"
else
  print_warning "ESLint found issues (check output above)"
fi

echo ""

# 4. Build Validation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Validating extension structure..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REQUIRED_FILES=(
  "manifest.json"
  "popup.html"
  "popup.js"
  "content.js"
  "background.js"
)

FILES_OK=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    print_status 1 "Required file missing: $file"
    FILES_OK=1
  fi
done

if [ $FILES_OK -eq 0 ]; then
  print_status 0 "All required files present"
fi

# Check file sizes
MAX_SIZE_MB=5
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))
LARGE_FILES=0

for file in *.js *.html; do
  if [ -f "$file" ]; then
    SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
    if [ "$SIZE" -gt "$MAX_SIZE_BYTES" ]; then
      print_status 1 "$file too large: $(($SIZE / 1024 / 1024))MB"
      LARGE_FILES=1
    fi
  fi
done

if [ $LARGE_FILES -eq 0 ]; then
  print_status 0 "All files within size limits"
fi

echo ""

# 5. Security Scanning
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  Security scanning..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check for hardcoded secrets
SECRET_FOUND=0
if grep -rniE "password.*=.*['\"][^'\"]{8,}" *.js *.html 2>/dev/null | grep -v "password.*\*\*\*" | grep -v "example" | grep -v "placeholder" > /dev/null; then
  print_warning "Potential hardcoded passwords found"
  SECRET_FOUND=1
fi

if grep -rniE "api[_-]?key.*=.*['\"][^'\"]{16,}" *.js *.html 2>/dev/null | grep -v "example" > /dev/null; then
  print_warning "Potential hardcoded API keys found"
  SECRET_FOUND=1
fi

if [ $SECRET_FOUND -eq 0 ]; then
  print_status 0 "No hardcoded secrets detected"
fi

# Check for dangerous patterns
DANGEROUS_FOUND=0

if grep -rn "innerHTML\s*=" *.js 2>/dev/null > /dev/null; then
  print_warning "Found innerHTML usage - ensure content is sanitized"
fi

if grep -rn "eval(" *.js 2>/dev/null > /dev/null; then
  print_status 1 "Found eval() - security risk!"
  DANGEROUS_FOUND=1
fi

if [ $DANGEROUS_FOUND -eq 0 ]; then
  print_status 0 "No dangerous patterns (eval) found"
fi

# List permissions
echo ""
echo "📋 Extension permissions:"
jq -r '.permissions[]' manifest.json | sed 's/^/  - /'

echo ""

# 6. Create Package
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  Creating distribution package..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

rm -f extension-local.zip

zip -rq extension-local.zip \
  manifest.json \
  popup.html \
  popup.js \
  content.js \
  background.js \
  icon*.png \
  README.md \
  -x "*.git*" "node_modules/*" "dist/*" ".claude/*"

if [ -f "extension-local.zip" ]; then
  ZIP_SIZE=$(stat -f%z extension-local.zip 2>/dev/null || stat -c%s extension-local.zip)
  print_status 0 "Package created: $(($ZIP_SIZE / 1024))KB"

  if [ "$ZIP_SIZE" -gt $((100 * 1024 * 1024)) ]; then
    print_status 1 "Package too large: $(($ZIP_SIZE / 1024 / 1024))MB (max 100MB)"
  fi
else
  print_status 1 "Failed to create package"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Final summary
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All validation checks passed!${NC}"
  echo ""
  echo "📦 Package: extension-local.zip"
  echo "🚀 Ready to commit and push"
  exit 0
else
  echo -e "${RED}❌ Validation failed with $FAILED error(s)${NC}"
  echo ""
  echo "Please fix the issues above before pushing."
  exit 1
fi
