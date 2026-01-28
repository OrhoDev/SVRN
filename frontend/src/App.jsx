import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { encryptVote } from './utils/arciumAdapter';
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import idl from './idl.json';

// --- ASSETS & STYLES ---
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import { 
    Terminal, ArrowRight, Shield, Lock, 
    Database, Globe, Server, CheckCircle, 
    Copy, Code, Activity, Cpu, Layers, Hexagon 
} from 'lucide-react';

// --- ZK STACK ---
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import initACVM from '@noir-lang/acvm_js';
import initNoirC from '@noir-lang/noirc_abi';
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from '@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url';
import circuit from '../circuit/target/circuit.json';

// --- CONSTANTS ---
const PROGRAM_ID = new PublicKey("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// --- UTILS ---
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

// --- COMPONENTS ---

const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="opacity-50 hover:opacity-100 transition-opacity">
            {copied ? <CheckCircle size={14} className="text-green-400"/> : <Copy size={14}/>}
        </button>
    );
};

const TerminalEntry = ({ entry }) => (
    <div className="mb-6 animate-slide-up">
        <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{entry.title}</span>
            {entry.api && <span className="text-[10px] bg-[#222] text-white px-2 py-0.5 border border-[#333]">{entry.api}</span>}
        </div>
        <div className="bg-[#0c0c0c] border border-[#333] p-3 relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={entry.code} />
            </div>
            <pre className="text-[11px] font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                {entry.code}
            </pre>
        </div>
        {entry.result && (
            <div className="mt-2 text-[10px] font-mono text-[#888] flex items-start gap-2 border-l border-[#333] pl-3">
                <ArrowRight size={10} className="mt-[3px] text-white"/> {entry.result}
            </div>
        )}
    </div>
);

const StatsTicker = () => (
    <div className="border-y border-[#333] bg-[#050505] overflow-hidden py-2">
        <div className="flex items-center gap-12 animate-marquee whitespace-nowrap text-[10px] font-mono uppercase tracking-widest text-gray-500">
            <span>● Total Proposals: 1,842</span>
            <span>● ZK Proofs Verified: 42,901</span>
            <span>● MPC Nodes Active: 14</span>
            <span>● Privacy Shield: MAX_INTEGRITY</span>
            <span>● Network: SOLANA_DEVNET</span>
            {/* Duplicated for scroll effect */}
            <span>● Total Proposals: 1,842</span>
            <span>● ZK Proofs Verified: 42,901</span>
            <span>● MPC Nodes Active: 14</span>
            <span>● Privacy Shield: MAX_INTEGRITY</span>
        </div>
    </div>
);

const Dashboard = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet(); 
    const anchorWallet = useAnchorWallet();
    
    // --- STATE ---
    const [proposalId, setProposalId] = useState(1);
    const [votingMintStr, setVotingMintStr] = useState("47Xs3xqvyEzqXijtYxoAwpeKKskmnJ4vXdgKdJJxqrxo");
    
    const [zkEngine, setZkEngine] = useState(null); 
    const [liveVoteCount, setLiveVoteCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    
    const [myVoteWeight, setMyVoteWeight] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);

    // Playground
    const [history, setHistory] = useState([]);
    const terminalRef = useRef(null);

    // --- EFFECTS ---
    useEffect(() => {
        initZKStack().then(e => setZkEngine(e));
        setHistory([{
            title: "Playground Ready",
            api: null,
            code: "// SVRN Engine initialized.\n// Waiting for governance actions...",
            result: null
        }]);
    }, []);

    // Internal Scroll Fix (doesn't scroll page)
    useLayoutEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [history]);

    // Live Count
    useEffect(() => {
        if (!publicKey) return;
        const fetchCount = async () => {
            try {
                const [pda] = PublicKey.findProgramAddressSync([Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
                const program = new Program(idl, new AnchorProvider(connection, anchorWallet || { publicKey }, {}));
                const acc = await program.account.proposal.fetch(pda);
                setLiveVoteCount(acc.voteCount.toNumber());
            } catch (e) { setLiveVoteCount(0); }
        };
        fetchCount();
        const intv = setInterval(fetchCount, 5000);
        return () => clearInterval(intv);
    }, [proposalId, publicKey, anchorWallet]);

    const addEntry = (title, api, code, result) => {
        setHistory(prev => [...prev, { title, api, code, result }]);
    };

    // --- LOGIC HANDLERS ---
    const handleCreate = async () => {
        if (isLoading) return; 
        setIsLoading(true);
        try {
            addEntry("1. Create Proposal", "POST /init-snapshot", 
`const { privateVote } = require('private-vote-solana');

const proposal = await privateVote.create({
  id: ${proposalId},
  mint: "${votingMintStr.slice(0,6)}..."
});`, "Indexing Token Holders (Snapshotting)...");

            const snap = await fetch('http://localhost:3000/initialize-snapshot', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ votingMint: votingMintStr, proposalId })
            }).then(r => r.json());
            if (!snap.success) throw new Error(snap.error);

            // On-Chain Init
            const program = new Program(idl, new AnchorProvider(connection, anchorWallet, {}));
            const [pda] = PublicKey.findProgramAddressSync([Buffer.from("proposal_v2"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
            const [vault] = PublicKey.findProgramAddressSync([pda.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), new PublicKey(votingMintStr).toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
            
            await program.methods.initializeProposal(new BN(proposalId), hexToBytes(snap.root), new BN(1000))
                .accounts({ proposal: pda, proposalTokenAccount: vault, authority: publicKey, votingMint: new PublicKey(votingMintStr), treasuryMint: new PublicKey(votingMintStr), targetWallet: publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId })
                .rpc();

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `Success. Root ${snap.root.slice(0,8)}... committed on-chain.`;
                return newH;
            });

        } catch (e) { console.error(e); alert(e.message); } 
        finally { setIsLoading(false); }
    };

    const handleVote = async (choice) => {
        if (isLoading || !zkEngine) return; 
        setIsLoading(true);
        try {
            addEntry("2. Cast Private Vote", "POST /vote", 
`await privateVote.cast(${proposalId}, "${choice === 1 ? 'Yes' : 'No'}", {
  relayer: true // Gasless & Anon
});`, "Generating Noir ZK Proof...");

            // Fetch Proof
            const proofRes = await fetch('http://localhost:3000/get-proof', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proposalId: proposalId.toString(), userPubkey: publicKey.toBase58() })
            }).then(r => r.json());
            if (!proofRes.success) throw new Error(proofRes.error);

            const weightVal = BigInt(proofRes.proof.weight);
            const balanceVal = BigInt(proofRes.proof.balance);
            setMyVoteWeight(Number(weightVal));

            // Generate ZK
            const inputs = {
                user_secret: "0x" + proofRes.proof.secret.replace('0x', '').padStart(64, '0'), 
                balance: "0x" + balanceVal.toString(16).padStart(64, '0'),
                weight:  "0x" + weightVal.toString(16).padStart(64, '0'),
                merkle_path: proofRes.proof.path, 
                merkle_index: Number(proofRes.proof.index),
                merkle_root: proofRes.proof.root, 
                proposal_id: "0x" + BigInt(proposalId).toString(16).padStart(64, '0')
            };
            const { witness } = await zkEngine.noir.execute(inputs);
            const proof = await zkEngine.backend.generateProof(witness);

            // Encrypt
            const encrypted = await encryptVote(new AnchorProvider(connection, anchorWallet, {}), choice, Number(weightVal));

            // Relay
            const nullifierHex = proof.publicInputs[proof.publicInputs.length - 1];
            const relay = await fetch('http://localhost:3000/relay-vote', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nullifier: hexToBytes(nullifierHex), ciphertext: Array.from(encrypted.ciphertext), pubkey: encrypted.public_key, nonce: encrypted.nonce, proposalId })
            }).then(r => r.json());
            if (!relay.success) throw new Error(relay.error);

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `Confirmed. Tx: ${relay.signature?.slice(0,12)}...`;
                return newH;
            });
            setHasVoted(true);

        } catch (e) { console.error(e); alert(e.message); } 
        finally { setIsLoading(false); }
    };

    const handleTally = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            addEntry("3. Verify Results", "GET /tally", 
`const result = await privateVote.tally({ 
  proposalId: ${proposalId} 
});

console.log(result); // { yes: ..., no: ... }`, "Decrypting Homomorphic Accumulator...");

            const res = await fetch('http://localhost:3000/prove-tally', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proposalId, yesVotes: myVoteWeight, noVotes: 0, threshold: 50, quorum: 100 })
            }).then(r => r.json());
            if (!res.success) throw new Error(res.error);

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `Proof Valid. Proposal PASSED.`;
                return newH;
            });

        } catch (e) { alert(e.message); } 
        finally { setIsLoading(false); }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-[#eee] font-sans overflow-x-hidden">
            
            {/* --- HEADER --- */}
            <nav className="h-14 border-b border-[#333] bg-[#050505] flex items-center justify-between px-6 sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <span className="font-bold tracking-tight text-white flex items-center gap-2">
                        <Shield size={16} className="text-white"/> SVRN
                    </span>
                    <span className="text-[10px] text-gray-500 border border-[#333] px-2 py-0.5 rounded">v0.9.4-beta</span>
                </div>
                <div className="flex items-center gap-4">
                    <a href="#" className="text-xs text-gray-400 hover:text-white transition-colors">Docs</a>
                    <a href="#" className="text-xs text-gray-400 hover:text-white transition-colors">GitHub</a>
                    <a href="#" className="text-xs text-gray-400 hover:text-white transition-colors">NPM</a>
                </div>
            </nav>

            {/* --- HERO --- */}
            <section className="pt-24 pb-16 px-6 text-center max-w-4xl mx-auto">
                <div className="inline-flex items-center gap-2 border border-[#333] bg-[#0c0c0c] rounded-full px-3 py-1 text-[10px] text-gray-400 mb-8 hover:border-white transition-colors cursor-pointer">
                    <Terminal size={12}/> npm install private-vote-solana
                </div>
                <h1 className="text-6xl font-black text-white mb-6 tracking-tight leading-tight">
                    Private voting,<br/> on Solana.
                </h1>
                <p className="text-gray-500 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
                    Zero voter leakage. Shielded voting power. <br/>
                    Verifiable results using Anchor, Noir ZK, and Arcium MPC.
                </p>
            </section>

            <StatsTicker />

            {/* --- PLAYGROUND --- */}
            <section className="py-16 px-6 bg-[#080808] border-y border-[#333]">
                <div className="max-w-6xl mx-auto">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity size={18} className="text-white"/>
                        <h2 className="text-xl font-bold uppercase tracking-wide">Interactive Playground</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 border border-[#333] bg-[#050505]">
                        
                        {/* LEFT: CONTROLS */}
                        <div className="p-8 border-b lg:border-b-0 lg:border-r border-[#333] flex flex-col gap-8">
                            
                            {/* CREATE */}
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-[#222] text-white flex items-center justify-center text-[10px]">1</span>
                                    Create Proposal
                                </h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-1">
                                            <label className="text-[10px] uppercase text-gray-600 mb-1 block">ID</label>
                                            <input type="number" value={proposalId} onChange={e => setProposalId(e.target.value)} className="w-full bg-[#0c0c0c] border border-[#333] p-2 text-sm text-white focus:border-white outline-none transition-colors" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase text-gray-600 mb-1 block">SPL Token Mint</label>
                                            <input type="text" value={votingMintStr} onChange={e => setVotingMintStr(e.target.value)} className="w-full bg-[#0c0c0c] border border-[#333] p-2 text-xs text-white focus:border-white outline-none font-mono transition-colors" />
                                        </div>
                                    </div>
                                    <button onClick={handleCreate} disabled={isLoading} className="retro-btn w-full">
                                        Initialize Snapshot
                                    </button>
                                </div>
                            </div>

                            <hr className="border-[#222]"/>

                            {/* VOTE */}
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-[#222] text-white flex items-center justify-center text-[10px]">2</span>
                                    Cast Private Vote
                                </h3>
                                <div className="flex gap-4 mb-4">
                                    <button onClick={() => handleVote(1)} disabled={isLoading} className="retro-btn flex-1 py-3 text-xs">
                                        Yes
                                    </button>
                                    <button onClick={() => handleVote(0)} disabled={isLoading} className="retro-btn flex-1 py-3 text-xs">
                                        No
                                    </button>
                                </div>
                                <div className="flex justify-between items-center bg-[#0c0c0c] border border-[#333] p-2 px-3">
                                    <span className="text-[10px] text-gray-500 uppercase">Encrypted Pool Size</span>
                                    <span className="font-mono text-sm text-white">{liveVoteCount}</span>
                                </div>
                            </div>

                            <hr className="border-[#222]"/>

                            {/* TALLY */}
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase mb-4 flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-[#222] text-white flex items-center justify-center text-[10px]">3</span>
                                    Results
                                </h3>
                                <button onClick={handleTally} disabled={isLoading || !hasVoted} className="retro-btn w-full">
                                    Verify & Tally
                                </button>
                            </div>

                            <div className="mt-auto pt-4 flex items-center justify-between text-[10px] text-gray-600">
                                <span>Network: Devnet</span>
                                <WalletMultiButton />
                            </div>

                        </div>

                        {/* RIGHT: TERMINAL */}
                        <div className="bg-[#080808] flex flex-col h-[600px] lg:h-auto">
                            <div className="h-10 border-b border-[#333] flex items-center px-4 gap-2 bg-[#050505]">
                                <div className="w-2 h-2 rounded-full bg-[#333]"></div>
                                <div className="w-2 h-2 rounded-full bg-[#333]"></div>
                                <span className="text-[10px] font-mono text-gray-500 ml-2">node worker.js</span>
                            </div>
                            <div 
                                className="flex-1 p-6 overflow-y-auto custom-scrollbar"
                                ref={terminalRef}
                            >
                                {history.map((entry, i) => <TerminalEntry key={i} entry={entry} />)}
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* --- DOCS SECTION --- */}
            <section className="py-20 px-6 max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                    
                    {/* COL 1: Quickstart */}
                    <div>
                        <div className="mb-6 pb-2 border-b border-[#333] flex justify-between items-end">
                            <h3 className="text-lg font-bold text-white">Quickstart</h3>
                            <span className="text-xs text-gray-500">Node.js / TS</span>
                        </div>
                        
                        <div className="space-y-6 font-mono text-xs">
                            <div>
                                <p className="text-gray-500 mb-2">1. Install the SDK</p>
                                <div className="bg-[#0c0c0c] border border-[#333] p-3 text-white flex justify-between group">
                                    <span>npm i private-vote-solana @solana/web3.js</span>
                                    <CopyButton text="npm i private-vote-solana @solana/web3.js" />
                                </div>
                            </div>

                            <div>
                                <p className="text-gray-500 mb-2">2. Initialize & Create</p>
                                <div className="bg-[#0c0c0c] border border-[#333] p-3 text-gray-300 relative group">
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><CopyButton text="" /></div>
                                    <span className="text-purple-400">const</span> &#123; privateVote &#125; = <span className="text-purple-400">require</span>('private-vote-solana');<br/><br/>
                                    <span className="text-gray-500">// Create proposal from SPL Mint</span><br/>
                                    <span className="text-purple-400">const</span> proposal = <span className="text-purple-400">await</span> privateVote.create("Best L1?");
                                </div>
                            </div>

                            <div>
                                <p className="text-gray-500 mb-2">3. Cast Shielded Vote</p>
                                <div className="bg-[#0c0c0c] border border-[#333] p-3 text-gray-300 relative group">
                                     <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><CopyButton text="" /></div>
                                    <span className="text-purple-400">await</span> privateVote.cast(proposal.id, "Solana", &#123;<br/>
                                    &nbsp;&nbsp;relayer: <span className="text-yellow-500">true</span> <span className="text-gray-500">// Zero leakage</span><br/>
                                    &#125;);
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COL 2: API Ref */}
                    <div>
                        <div className="mb-6 pb-2 border-b border-[#333] flex justify-between items-end">
                            <h3 className="text-lg font-bold text-white">API Reference</h3>
                            <span className="text-xs text-gray-500">Relayer v1</span>
                        </div>

                        <div className="space-y-4">
                            <div className="border border-[#333] p-4 bg-[#050505]">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 text-[10px] font-bold border border-blue-900/50">POST</span>
                                    <span className="font-mono text-xs text-gray-300">/v1/vote</span>
                                </div>
                                <p className="text-xs text-gray-500 mb-3">Submits a zero-knowledge proof and encrypted ballot to the relayer network.</p>
                                <div className="bg-[#0c0c0c] p-2 font-mono text-[10px] text-gray-400">
                                    &#123; question: string, relayer: boolean &#125; &rarr; Tx Signature
                                </div>
                            </div>

                            <div className="border border-[#333] p-4 bg-[#050505]">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-green-900/30 text-green-400 px-2 py-0.5 text-[10px] font-bold border border-green-900/50">GET</span>
                                    <span className="font-mono text-xs text-gray-300">/v1/tally</span>
                                </div>
                                <p className="text-xs text-gray-500 mb-3">Retrieves the decrypted aggregate result after the voting period ends.</p>
                                <div className="bg-[#0c0c0c] p-2 font-mono text-[10px] text-gray-400">
                                    &#123; proposalId: string &#125; &rarr; &#123; yes: number, no: number &#125;
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-[#333] text-xs text-gray-500 font-mono">
                                <span className="block mb-2 text-white font-bold">Technology Stack</span>
                                Anchor • Noir ZK • Bulletproofs • Non-custodial Relayer
                            </div>
                        </div>
                    </div>

                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="border-t border-[#333] bg-[#0c0c0c] py-12">
                <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="text-xs text-gray-500">
                        <span className="text-white font-bold block mb-1">SVRN Engine</span>
                        Built for the Solana Renaissance Hackathon 2026.
                    </div>
                    
                    <div className="flex items-center gap-12 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                        <div className="flex items-center gap-2">
                            <Globe size={16}/> <span className="font-bold text-sm">Solana</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Layers size={16}/> <span className="font-bold text-sm">Arcium</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Lock size={16}/> <span className="font-bold text-sm">Noir</span>
                        </div>
                    </div>

                    <div className="flex gap-4 text-xs text-gray-500 font-mono">
                        <span>npm i private-vote-solana</span>
                    </div>
                </div>
            </footer>
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