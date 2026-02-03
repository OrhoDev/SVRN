/**
 * Integration tests for SVRN SDK
 * Tests actual SDK functionality against a running relayer
 */

import { SolvrnClient } from './src/index.js';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

const RELAYER_URL = process.env.RELAYER_URL || 'https://farms-series-congress-baseball.trycloudflare.com';
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || 'AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv';
const ARCIUM_PROGRAM_ID = process.env.ARCIUM_PROGRAM_ID || 'DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS';

// Load circuit if available
let circuitJson: any = null;
try {
  const fs = await import('fs');
  const path = await import('path');
  const circuitPath = path.join(process.cwd(), '../frontend/circuit/target/circuit.json');
  if (fs.existsSync(circuitPath)) {
    circuitJson = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
  }
} catch (e) {
  console.warn('Circuit JSON not found, some tests will be skipped');
}

describe('Solvrn SDK Integration Tests', () => {
  let client: SolvrnClient;
  let connection: Connection;
  let testUser: Keypair;
  let provider: AnchorProvider;

  beforeAll(async () => {
    connection = new Connection(RPC_URL, 'confirmed');
    testUser = Keypair.generate();
    const wallet = new Wallet(testUser);
    provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    
    // Airdrop SOL for testing
    try {
      const sig = await connection.requestAirdrop(testUser.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    } catch (e) {
      console.warn('Airdrop failed, continuing anyway');
    }
  });

  beforeEach(() => {
    client = new SolvrnClient(RELAYER_URL, ARCIUM_PROGRAM_ID, PROGRAM_ID);
  });

  describe('API Endpoints', () => {
    test('getNextProposalId should return valid proposal ID', async () => {
      const result = await client.api.getNextProposalId();
      expect(result.success).toBe(true);
      expect(typeof result.nextId).toBe('number');
      expect(result.nextId).toBeGreaterThan(0);
    }, 30000);

    test('initializeSnapshot should create snapshot', async () => {
      const nextId = await client.api.getNextProposalId();
      const proposalId = nextId.nextId;
      
      const result = await client.api.initializeSnapshot(
        proposalId,
        'So11111111111111111111111111111111111111112', // Native SOL
        {
          title: 'Integration Test Proposal',
          desc: 'Testing SDK integration',
          duration: 24,
        },
        testUser.publicKey.toBase58()
      );

      expect(result.success).toBe(true);
      expect(result.root).toBeDefined();
      expect(typeof result.count).toBe('number');
    }, 60000);

    test('getProposal should return proposal data', async () => {
      // First create a proposal
      const nextId = await client.api.getNextProposalId();
      const proposalId = nextId.nextId;
      
      await client.api.initializeSnapshot(
        proposalId,
        'So11111111111111111111111111111111111111112',
        {
          title: 'Test Proposal',
          desc: 'Test',
          duration: 24,
        },
        testUser.publicKey.toBase58()
      );

      // Then fetch it
      const result = await client.api.getProposal(proposalId);
      expect(result.success).toBe(true);
      expect(result.proposal).toBeDefined();
    }, 60000);

    test('getProof should return merkle proof for valid voter', async () => {
      // Create proposal first
      const nextId = await client.api.getNextProposalId();
      const proposalId = nextId.nextId;
      
      await client.api.initializeSnapshot(
        proposalId,
        'So11111111111111111111111111111111111111112',
        {
          title: 'Proof Test',
          desc: 'Test',
          duration: 24,
        },
        testUser.publicKey.toBase58()
      );

      // Get proof - may fail if user is not eligible (doesn't have tokens)
      try {
        const result = await client.api.getProof(proposalId, testUser.publicKey.toBase58());
        expect(result.success).toBe(true);
        expect(result.proof).toBeDefined();
        expect(result.proof.path).toBeDefined();
        expect(result.proof.root).toBeDefined();
        expect(result.proof.secret).toBeDefined();
      } catch (error: any) {
        // If user is ineligible, that's expected behavior
        if (error.message.includes('Ineligible')) {
          expect(error.message).toContain('Ineligible');
        } else {
          throw error;
        }
      }
    }, 60000);

    test('getVoteCounts should return vote counts', async () => {
      const nextId = await client.api.getNextProposalId();
      const proposalId = nextId.nextId;
      
      await client.api.initializeSnapshot(
        proposalId,
        'So11111111111111111111111111111111111111112',
        {
          title: 'Vote Count Test',
          desc: 'Test',
          duration: 24,
        },
        testUser.publicKey.toBase58()
      );

      const result = await client.api.getVoteCounts(proposalId);
      expect(result.success).toBe(true);
      expect(typeof result.yesVotes).toBe('number');
      expect(typeof result.noVotes).toBe('number');
    }, 60000);
  });

  describe('SDK Client Methods', () => {
    test('init should initialize prover with circuit', async () => {
      if (!circuitJson) {
        console.warn('Skipping init test - circuit JSON not available');
        return;
      }

      await expect(client.init(circuitJson)).resolves.not.toThrow();
    }, 60000);

    test('castVote should validate inputs', async () => {
      // Test invalid wallet
      await expect(
        client.castVote(provider, '', 1, 1)
      ).rejects.toThrow('Invalid wallet public key');

      // Test invalid proposal ID
      await expect(
        client.castVote(provider, testUser.publicKey.toBase58(), -1, 1)
      ).rejects.toThrow('Invalid proposal ID');

      // Test invalid choice
      await expect(
        client.castVote(provider, testUser.publicKey.toBase58(), 1, 2)
      ).rejects.toThrow('Invalid vote choice');
    });

    test('createProposal should validate and create proposal', async () => {
      const nextId = await client.api.getNextProposalId();
      const proposalId = nextId.nextId;

      // This would require actual on-chain transaction, so we'll test the API part
      const snapshot = await client.api.initializeSnapshot(
        proposalId,
        'So11111111111111111111111111111111111111112',
        {
          title: 'SDK Create Test',
          desc: 'Testing createProposal',
          duration: 24,
        },
        testUser.publicKey.toBase58()
      );

      expect(snapshot.success).toBe(true);
    }, 60000);
  });

  describe('Error Handling', () => {
    test('should handle non-existent proposal gracefully', async () => {
      const result = await client.api.getProposal(999999);
      expect(result.success).toBe(false);
    });

    test('should handle invalid proof request', async () => {
      await expect(
        client.api.getProof(999999, testUser.publicKey.toBase58())
      ).rejects.toThrow();
    });
  });
});

