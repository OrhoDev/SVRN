import { useState, useMemo, useEffect, useRef } from 'react';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey } from '@solana/web3.js';

// ⚠️ FIX: Import Merkle helpers
import { getVotingPower, getWalletSecret } from './utils/chainUtils';
import { buildEligibilityTree, getMerkleProof } from './utils/merkleTree';
import { encryptVote } from './utils/arciumAdapter';
// ⚠️ FIX: Aliased Terminal to TerminalIcon
import { Terminal as TerminalIcon, Lock, Activity, Zap, Shield, Cpu, Layers, Disc, CheckCircle2 } from 'lucide-react';
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import idl from './idl.json';
import './index.css';

// --- CONFIGURATION ---
const RAW_ID = "Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU";
let PROGRAM_ID;
try { PROGRAM_ID = new PublicKey(RAW_ID.trim()); } catch (e) { console.error("ID_ERROR"); }

// SPL CONSTANTS
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const WRAPPED_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// --- ZK IMPORTS ---
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import initNoirC from '@noir-lang/noirc_abi';
import initACVM from '@noir-lang/acvm_js';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import circuit from '../circuit/target/circuit.json';

// --- UTILS ---
const hexToBytes = (hex) => {
    let cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (cleanHex.length % 2 !== 0) cleanHex = "0" + cleanHex;
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }
    return bytes;
};

// FIELD MODULUS (For BigInt reduction if needed)
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const reduceModField = (value) => {
    const bigValue = typeof value === 'bigint' ? value : BigInt(value);
    return bigValue % FIELD_MODULUS;
};

// --- WASM INIT HELPER ---
async function initZKStack() {
    await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
    const noir = new Noir(circuit);
    const barretenbergAPI = await Barretenberg.new();
    const backend = new UltraHonkBackend(circuit.bytecode, barretenbergAPI);
    return { noir, backend, barretenbergApi: barretenbergAPI };
}

const Dashboard = () => {
    const { connection } = useConnection();
    const { publicKey, signMessage } = useWallet(); 
    const anchorWallet = useAnchorWallet();
    
    // State
    const [proposalId, setProposalId] = useState(1);
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [statusText, setStatusText] = useState("SYSTEM_IDLE");
    const [progress, setProgress] = useState(0); 
    const [zkEngine, setZkEngine] = useState(null); 
    const [liveVoteCount, setLiveVoteCount] = useState(0);
    const [merkleTree, setMerkleTree] = useState(null); 
    
    // ⚠️ NEW: Token Choice State
    const [votingMint, setVotingMint] = useState(WRAPPED_SOL_MINT.toBase58()); 
    const [payoutMint, setPayoutMint] = useState(WRAPPED_SOL_MINT.toBase58());
    const [payoutAmount, setPayoutAmount] = useState(0.1);
    const [targetWallet, setTargetWallet] = useState(""); 

    const bottomRef = useRef(null);

    const addLog = (msg, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour12: false, second:'2-digit', minute:'2-digit' });
        setLogs(p => [...p, { time, text: msg, type }]);
    };

    useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

    useEffect(() => {
        initZKStack().then((engine) => {
            setZkEngine(engine);
            addLog("KERNEL_INIT :: WASM MODULES LOADED", 'success');
        }).catch(err => addLog("KERNEL_FAIL :: " + err.message, 'error'));
    }, []);

    // Poll Chain Data
    useEffect(() => {
        if (!publicKey || !anchorWallet) {
            setLiveVoteCount(0); 
            return;
        }

        const fetchChainData = async () => {
            try {
                const provider = new AnchorProvider(connection, anchorWallet, { preflightCommitment: 'processed' });
                const program = new Program(idl, provider);
                
                // ⚠️ FIX: Use 'proposal_v2' seed
                const [proposalPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)],
                    PROGRAM_ID
                );
                
                const account = await program.account.proposal.fetch(proposalPda);
                setLiveVoteCount(account.voteCount.toNumber());
            } catch (e) {
                setLiveVoteCount(0);
            }
        };

        fetchChainData(); 
        const interval = setInterval(fetchChainData, 5000); 
        return () => clearInterval(interval);
    }, [proposalId, publicKey?.toBase58(), connection, anchorWallet]);

    const handleCreateProposal = async () => {
        if (!publicKey || !anchorWallet) return addLog("AUTH_ERR :: CONNECT_WALLET", 'error');
        if (!zkEngine) return addLog("SYS_WAIT :: LOADING_KERNEL", 'info');
        
        setIsLoading(true);
        setStatusText("BUILDING_MERKLE_TREE");
        setProgress(10);
        try {
            const provider = new AnchorProvider(connection, anchorWallet, { preflightCommitment: 'confirmed' });
            const program = new Program(idl, provider);
            
            const PROPOSAL_ID_BN = new BN(proposalId);
            const VOTING_MINT_PK = new PublicKey(votingMint);
            const PAYOUT_MINT_PK = new PublicKey(payoutMint);
            const RECIPIENT_PK = new PublicKey(targetWallet || publicKey.toBase58());
            const AMOUNT_BN = new BN(payoutAmount * 1_000_000_000); // Decimals assumption (9)

            // ⚠️ FIX: 'proposal_v2' seed
            const [proposalPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("proposal_v2"), PROPOSAL_ID_BN.toArrayLike(Buffer, "le", 8)],
                PROGRAM_ID
            );

            // 1. Build Merkle Tree (Snapshot)
            addLog("MERKLE :: SNAPSHOTTING_ELIGIBILITY", 'info');
            const userSecret = await getWalletSecret({ signMessage, publicKey }, proposalId);
            const userBalance = await getVotingPower(connection, publicKey, VOTING_MINT_PK);
            
            // Build tree using helper
            const treeData = await buildEligibilityTree(
                [{ userSecret, balance: userBalance }], 
                zkEngine.barretenbergApi
            );
            setMerkleTree(treeData);
            
            // Convert root
            const rootBigInt = reduceModField(treeData.root);
            const merkleRootBytes = new Uint8Array(32);
            let rootHex = rootBigInt.toString(16);
            if (rootHex.length > 64) rootHex = rootHex.slice(-64);
            else rootHex = rootHex.padStart(64, '0');
            for (let i = 0; i < 32; i++) {
                merkleRootBytes[i] = parseInt(rootHex.slice(i * 2, i * 2 + 2), 16);
            }
            
            addLog(`GOV::INIT_NODE >> ID: ${proposalId}, Root: ${treeData.root.toString().slice(0, 10)}...`, 'info');
            setProgress(50);

            // ⚠️ NEW: Find ATA for Proposal Treasury
            const [proposalTokenAccount] = PublicKey.findProgramAddressSync(
                [
                    proposalPda.toBuffer(),
                    TOKEN_PROGRAM_ID.toBuffer(),
                    PAYOUT_MINT_PK.toBuffer()
                ],
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            addLog("DAO::INIT >> CREATING_TREASURY_VAULT", 'info');

            // 2. Send Transaction
            const tx = await program.methods
            .initializeProposal(
                PROPOSAL_ID_BN, 
                Array.from(merkleRootBytes),
                AMOUNT_BN
            )
            .accounts({
                proposal: proposalPda,
                proposalTokenAccount: proposalTokenAccount, // Auto-init ATA
                votingMint: VOTING_MINT_PK,
                treasuryMint: PAYOUT_MINT_PK,
                targetWallet: RECIPIENT_PK,
                authority: publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: web3.SystemProgram.programId,
            })
            .rpc();

            addLog(`GOV_SUCCESS :: PROPOSAL #${proposalId} LIVE`, 'success');
            setProgress(100);
        } catch (err) {
            if (err.message.includes("already in use")) {
                addLog(`GOV_INFO :: PROPOSAL #${proposalId} ACTIVE`, 'info');
                setProgress(100);
            } else {
                addLog(`GOV_ERR :: ${err.message}`, 'error');
                setProgress(0);
            }
        } finally {
            setIsLoading(false);
            setTimeout(() => { setStatusText("SYSTEM_IDLE"); setProgress(0); }, 2000);
        }
    };

    const handleVote = async (choice) => {
        if (!publicKey) return addLog("AUTH_ERR :: CONNECT_WALLET", 'error');
        if (!zkEngine) return addLog("SYS_WAIT :: LOADING_KERNEL", 'info');
        
        setIsLoading(true);
        setStatusText("ZK_PROVING");
        setProgress(10);

        try {
            // Step 1: Fetch voting power and proposal info
            addLog("CHAIN::SCAN >> FETCHING_ELIGIBILITY", 'info');
            
            let votingMint = WRAPPED_SOL_MINT; 
            let merkleRoot = "0"; 

            try {
                const provider = new AnchorProvider(connection, anchorWallet, { preflightCommitment: 'processed' });
                const program = new Program(idl, provider);
                
                // ⚠️ FIX: 'proposal_v2' seed
                const [proposalPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)],
                    PROGRAM_ID
                );

                const proposalAccount = await program.account.proposal.fetch(proposalPda);
                if (proposalAccount.votingMint) {
                    votingMint = proposalAccount.votingMint;
                }
                if (proposalAccount.merkleRoot) {
                    const rootBytes = Buffer.from(proposalAccount.merkleRoot);
                    const rootHex = rootBytes.toString('hex');
                    merkleRoot = BigInt('0x' + rootHex).toString();
                }
            } catch (e) {
                addLog("GOV_WARN :: Unable to fetch proposal config, using defaults", 'info');
            }
            
            const realBalance = await getVotingPower(connection, publicKey, votingMint); 
            if (realBalance < 1) throw new Error("INSUFFICIENT_STAKE (Balance: " + realBalance + ")");
            
            addLog(`STAKE::VERIFIED >> ${realBalance} credits`, 'success');

            // Step 2: Derive ZK secret and generate Merkle proof
            setStatusText("MPC_ENCRYPTING");
            setProgress(30);
            const userSecret = await getWalletSecret({ signMessage, publicKey }, proposalId); 
            
            if (!merkleTree) {
                throw new Error("Merkle tree not initialized locally (Demo mode). Create proposal first.");
           }

            const merkleProof = await getMerkleProof(
                userSecret, 
                realBalance, 
                [{userSecret, balance: realBalance}], 
                0,
                zkEngine.barretenbergApi 
            );
            
            addLog("MERKLE::PROOF_GENERATED", 'success');

            // Step 3: Generate ZK proof with Merkle inclusion
            setStatusText("ZK_PROVING");
            setProgress(50);
            
            const inputs = {
                user_secret: reduceModField(userSecret).toString(),
                balance: Number(realBalance),
                merkle_path: merkleProof.path.map(p => reduceModField(BigInt(p)).toString()),
                merkle_index: merkleProof.index.toString(),
                merkle_root: reduceModField(BigInt(merkleProof.root)).toString(),
                proposal_id: reduceModField(proposalId).toString(),
                cost: 1
            };
            
            addLog("ZK::EXECUTE >> GENERATING_SNARK_PROOF", 'info');
            const { witness } = await zkEngine.noir.execute(inputs);
            const proof = await zkEngine.backend.generateProof(witness);
            addLog("ZK::SUCCESS >> PROOF_GENERATED", 'success');

            // Step 4: Encrypt vote with Arcium
            setStatusText("MPC_ENCRYPTING");
            setProgress(75);
            const arciumProvider = new AnchorProvider(connection, anchorWallet, { preflightCommitment: 'confirmed' });
            const encrypted = await encryptVote(arciumProvider, choice, realBalance);
            addLog("MPC::ENCRYPT >> ARCIUM_RESCUE_CIPHER", 'success');
            
            // Step 5: Relay to chain
            setStatusText("RELAY_DISPATCH");
            setProgress(90);
            const nullifierHex = proof.publicInputs[proof.publicInputs.length - 1];
            const payload = {
                proof: Array.from(proof.proof),
                nullifier: hexToBytes(nullifierHex),
                ciphertext: Array.from(encrypted.ciphertext),
                pubkey: encrypted.public_key,
                nonce: encrypted.nonce,
                proposalId: proposalId 
            };

            addLog("RELAY::DISPATCH >> ANONYMOUS_ROUTING", 'info');
            const response = await fetch('http://localhost:3000/relay-vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error);
            
            addLog(`RELAY::SUCCESS >> TX: ${result.tx.slice(0, 8)}...`, 'success');
            addLog(`VOTE::CONFIRMED >> PRIVACY_PRESERVED`, 'success');
            setStatusText("VOTE_CONFIRMED");
            setProgress(100);

        } catch (err) {
            addLog(`FATAL :: ${err.message}`, 'error');
            setStatusText("OPERATION_FAILED");
            setProgress(0);
        } finally {
            setIsLoading(false);
            setTimeout(() => { 
                if (progress === 100) setStatusText("SYSTEM_IDLE"); 
                setProgress(0);
            }, 3000);
        }
    };

    return (
        <div className="dashboard-grid">
            <div className="scanlines"></div>
            
            {/* --- HEADER --- */}
            <div className="grid-cell" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', padding: '0 2rem', borderBottom: '1px solid #222', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    <Shield size={20} color="var(--accent)" />
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-1px', margin: 0 }}>SVRN<span style={{ color: 'var(--accent)' }}>.IO</span></h1>
                    </div>
                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.75rem', color: '#666' }}>
                    <span style={{display:'flex', gap:5, alignItems:'center'}}><Activity size={12}/> ZK-ROLLUP: ONLINE</span>
                    <span style={{display:'flex', gap:5, alignItems:'center'}}><Cpu size={12}/> MPC-CLUSTER: ACTIVE</span>
                    <span style={{display:'flex', gap:5, alignItems:'center'}}><Layers size={12}/> DEVNET: 284ms</span>
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                     <div className="svrn-wallet-container" style={{border: '1px solid #333'}}>
                        <WalletMultiButton />
                    </div>
                </div>
            </div>

            {/* --- LEFT: CONFIG & TELEMETRY --- */}
            <div className="grid-cell" style={{ borderRight: '1px solid #222', padding: '2rem', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ color: '#888', fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '2px', textTransform: 'uppercase' }}>CONFIGURATION</h3>
                    
                    {/* INPUTS */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label className="retro-label">PROPOSAL_ID</label>
                            <input 
                            className="retro-input" 
                                type="number" 
                                value={proposalId}
                                onChange={(e) => setProposalId(Number(e.target.value))}
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label className="retro-label">VOTING_TOKEN_MINT</label>
                        <input 
                            className="retro-input" 
                            value={votingMint}
                            onChange={(e) => setVotingMint(e.target.value)}
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label className="retro-label">PAYOUT_TOKEN_MINT</label>
                        <input 
                            className="retro-input" 
                            value={payoutMint}
                            onChange={(e) => setPayoutMint(e.target.value)}
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label className="retro-label">PAYOUT_AMOUNT</label>
                        <input 
                            className="retro-input" 
                            type="number"
                            value={payoutAmount}
                            onChange={(e) => setPayoutAmount(Number(e.target.value))}
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label className="retro-label">RECIPIENT_ADDRESS</label>
                        <input 
                            className="retro-input" 
                            value={targetWallet}
                            onChange={(e) => setTargetWallet(e.target.value)}
                            placeholder={publicKey ? publicKey.toBase58() : "Wallet Address"}
                        />
                    </div>

                    <button onClick={handleCreateProposal} disabled={isLoading} className="retro-btn" style={{ width: '100%', padding: '1rem', fontFamily: 'monospace', fontSize: '0.75rem', letterSpacing: '1px' }}>
                        INITIALIZE NODE
                    </button>
                </div>

                {/* TELEMETRY SECTION */}
                <div style={{ marginBottom: '2rem', padding: '1rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: '4px' }}>
                    <h3 style={{ color: '#888', fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '2px', textTransform: 'uppercase' }}>TELEMETRY</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'monospace' }}>BALLOT_COUNT</span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 'bold' }}>{liveVoteCount}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'monospace' }}>PROPOSAL_ID</span>
                            <span style={{ fontSize: '0.9rem', color: '#888', fontFamily: 'monospace' }}>#{proposalId}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'monospace' }}>STATUS</span>
                            <span style={{ fontSize: '0.7rem', color: isLoading ? 'var(--accent)' : '#555', fontFamily: 'monospace' }}>{statusText}</span>
                        </div>
                    </div>
                </div>

                {/* PIPELINE VISUALIZER */}
                <div style={{ marginTop: 'auto' }}>
                    <h3 style={{ color: '#888', fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '2px', textTransform: 'uppercase' }}>PIPELINE</h3>
                    <div style={{ fontSize: '0.7rem', color: isLoading ? 'var(--accent)' : '#444', fontFamily: 'monospace', marginBottom: '0.5rem', minHeight: '1.2rem' }}>
                        {statusText}
                    </div>
                    <div className="status-track" style={{ position: 'relative', height: '4px', background: '#111', borderRadius: '2px', overflow: 'hidden' }}>
                        <div 
                            className="status-fill" 
                            style={{ 
                                width: `${progress}%`, 
                                height: '100%', 
                                background: 'linear-gradient(90deg, var(--accent) 0%, #a855f7 100%)',
                                transition: 'width 0.3s ease',
                                boxShadow: progress > 0 ? '0 0 10px var(--accent)' : 'none'
                            }}
                        />
                    </div>
                    {isLoading && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: '#555', fontFamily: 'monospace', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ 
                                display: 'inline-block',
                                width: '6px',
                                height: '6px',
                                background: 'var(--accent)',
                                borderRadius: '50%',
                                animation: 'pulse 1.5s ease-in-out infinite'
                            }}></span>
                            PROCESSING
                        </div>
                    )}
                </div>
            </div>

            {/* --- CENTER: ACTION MODULE --- */}
            <div className="grid-cell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #0a0a0a 0%, #000 100%)', position: 'relative', overflow: 'hidden' }}>
                {/* Background accent */}
                <div style={{ 
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '400px',
                    height: '400px',
                    background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }}></div>
                
                <div style={{ textAlign: 'center', marginBottom: '4rem', position: 'relative', zIndex: 1 }}>
                    <h2 style={{ fontSize: '4rem', margin: 0, fontWeight: 900, letterSpacing: '-3px', fontFamily: 'monospace', background: 'linear-gradient(180deg, #fff 0%, var(--accent) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        PROPOSAL #{proposalId}
                    </h2>
                    <p style={{ color: '#666', marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
                        PRIVACY GOVERNANCE ENGINE
                    </p>
                    <div style={{ marginTop: '1.5rem', background: 'linear-gradient(90deg, transparent 0%, #111 50%, transparent 100%)', padding: '8px 24px', display: 'inline-block', border: '1px solid #222', borderRadius: '4px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#888', fontFamily: 'monospace', letterSpacing: '1px' }}>
                            BALLOTS: <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{liveVoteCount}</span>
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '2rem', width: '100%', maxWidth: '700px', position: 'relative', zIndex: 1 }}>
                        <button 
                            onClick={() => handleVote(1)} 
                            disabled={isLoading}
                        className="retro-btn primary" 
                        style={{ 
                            flex: 1, 
                            padding: '2.5rem', 
                            fontSize: '1rem', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '12px', 
                            alignItems: 'center',
                            fontFamily: 'monospace',
                            letterSpacing: '1px',
                            background: isLoading ? '#111' : 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 100%)',
                            border: '1px solid',
                            borderColor: isLoading ? '#333' : 'var(--accent)',
                            boxShadow: isLoading ? 'none' : '0 0 20px rgba(168, 85, 247, 0.3)',
                            transition: 'all 0.3s ease'
                        }}
                        >
                        <Zap size={36} style={{ color: 'var(--accent)' }} />
                        AFFIRMATIVE
                        </button>
                        <button 
                            onClick={() => handleVote(0)} 
                            disabled={isLoading}
                        className="retro-btn" 
                        style={{ 
                            flex: 1, 
                            padding: '2.5rem', 
                            fontSize: '1rem', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '12px', 
                            alignItems: 'center',
                            fontFamily: 'monospace',
                            letterSpacing: '1px',
                            background: '#111',
                            border: '1px solid #333',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        <Disc size={36} style={{ color: '#666' }} />
                            NEGATIVE
                        </button>
                </div>
                    </div>

            {/* --- RIGHT: KERNEL LOGS --- */}
            <div className="grid-cell" style={{ borderLeft: '1px solid #222', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#888', fontFamily: 'monospace', letterSpacing: '2px', textTransform: 'uppercase' }}>KERNEL_FEED</span>
                    <TerminalIcon size={14} color="#666" />
                        </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }} className="log-stream">
                    {logs.length === 0 ? (
                        <div style={{ color: '#333', padding: '2rem', textAlign: 'center', fontStyle: 'italic' }}>
                            AWAITING_INPUT
                        </div>
                    ) : (
                        logs.map((l, i) => (
                            <div 
                                key={i} 
                                className={`log-line ${l.type}`}
                                style={{
                                    padding: '0.5rem',
                                    marginBottom: '2px',
                                    borderLeft: `2px solid ${l.type === 'success' ? 'var(--accent)' : l.type === 'error' ? '#ff4444' : '#444'}`,
                                    background: l.type === 'success' ? 'rgba(168, 85, 247, 0.05)' : l.type === 'error' ? 'rgba(255, 68, 68, 0.05)' : 'transparent'
                                }}
                            >
                                <span style={{ opacity: 0.5, marginRight: '8px', color: '#555' }}>[{l.time}]</span>
                                <span style={{ color: l.type === 'success' ? 'var(--accent)' : l.type === 'error' ? '#ff6666' : '#ccc' }}>
                                    {l.text}
                                </span>
                    </div>
                        ))
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* --- FOOTER --- */}
            <div className="grid-cell" style={{ gridColumn: '1 / -1', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 2rem', fontSize: '0.7rem', color: '#444', justifyContent: 'space-between' }}>
                <span>ID: {PROGRAM_ID?.toString()}</span>
                <span>SECURED BY NOIR + ARCIUM</span>
            </div>

        </div>
    );
};

export default function App() {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => import.meta.env.VITE_HELIUS_RPC_URL || clusterApiUrl(network), [network]);
    const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider><Dashboard /></WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}