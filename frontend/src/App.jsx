import { useState, useMemo, useEffect, useRef } from 'react';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, PublicKey } from '@solana/web3.js';
import { getVotingPower, getWalletSecret } from './utils/chainUtils'; 
import { encryptVote } from './utils/arciumAdapter';
import { Terminal, Shield, Zap, Cpu, Activity, Disc, Layers } from 'lucide-react';
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import idl from './idl.json';
import './index.css';

const PROGRAM_ID = new PublicKey("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import initACVM from '@noir-lang/acvm_js';
import initNoirC from '@noir-lang/noirc_abi';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import circuit from '../circuit/target/circuit.json';


const hexToBytes = (hex) => {
    let cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (cleanHex.length % 2 !== 0) cleanHex = "0" + cleanHex;
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    return bytes;
};

async function initZKStack() {
    await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
    return { noir: new Noir(circuit), backend: new UltraHonkBackend(circuit.bytecode, await Barretenberg.new()) };
}

const Dashboard = () => {
    const { connection } = useConnection();
    const { publicKey, signMessage } = useWallet(); 
    const anchorWallet = useAnchorWallet();
    
    const [proposalId, setProposalId] = useState(1);
    const [votingMintStr, setVotingMintStr] = useState("47Xs3xqvyEzqXijtYxoAwpeKKskmnJ4vXdgKdJJxqrxo");
    const [logs, setLogs] = useState([]);
    const [statusText, setStatusText] = useState("SYSTEM_IDLE");
    const [progress, setProgress] = useState(0); 
    const [zkEngine, setZkEngine] = useState(null); 
    const [liveVoteCount, setLiveVoteCount] = useState(0);
    const bottomRef = useRef(null);

    const addLog = (msg, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        setLogs(p => [...p, { time, text: msg, type }]);
    };

    useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

    useEffect(() => {
        initZKStack().then(e => { setZkEngine(e); addLog("KERNEL_READY", 'success'); });
    }, []);

    // Optimized Polling
    useEffect(() => {
        if (!publicKey || !anchorWallet) return;
        const fetchCount = async () => {
            try {
                const program = new Program(idl, new AnchorProvider(connection, anchorWallet, {}));
                const [pda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], 
                    PROGRAM_ID
                );
                const acc = await program.account.proposal.fetch(pda);
                setLiveVoteCount(acc.voteCount.toNumber());
            } catch (e) { setLiveVoteCount(0); }
        };
        fetchCount();
        const intv = setInterval(fetchCount, 15000);
        return () => clearInterval(intv);
    }, [proposalId, publicKey?.toBase58()]);

    const handleCreate = async () => {
        setStatusText("SNAPSHOT_PENDING"); setProgress(20);
        try {
            addLog("RELAYER::INITIALIZE_SNAPSHOT");
            const snap = await fetch('http://localhost:3000/initialize-snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ votingMint: votingMintStr, proposalId })
            }).then(r => r.json());
    
            if (!snap.success) throw new Error(snap.error);
            setProgress(50);
    
            addLog("CHAIN::INIT_PROPOSAL");
            const program = new Program(idl, new AnchorProvider(connection, anchorWallet, {}));
            
            const [pda] = PublicKey.findProgramAddressSync(
                [Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], 
                PROGRAM_ID
            );
    
            const [vault] = PublicKey.findProgramAddressSync(
                [pda.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), new PublicKey(votingMintStr).toBuffer()],
                ASSOCIATED_TOKEN_PROGRAM_ID
            );
    
            const tx = await program.methods.initializeProposal(
                new BN(proposalId), 
                hexToBytes(snap.root), 
                new BN(1000)
            ).accounts({
                proposal: pda,
                proposalTokenAccount: vault,
                authority: publicKey,
                votingMint: new PublicKey(votingMintStr),
                treasuryMint: new PublicKey(votingMintStr),
                targetWallet: publicKey,
                tokenProgram: TOKEN_2022_PROGRAM_ID, 
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: web3.SystemProgram.programId,
            }).rpc();
            addLog(`SUCCESS::LIVE - PROP_${proposalId}`, 'success');
            setProgress(100);
        } catch (e) { 
            console.error(e);
            addLog(e.message, 'error'); 
            setProgress(0); 
        }
        finally { setStatusText("SYSTEM_IDLE"); }
    };

    const handleVote = async (choice) => {
        setStatusText("ZK_PROVING"); setProgress(10);
        try {
            addLog("RELAYER::FETCH_ORACLE_PROOF");
            const proofRes = await fetch('http://localhost:3000/get-proof', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proposalId: proposalId.toString(), userPubkey: publicKey.toBase58() })
            }).then(r => r.json());
    
            if (!proofRes.success) throw new Error(proofRes.error);
            setProgress(40);

            // 1. Prepare strictly formatted inputs for Noir
            const inputs = {
                user_secret: "0x" + proofRes.proof.secret.replace('0x', '').padStart(64, '0'), 
                balance: "0x" + BigInt(proofRes.proof.balance).toString(16).padStart(64, '0'),
                merkle_path: proofRes.proof.path, 
                merkle_index: Number(proofRes.proof.index), // Force to Number
                merkle_root: proofRes.proof.root, 
                proposal_id: "0x" + BigInt(proposalId).toString(16).padStart(64, '0')
            };
    
            addLog("ZK::GENERATING_SNARK");

            // 2. Execute Circuit
            const { witness } = await zkEngine.noir.execute(inputs);
            const proof = await zkEngine.backend.generateProof(witness);

            addLog("ZK_SUCCESS", "success");
            setProgress(70);
    
            addLog("MPC::ENCRYPT_VOTE");
            const encrypted = await encryptVote(new AnchorProvider(connection, anchorWallet, {}), choice, proofRes.proof.balance);
    
            addLog("RELAYER::SUBMITTING");
            // Nullifier is the last element in public inputs
            const nullifierHex = proof.publicInputs[proof.publicInputs.length - 1];

            const relay = await fetch('http://localhost:3000/relay-vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nullifier: hexToBytes(nullifierHex),
                    ciphertext: Array.from(encrypted.ciphertext),
                    pubkey: encrypted.public_key, nonce: encrypted.nonce, proposalId
                })
            }).then(r => r.json());
    
            if (!relay.success) throw new Error(relay.error);
            addLog("VOTE_CONFIRMED", 'success');
            setProgress(100);
        } catch (e) { 
            console.error(e);
            addLog(e.message, 'error'); 
            setProgress(0); 
        }
        finally { setStatusText("SYSTEM_IDLE"); }
    };

    return (
        <div className="dashboard-grid">
            <div className="scanlines"></div>
            <div className="grid-cell" style={{ gridColumn: '1/-1', flexDirection: 'row', alignItems: 'center', padding: '0 2rem', borderBottom: '1px solid #222' }}>
                <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Shield size={18} color="var(--accent)" />
                    <span style={{ fontWeight: 900 }}>SVRN<span style={{ color: 'var(--accent)' }}>.IO</span></span>
                </div>
                <WalletMultiButton />
            </div>

            <div className="grid-cell" style={{ padding: '1.5rem', borderRight: '1px solid #222' }}>
                <h3 style={{ fontSize: '0.6rem', color: '#444', letterSpacing: 2 }}>CONFIG</h3>
                <label style={{ fontSize: '0.5rem', color: '#333', marginTop: '1rem' }}>PROP_ID</label>
                <input type="number" className="retro-input" value={proposalId} onChange={e => setProposalId(e.target.value)} />
                <label style={{ fontSize: '0.5rem', color: '#333', marginTop: '1rem' }}>MINT_ADDRESS</label>
                <input type="text" className="retro-input" style={{ fontSize: '0.6rem' }} value={votingMintStr} onChange={e => setVotingMintStr(e.target.value)} />
                <button className="retro-btn primary" style={{ marginTop: '2rem' }} onClick={handleCreate}>INITIALIZE NODE</button>
                
                <div style={{ marginTop: 'auto' }}>
                    <div style={{ fontSize: '0.6rem', color: '#444' }}>{statusText}</div>
                    <div className="status-track"><div className="status-fill" style={{ width: `${progress}%` }}></div></div>
                </div>
            </div>

            <div className="grid-cell" style={{ justifyContent: 'center', alignItems: 'center', background: 'radial-gradient(circle, #0a0a0a 0%, #000 70%)' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h2 style={{ fontSize: '3rem', fontWeight: 900, margin: 0 }}>#{proposalId}</h2>
                    <p style={{ color: '#444', fontSize: '0.7rem' }}>Sovereign Privacy Governance</p>
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: '1rem' }}>BALLOTS: {liveVoteCount}</div>
                </div>
                <div style={{ display: 'flex', gap: '2rem', width: '80%' }}>
                    <button className="retro-btn primary" style={{ flex: 1, padding: '2rem' }} onClick={() => handleVote(1)}>AFFIRMATIVE</button>
                    <button className="retro-btn" style={{ flex: 1, padding: '2rem' }} onClick={() => handleVote(0)}>NEGATIVE</button>
                </div>
            </div>

            <div className="grid-cell">
                <div style={{ padding: '1rem', borderBottom: '1px solid #222', fontSize: '0.6rem', color: '#444' }}>KERNEL_FEED</div>
                <div className="log-stream">
                    {logs.map((l, i) => (
                        <div key={i} className={`log-line ${l.type}`}><span style={{ opacity: 0.3 }}>{l.time}</span> {l.text}</div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => import.meta.env.VITE_HELIUS_RPC_URL || clusterApiUrl(network), [network]);
    const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
    return (
        <ConnectionProvider endpoint={endpoint}><WalletProvider wallets={wallets} autoConnect><WalletModalProvider><Dashboard /></WalletModalProvider></WalletProvider></ConnectionProvider>
    );
}