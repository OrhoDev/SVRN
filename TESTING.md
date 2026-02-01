# SVRN Testing Guide

This document describes the comprehensive test suite for the SVRN codebase.

## Test Structure

### 1. SDK Integration Tests (`sdk/integration.test.ts`)
Tests the SVRN SDK against a running relayer:
- API endpoint connectivity
- Proposal creation flow
- Vote casting flow
- Proof generation
- Error handling

**Run:** `cd sdk && npm test`

### 2. Relayer API Integration Tests (`relayer/integration.test.ts`)
Tests all relayer API endpoints directly:
- `GET /next-proposal-id` - Get next proposal ID
- `POST /initialize-snapshot` - Create voting snapshot
- `GET /proposal/:id` - Fetch proposal data
- `POST /get-proof` - Get merkle proof for voter
- `GET /vote-counts/:id` - Get vote counts
- `POST /prove-tally` - Generate tally proof
- Error handling for invalid requests

**Run:** `cd relayer && npm test`

### 3. Direct API Tests (`test-api-direct.js`)
Standalone Node.js script that tests relayer endpoints without dependencies:
- Tests all API endpoints
- Provides detailed test results
- Can be run independently

**Run:** `node test-api-direct.js`

### 4. End-to-End Flow Tests (`test-e2e.js`)
Complete flow test using the SDK:
- SDK initialization
- Proposal creation
- Voting flow
- Tally flow
- Error handling

**Run:** `npm test` (from root)

## Prerequisites

### For SDK Tests
1. Relayer must be running on `http://localhost:3000` (or set `RELAYER_URL`)
2. Circuit JSON must be available at `frontend/circuit/target/circuit.json`
3. Solana RPC endpoint accessible (default: devnet)

### For Relayer Tests
1. Relayer must be running
2. ZK backend initialized (Barretenberg)
3. Tally circuit available (`relayer/tally.json`)

### Environment Variables
```bash
RELAYER_URL=http://localhost:3000  # Relayer URL
RPC_URL=https://api.devnet.solana.com  # Solana RPC
PROGRAM_ID=AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv  # Program ID
ARCIUM_PROGRAM_ID=DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS  # Arcium Program ID
```

## Running Tests

### Quick Start
```bash
# Start relayer first
cd relayer && npm start

# In another terminal, run tests
cd sdk && npm test
cd relayer && npm test
node test-api-direct.js
```

### All Tests
```bash
# From project root
npm run test:all
```

### Individual Test Suites
```bash
npm run test:sdk      # SDK integration tests
npm run test:relayer  # Relayer API tests
npm run test:api      # Direct API tests (node test-api-direct.js)
```

## Test Coverage

### SDK Tests Cover:
- ✅ `SvrnClient` initialization
- ✅ `SvrnApi` all methods
- ✅ `SvrnProver` proof generation
- ✅ `SvrnEncryption` vote encryption
- ✅ Input validation
- ✅ Error handling

### Relayer Tests Cover:
- ✅ All REST API endpoints
- ✅ Request validation
- ✅ Response format
- ✅ Error responses
- ✅ Edge cases

### Integration Tests Cover:
- ✅ Complete proposal lifecycle
- ✅ Voting flow end-to-end
- ✅ Tally generation
- ✅ Real-world scenarios

## Expected Test Results

### With Relayer Running:
- ✅ All API endpoint tests should pass
- ✅ SDK integration tests should pass
- ⏭️ Some tests may be skipped if circuit files are missing

### Without Relayer:
- ❌ API tests will fail (expected)
- Tests will indicate relayer is not running

## Troubleshooting

### Tests Failing with "fetch failed"
- Ensure relayer is running: `cd relayer && npm start`
- Check `RELAYER_URL` environment variable

### Tests Failing with "Circuit not found"
- Compile Noir circuits: `cd frontend/circuit && nargo compile`
- Ensure `circuit.json` exists in `frontend/circuit/target/`

### Tests Failing with "ZK Backend not initialized"
- Relayer needs time to initialize Barretenberg WASM
- Wait a few seconds after starting relayer

### Tests Timing Out
- Increase timeout in test files if needed
- Check network connectivity to RPC endpoint

## Continuous Integration

Tests are designed to:
- Run in CI/CD pipelines
- Provide clear pass/fail status
- Skip gracefully when dependencies unavailable
- Report detailed error messages

## Next Steps

1. Add more edge case tests
2. Add performance benchmarks
3. Add load testing
4. Add security tests
5. Add contract interaction tests

