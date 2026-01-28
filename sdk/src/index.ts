import { SvrnApi, ProposalMetadata } from './api.js';
import { SvrnProver } from './prover.js';
import { SvrnEncryption } from './encryption.js';
import { getWalletSecret } from './utils.js';
// CHANGE 1: Remove BN and web3 from this import
import { AnchorProvider, Program } from '@coral-xyz/anchor';
// CHANGE 2: Import BN directly
import BN from 'bn.js';
// CHANGE 3: Import SystemProgram and LAMPORTS_PER_SOL directly
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import idl from './idl.json' with { type: 'json' };
import { hexToBytes } from './utils.js';

// These should be configured or passed in if they can change
const PROGRAM_ID = new PublicKey("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export class SvrnClient {
    public api: SvrnApi;
    public prover: SvrnProver;
    public encryption: SvrnEncryption;

    constructor(relayerUrl: string, arciumProgramId?: string) {
        this.api = new SvrnApi(relayerUrl);
        this.prover = new SvrnProver();
        this.encryption = new SvrnEncryption(arciumProgramId);
    }

    public async init(circuitJson: any) {
        await this.prover.init(circuitJson);
    }

    // --- NEW: HIGH-LEVEL PROPOSAL CREATION ---
    public async createProposal(
        provider: AnchorProvider,
        authorityPubkey: PublicKey,
        votingMint: string,
        metadata: ProposalMetadata,
        gasBufferSol: number
    ) {
        // 1. Ask Relayer for the next available ID
        const { nextId, success } = await this.api.getNextProposalId();
        if (!success) throw new Error("Failed to get next proposal ID from relayer.");
        const proposalId = nextId;

        // 2. Initialize Snapshot (Relayer saves metadata)
        const snap = await this.api.initializeSnapshot(proposalId, votingMint, metadata);
        if (!snap.success) throw new Error(snap.error || "Snapshot failed.");

        // 3. Build On-Chain TX (Anchor/Solana Logic)
        const program = new Program(idl as any, provider);
        const [pda] = PublicKey.findProgramAddressSync([Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
        const [vault] = PublicKey.findProgramAddressSync([pda.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), new PublicKey(votingMint).toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
        
        // CHANGE 4: web3.SystemProgram becomes simply SystemProgram (imported above)
        const tx = await program.methods.initializeProposal(new BN(proposalId), hexToBytes(snap.root), new BN(1000))
            .accounts({ 
                proposal: pda, 
                proposalTokenAccount: vault, 
                authority: authorityPubkey, 
                votingMint: new PublicKey(votingMint), 
                treasuryMint: new PublicKey(votingMint),
                targetWallet: authorityPubkey,
                tokenProgram: TOKEN_2022_PROGRAM_ID, 
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, 
                systemProgram: SystemProgram.programId 
            })
            .transaction();
        
        // 4. Add Fee Transfer
        // CHANGE 5: Updated to use direct imports
        const feeTransfer = SystemProgram.transfer({
            fromPubkey: authorityPubkey,
            toPubkey: pda,
            lamports: gasBufferSol * LAMPORTS_PER_SOL
        });
        tx.add(feeTransfer);

        // 5. Finalize and Send
        const { blockhash } = await provider.connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = authorityPubkey;

        const signedTx = await provider.wallet.signTransaction(tx);
        const txid = await provider.connection.sendRawTransaction(signedTx.serialize());
        await provider.connection.confirmTransaction(txid);

        return { proposalId, txid };
    }


    public async castVote(
        provider: AnchorProvider,
        walletPubkey: string,
        proposalId: number,
        choice: number
    ) {
        const proofData = await this.api.getProof(proposalId, walletPubkey);
        
        // Use the secret from the relayer (already in the merkle tree), NOT a derived one
        const relayerSecret = proofData.proof.secret;

        const zkProof = await this.prover.generateVoteProof(relayerSecret, proofData, proposalId);

        const weight = Number(proofData.proof.weight);
        const encrypted = await this.encryption.encryptVote(provider, choice, weight);
        const nullifier = zkProof.publicInputs[zkProof.publicInputs.length - 1];
        
        // The API call returns the relayer's response which should include the tx signature
        const relayResponse = await this.api.submitVote(proposalId, nullifier, encrypted);
        return { success: relayResponse.success, tx: relayResponse.signature, error: relayResponse.error };
    }
}