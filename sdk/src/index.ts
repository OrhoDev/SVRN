import { SvrnApi, ProposalMetadata } from './api.js';
import { SvrnProver } from './prover.js';
import { SvrnEncryption } from './encryption.js';
import { getWalletSecret } from './utils.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import idl from './idl.json' with { type: 'json' };
import { hexToBytes } from './utils.js';

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv");
// LEGACY TOKEN PROGRAM
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
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

  public async createProposal(
        provider: AnchorProvider,
        authorityPubkey: PublicKey,
        votingMint: string,
        metadata: ProposalMetadata,
        gasBufferSol: number,
        proposalIdOverride?: number
    ) {
        let proposalId = proposalIdOverride;
        if (!proposalId) {
             const { nextId, success } = await this.api.getNextProposalId();
             if (!success) throw new Error("Failed to get ID");
             proposalId = nextId;
        }

        // --- UPDATED: Pass Authority Pubkey ---
        const snap = await this.api.initializeSnapshot(
            proposalId, 
            votingMint, 
            metadata,
            authorityPubkey.toBase58() // <--- Force Creator into Snapshot
        );
        
        if (!snap.success) throw new Error(snap.error || "Snapshot failed.");

        // 2. Build On-Chain TX
        const program = new Program(idl as any, provider) as any;
        console.log("SDK CALLING PROGRAM ID:", program.programId.toBase58());
        
        // PROPOSAL PDA (Synced Seed: svrn_v5)
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("svrn_v5"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], 
            PROGRAM_ID
        );
        
        // VAULT PDA (Strict Legacy)
        const [vault] = PublicKey.findProgramAddressSync(
            [
                pda.toBuffer(), 
                TOKEN_PROGRAM_ID.toBuffer(), // Legacy
                new PublicKey(votingMint).toBuffer()
            ], 
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        const tx = await (program.methods as any).initializeProposal(new BN(proposalId), hexToBytes(snap.root), new BN(1000))
            .accounts({ 
                proposal: pda, 
                proposalTokenAccount: vault, 
                authority: authorityPubkey, 
                votingMint: new PublicKey(votingMint), 
                treasuryMint: new PublicKey(votingMint),
                targetWallet: authorityPubkey,
                tokenProgram: TOKEN_PROGRAM_ID, // Strict Legacy
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,  
                systemProgram: SystemProgram.programId 
            })
            .transaction();
        
        tx.add(SystemProgram.transfer({
            fromPubkey: authorityPubkey,
            toPubkey: pda,
            lamports: gasBufferSol * LAMPORTS_PER_SOL
        }));

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
        const relayerSecret = proofData.proof.secret;
        const zkProof = await this.prover.generateVoteProof(relayerSecret, proofData, proposalId);

        const weight = Number(proofData.proof.weight);
        const encrypted = await this.encryption.encryptVote(provider, choice, weight);
        const nullifier = zkProof.publicInputs[zkProof.publicInputs.length - 1];
        
        const relayResponse = await this.api.submitVote(proposalId, nullifier, encrypted);
        return { success: relayResponse.success, tx: relayResponse.tx, error: relayResponse.error };
    }
}