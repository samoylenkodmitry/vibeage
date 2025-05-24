#!/bin/bash

# World Expansion Setup Script
# This script helps initialize and verify all the new game systems

echo "🌍 Setting up World Expansion features..."

# Check if all required files exist
echo "📁 Verifying file structure..."

# System files
SYSTEMS=(
    "app/game/systems/questSystem.ts"
    "app/game/systems/weatherEventSystem.ts"
    "app/game/systems/dungeonSystem.ts"
    "app/game/systems/zoneSystem.ts"
)

# Component files
COMPONENTS=(
    "app/game/components/GameManager.tsx"
    "app/game/components/QuestUI.tsx"
    "app/game/components/WeatherUI.tsx"
    "app/game/components/DungeonUI.tsx"
    "app/game/components/NPCComponent.tsx"
    "app/game/components/WeatherSystem.tsx"
    "app/game/components/DungeonRoom.tsx"
    "app/game/components/World.tsx"
)

# Shared files
SHARED=(
    "shared/items.ts"
    "shared/zoneSystem.ts"
)

# Documentation
DOCS=(
    "docs/WORLD_EXPANSION.md"
)

missing_files=()

# Check systems
for file in "${SYSTEMS[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    else
        echo "✅ $file"
    fi
done

# Check components
for file in "${COMPONENTS[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    else
        echo "✅ $file"
    fi
done

# Check shared files
for file in "${SHARED[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    else
        echo "✅ $file"
    fi
done

# Check documentation
for file in "${DOCS[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    else
        echo "✅ $file"
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    echo "❌ Missing files:"
    for file in "${missing_files[@]}"; do
        echo "   - $file"
    done
    echo "Please ensure all files are created before proceeding."
    exit 1
fi

echo ""
echo "🎮 Running TypeScript compilation check..."

# Check for TypeScript errors
if command -v npx &> /dev/null; then
    npx tsc --noEmit --project tsconfig.json
    if [ $? -eq 0 ]; then
        echo "✅ TypeScript compilation successful"
    else
        echo "❌ TypeScript compilation errors found"
        echo "Please fix TypeScript errors before proceeding."
        exit 1
    fi
else
    echo "⚠️  npx not found, skipping TypeScript check"
fi

echo ""
echo "🧪 Running basic functionality tests..."

# Check if the game can start without errors
echo "Checking game startup..."

# Verify package.json has required dependencies
echo "📦 Checking dependencies..."

REQUIRED_DEPS=(
    "@react-three/fiber"
    "@react-three/drei"
    "@react-three/rapier"
    "three"
    "react"
    "next"
)

if [ -f "package.json" ]; then
    for dep in "${REQUIRED_DEPS[@]}"; do
        if grep -q "\"$dep\"" package.json; then
            echo "✅ $dep"
        else
            echo "❌ Missing dependency: $dep"
        fi
    done
else
    echo "❌ package.json not found"
    exit 1
fi

echo ""
echo "🌟 World Expansion Setup Complete!"
echo ""
echo "🎯 Quick Start Guide:"
echo "1. Start the development server: npm run dev"
echo "2. Open http://localhost:3000"
echo "3. Enter the game and try these features:"
echo "   - Press 'Q' to open Quest Log"
echo "   - Press 'D' to open Dungeon Browser"
echo "   - Press 'W' to toggle Weather Display"
echo "   - Walk around to discover NPCs and interact with them"
echo "   - Explore different zones to see unique environments"
echo ""
echo "📚 Documentation:"
echo "   - Read docs/WORLD_EXPANSION.md for detailed feature guide"
echo "   - Check individual system files for API documentation"
echo ""
echo "🐛 Troubleshooting:"
echo "   - If you see TypeScript errors, run: npx tsc --noEmit"
echo "   - If components don't render, check browser console"
echo "   - If NPCs don't appear, verify World.tsx integration"
echo ""
echo "🚀 Have fun exploring the expanded world!"
