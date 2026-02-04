import { SolvrnClient } from './sdk/dist/index.js';

// Test SDK with baked-in authentication
const solvrn = new SolvrnClient(
    'http://localhost:3000',
    'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS',  // Arcium Program ID
    'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv',   // SOLVRN Program ID
    'dev-key-123'  // API Key (baked-in)
);

console.log('Testing SDK authentication...');

// Test public endpoint (should work)
try {
    const proposals = await solvrn.api.getAllProposals();
    console.log('✅ Public endpoints work:', proposals.success);
} catch (error) {
    console.log('❌ Public endpoint error:', error.message);
}

// Test protected endpoint (should work with API key)
try {
    const result = await solvrn.api.getProof(1, '11111111111111111111111111112');
    console.log('✅ Protected endpoint with API key works:', result.success);
} catch (error) {
    console.log('❌ Protected endpoint error:', error.message);
}

console.log('SDK authentication test complete!');
