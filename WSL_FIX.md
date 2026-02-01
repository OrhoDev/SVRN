# WSL Node.js PATH Fix

## Problem
When running `npm` commands in WSL, Windows `npm` is called instead of WSL's Node.js, causing:
- `ts-node not recognized`
- `vite not recognized` 
- UNC path errors
- `'\\wsl.localhost\Ubuntu\...'` errors

## Root Cause
Windows PATH takes precedence over WSL PATH, so Windows Node.js is used instead of WSL's NVM-managed Node.js.

## Permanent Fix

### Option 1: Add to ~/.bashrc (Recommended)
```bash
# Add these lines to the end of ~/.bashrc
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

### Option 2: One-time setup
```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc
source ~/.bashrc
```

### Option 3: Manual prefix (Temporary)
```bash
source ~/.nvm/nvm.sh && npm start
source ~/.nvm/nvm.sh && npm run dev
```

## Verification
```bash
# Should show WSL path, not Windows
which npm
# Output: /home/dev0/.nvm/versions/node/v24.13.0/bin/npm

# Should work without errors
npm --version
npm start
npm run dev
```

## For Other Developers

### In README.md
Add this section:
```markdown
## WSL Development Setup

If using WSL, ensure Node.js PATH is configured correctly:

```bash
# Fix WSL Node.js PATH
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc
source ~/.bashrc

# Verify
which npm  # Should show /home/.../npm, not Windows path
```
```

### In package.json scripts
Add explicit sourcing:
```json
{
  "scripts": {
    "start": "source ~/.nvm/nvm.sh && ts-node index.ts",
    "dev": "source ~/.nvm/nvm.sh && vite"
  }
}
```

## Impact
- ✅ Fixes WSL Node.js PATH issues permanently
- ✅ Works for all WSL users
- ✅ No need to remember `source ~/.nvm/nvm.sh` prefix
- ✅ Prevents Windows/WSL conflicts
- ✅ Works across terminal sessions
