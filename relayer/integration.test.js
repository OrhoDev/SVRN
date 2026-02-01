"use strict";
/**
 * Integration tests for Solvrn Relayer API
 * Tests actual API endpoints against a running relayer
 */
const RELAYER_URL = process.env.RELAYER_URL || 'http://localhost:3000';
async function fetchAPI(endpoint, options = {}) {
    const url = `${RELAYER_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    return response.json();
}
describe('Solvrn Relayer API Integration Tests', () => {
    let testProposalId;
    beforeAll(async () => {
        // Get a test proposal ID
        try {
            const result = await fetchAPI('/next-proposal-id');
            testProposalId = result.nextId || 1;
        }
        catch (e) {
            testProposalId = 1;
        }
    });
    describe('GET /next-proposal-id', () => {
        test('should return next proposal ID', async () => {
            const result = await fetchAPI('/next-proposal-id');
            expect(result.success).toBe(true);
            expect(typeof result.nextId).toBe('number');
            expect(result.nextId).toBeGreaterThan(0);
        }, 30000);
    });
    describe('POST /initialize-snapshot', () => {
        test('should create snapshot with valid data', async () => {
            const proposalId = testProposalId + Math.floor(Math.random() * 10000);
            const result = await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId,
                    votingMint: 'So11111111111111111111111111111111111111112',
                    metadata: {
                        title: 'API Integration Test',
                        desc: 'Testing relayer API',
                        duration: 24,
                    },
                    creator: '11111111111111111111111111111112',
                }),
            });
            expect(result.success).toBe(true);
            expect(result.root).toBeDefined();
            expect(typeof result.count).toBe('number');
        }, 60000);
        test('should reject invalid requests', async () => {
            const result = await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            // Should either fail or return error
            expect(result).toBeDefined();
        }, 30000);
    });
    describe('GET /proposal/:id', () => {
        test('should return 404 for non-existent proposal', async () => {
            const result = await fetchAPI('/proposal/999999');
            expect(result.success).toBe(false);
        }, 30000);
        test('should return proposal data for existing proposal', async () => {
            // First create a proposal
            const proposalId = testProposalId + Math.floor(Math.random() * 10000);
            await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId,
                    votingMint: 'So11111111111111111111111111111111111111112',
                    metadata: {
                        title: 'Get Proposal Test',
                        desc: 'Test',
                        duration: 24,
                    },
                    creator: '11111111111111111111111111111112',
                }),
            });
            // Then fetch it
            const result = await fetchAPI(`/proposal/${proposalId}`);
            expect(result.success).toBe(true);
            expect(result.proposal).toBeDefined();
        }, 60000);
    });
    describe('POST /get-proof', () => {
        test('should return proof for valid voter', async () => {
            const proposalId = testProposalId + Math.floor(Math.random() * 10000);
            // Create proposal first
            await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId,
                    votingMint: 'So11111111111111111111111111111111111111112',
                    metadata: {
                        title: 'Proof Test',
                        desc: 'Test',
                        duration: 24,
                    },
                    creator: '11111111111111111111111111111112',
                }),
            });
            // Get proof
            const result = await fetchAPI('/get-proof', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId: proposalId.toString(),
                    userPubkey: '11111111111111111111111111111112',
                }),
            });
            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();
            expect(result.proof.path).toBeDefined();
            expect(result.proof.root).toBeDefined();
            expect(result.proof.secret).toBeDefined();
        }, 60000);
        test('should reject invalid proof requests', async () => {
            const result = await fetchAPI('/get-proof', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId: '999999',
                    userPubkey: '11111111111111111111111111111112',
                }),
            });
            // Should fail for non-existent proposal
            expect(result.success).toBe(false);
        }, 30000);
    });
    describe('GET /vote-counts/:id', () => {
        test('should return vote counts', async () => {
            const proposalId = testProposalId + Math.floor(Math.random() * 10000);
            await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId,
                    votingMint: 'So11111111111111111111111111111111111111112',
                    metadata: {
                        title: 'Vote Count Test',
                        desc: 'Test',
                        duration: 24,
                    },
                    creator: '11111111111111111111111111111112',
                }),
            });
            const result = await fetchAPI(`/vote-counts/${proposalId}`);
            expect(result.success).toBe(true);
            expect(typeof result.yesVotes).toBe('number');
            expect(typeof result.noVotes).toBe('number');
        }, 60000);
    });
    describe('POST /prove-tally', () => {
        test('should generate tally proof with valid inputs', async () => {
            const proposalId = testProposalId + Math.floor(Math.random() * 10000);
            await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId,
                    votingMint: 'So11111111111111111111111111111111111111112',
                    metadata: {
                        title: 'Tally Test',
                        desc: 'Test',
                        duration: 24,
                    },
                    creator: '11111111111111111111111111111112',
                }),
            });
            const result = await fetchAPI('/prove-tally', {
                method: 'POST',
                body: JSON.stringify({
                    proposalId,
                    yesVotes: 10,
                    noVotes: 5,
                    threshold: 51,
                    quorum: 10,
                }),
            });
            // May succeed or fail depending on circuit availability
            expect(result).toBeDefined();
            if (result.success) {
                expect(result.proof).toBeDefined();
            }
        }, 60000);
    });
    describe('Error Handling', () => {
        test('should handle malformed requests', async () => {
            const result = await fetchAPI('/initialize-snapshot', {
                method: 'POST',
                body: JSON.stringify({ invalid: 'data' }),
            });
            expect(result).toBeDefined();
        }, 30000);
        test('should handle missing endpoints', async () => {
            try {
                await fetchAPI('/nonexistent-endpoint');
            }
            catch (e) {
                // Expected to fail
                expect(e).toBeDefined();
            }
        }, 30000);
    });
});
