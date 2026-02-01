# Cleanup Guide

**Note:** Most temporary files have been cleaned up. This document is kept for reference.

## Files Already Cleaned Up

The following files have been removed:
- All `test-*.js` files
- `verify-production.js`
- Temporary planning docs (3_HOUR_PLAN.md, etc.)
- Old relayer files

## Temporary Documentation Files (Can Archive)

These were created during development and can be moved to a `docs/archive/` folder:

- `3_HOUR_PLAN.md` - Development planning doc
- `DECRYPTION_FIX_TIME.md` - Technical notes
- `FULL_FLOW_ANALYSIS.md` - Analysis doc
- `NATURAL_FIX.md` - Fix notes
- `QUICK_FIX_PLAN.md` - Planning doc
- `TALLY_ISSUE.md` - Issue tracking
- `WSL_FIX.md` - WSL-specific fixes
- `NPM_SIGNUP_GUIDE.md` - Can keep or move to docs
- `PUBLISH_CHECKLIST.md` - Can keep or move to docs
- `PUBLISH_INSTRUCTIONS.md` - Can keep or move to docs

## Test Scripts (Can Remove or Move to tests/)

These are one-off test scripts:

- `test-api-direct.js` - Direct API testing
- `test-direct.js` - Direct testing
- `test-e2e.js` - E2E testing
- `test-full-flow.js` - Flow testing
- `test-full-flow-sdk.js` - SDK flow testing
- `test-sdk-flow.js` - SDK flow testing
- `test-sdk-prod-full.js` - Production testing
- `test-sdk-production.js` - Production testing
- `verify-production.js` - Production verification

**Recommendation**: Move to `tests/` directory or remove if no longer needed.

## Keep These Files

- `README.md` - Main documentation
- `DEPLOYMENT.md` - Deployment guide
- `SETUP.md` - Setup guide
- `PRODUCTION_STATUS.md` - Production status (useful reference)
- `TESTING.md` - Testing documentation

## Files to Never Commit

These should be in `.gitignore` (already are):

- `relayer-keypair.json` - Relayer wallet keypair
- `*.keypair.json` - Any keypair files
- `.env` - Environment variables
- `.env.local` - Local environment variables
- `secrets/` - Secrets directory
- `keys/` - Keys directory

## Cleanup Commands

```bash
# Create archive directory
mkdir -p docs/archive

# Move temporary docs
mv 3_HOUR_PLAN.md DECRYPTION_FIX_TIME.md FULL_FLOW_ANALYSIS.md \
   NATURAL_FIX.md QUICK_FIX_PLAN.md TALLY_ISSUE.md WSL_FIX.md \
   docs/archive/

# Move test scripts (or delete if not needed)
mkdir -p tests/scripts
mv test-*.js verify-production.js tests/scripts/ 2>/dev/null || true

# Clean up old files
rm -f "old relayer index.ts" "RELAYER PACKAGE LOCK.txt" keep.txt 2>/dev/null || true
```

## After Cleanup

1. Verify `.gitignore` excludes sensitive files
2. Test that relayer still works: `cd relayer && npm start`
3. Test that frontend still works: `cd frontend && npm run dev`
4. Commit changes

