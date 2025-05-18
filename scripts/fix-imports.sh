#!/bin/bash

# Script to add .js extensions to all relative imports in TypeScript files
# This is needed when using "NodeNext" moduleResolution in TypeScript

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Adding .js extensions to relative imports...${NC}"

# Find all TypeScript files in server and shared directories
find ./server ./shared -name "*.ts" | while read -r file; do
  echo -e "${YELLOW}Processing${NC} $file"
  
  # Use perl for more precise regex matching
  # This adds .js to relative imports without affecting those that already have extensions
  perl -i -pe "s/(from\s+['\"])(\.\.?\/[^'\".]+)(['\"])/\1\2.js\3/g" "$file"
done

echo -e "${GREEN}Done! Now try building with:${NC} pnpm run build:server"
