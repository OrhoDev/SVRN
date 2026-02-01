# Natural WSL Fix - Works Without PATH Changes

## Problem
WSL terminals in IDEs don't always read ~/.bashrc, causing Windows/WSL PATH conflicts.

## Solution: Use Local Binaries
Instead of relying on global PATH, use local node_modules binaries directly.

## Changes Made

### relayer/package.json
```json
{
  "scripts": {
    "start": "./node_modules/.bin/ts-node index.ts",
    "build": "tsc",
    "dev": "nodemon index.ts"
  }
}
```

### frontend/package.json  
```json
{
  "scripts": {
    "dev": "./node_modules/.bin/vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  }
}
```

## Why This Works

1. **No PATH dependency**: Uses local binaries
2. **IDE compatible**: Works in any terminal/IDE
3. **No sourcing needed**: No `source ~/.nvm/nvm.sh` required
4. **Cross-platform**: Works on WSL, Linux, Mac
5. **Team-friendly**: No setup required for other devs

## Verification
```bash
# Relayer
npm start  # ✅ Works naturally

# Frontend  
npm run dev  # ✅ Works naturally
```

## For Other Projects
Apply same pattern:
```json
{
  "scripts": {
    "start": "./node_modules/.bin/[binary]",
    "dev": "./node_modules/.bin/[binary]"
  }
}
```

This is the most robust solution for WSL development environments.
