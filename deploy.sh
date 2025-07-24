#!/bin/bash

# Simple deployment script for GitHub Pages
# This script builds the project and deploys it to gh-pages branch

echo "🚀 Deploying to GitHub Pages..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Warning: You have uncommitted changes"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        exit 1
    fi
fi

# Build and deploy
echo "📦 Building project..."
npm run build

if [ $? -eq 0 ]; then
    echo "🚀 Deploying to gh-pages branch..."
    npm run deploy
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment successful!"
        echo "📍 Your site will be available at: https://$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\)\/\([^.]*\).*/\1.github.io\/\2/')/"
    else
        echo "❌ Deployment failed"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi
