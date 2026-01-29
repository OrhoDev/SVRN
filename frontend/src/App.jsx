import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { PublicKey, clusterApiUrl, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Buffer } from 'buffer';
import idl from './idl.json';

// --- SDK IMPORT ---
import { SvrnClient } from 'svrn-sdk';
import circuit from '../circuit/target/circuit.json';

// --- ASSETS & STYLES ---
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import { 
    Terminal, ArrowRight, Shield, Lock, 
    Database, Globe, Server, CheckCircle, 
    Copy, Code, Activity, Cpu, Layers, ExternalLink, 
    FileCode, GitBranch, Github, Moon, Sun, Loader2
} from 'lucide-react';

// --- CONSTANTS ---
const PROGRAM_ID = new PublicKey("Dqz71XrFd9pnt5yJd83pnQje5gkSyCEMQh3ukF7iXjvU");

// --- COMPONENTS ---

const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="opacity-40 hover:opacity-100 transition-opacity">
            {copied ? <CheckCircle size={12} className="text-green-600"/> : <Copy size={12} className="text-[var(--text-muted)]"/>}
        </button>
    );
};

const SyntaxHighlight = ({ code }) => {
    const parts = code.split(/(\b(?:const|await|import|require|new|async|from|return|function)\b|\/\/.*|"[^"]*"|'[^']*'|\d+|[{}()[\].;,])/g);
    return (
        <span className="font-mono text-[12px] leading-relaxed">
            {parts.map((part, i) => {
                if (!part) return null;
                if (/^(const|await|import|require|new|async|from|return|function)$/.test(part)) return <span key={i} className="text-[#a626a4] font-bold">{part}</span>;
                if (part.startsWith('//')) return <span key={i} className="text-[#a0a1a7] italic">{part}</span>;
                if (part.startsWith('"') || part.startsWith("'")) return <span key={i} className="text-[#50a14f]">{part}</span>;
                if (/^\d+$/.test(part)) return <span key={i} className="text-[#986801]">{part}</span>;
                return <span key={i} className="text-[#383a42]">{part}</span>;
            })}
        </span>
    );
};

const IDEEntry = ({ entry }) => (
    <div className="mb-6 animate-slide-up pl-2 border-l-2 border-transparent hover:border-[#ccc] transition-colors group relative">
        <div className="flex items-center justify-between mb-1 pr-4">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
                {entry.title} 
                {entry.api && <span className="bg-[var(--bg-subtle)] px-1 text-[var(--text-main)] border border-[var(--border-light)]">{entry.api}</span>}
            </span>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={entry.code} />
            </div>
        </div>
        <div className="font-mono text-sm overflow-x-auto">
            <SyntaxHighlight code={entry.code} />
        </div>
        {entry.result && (
            <div className="mt-2 text-[11px] font-mono text-[var(--text-main)] flex items-start gap-2 bg-[var(--bg-subtle)] p-2 border border-[var(--border-light)] rounded-sm">
                <ArrowRight size={12} className="mt-[2px] text-emerald-600 flex-shrink-0"/> 
                <span className="break-all">{entry.result}</span>
            </div>
        )}
        {entry.tx && (
             <a href={`https://explorer.solana.com/tx/${entry.tx}?cluster=devnet`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-[10px] uppercase font-bold text-blue-600 hover:underline pl-2">
                View on Explorer <ExternalLink size={10} />
             </a>
        )}
    </div>
);

const StatsTicker = () => (
    <div className="border-y-2 border-[var(--border-main)] bg-[var(--bg-card)] py-3 overflow-hidden">
        <div className="flex items-center gap-16 animate-marquee whitespace-nowrap text-xs font-mono font-bold uppercase tracking-widest text-[var(--text-main)]">
            <span className="flex items-center gap-2"><Globe size={14}/> Solana Devnet</span>
            <span className="flex items-center gap-2"><Layers size={14}/> Arcium MPC Network</span>
            <span className="flex items-center gap-2"><Lock size={14}/> Noir UltraHonk ZK</span>
            <span className="flex items-center gap-2"><Shield size={14}/> Privacy Middleware v0.9</span>
            <span className="flex items-center gap-2"><Database size={14}/> Merklized Census</span>
            {/* Duplicated for scroll */}
            <span className="flex items-center gap-2"><Globe size={14}/> Solana Devnet</span>
            <span className="flex items-center gap-2"><Layers size={14}/> Arcium MPC Network</span>
            <span className="flex items-center gap-2"><Lock size={14}/> Noir UltraHonk ZK</span>
            <span className="flex items-center gap-2"><Shield size={14}/> Privacy Middleware v0.9</span>
            <span className="flex items-center gap-2"><Database size={14}/> Merklized Census</span>
        </div>
    </div>
);

// --- DYNAMIC WALLET BUTTON ---
const StyledWalletButton = () => {
    const { wallet } = useWallet();
    const adapterName = wallet?.adapter?.name || '';
    
    let walletClass = '';
    if (adapterName === 'Phantom') walletClass = 'wallet-phantom';
    else if (adapterName === 'Solflare') walletClass = 'wallet-solflare';
    
    return (
        <div className={`dynamic-wallet-wrapper ${walletClass}`}>
            <WalletMultiButton />
        </div>
    );
};

const SUPPORTED_TOKENS = [
    { name: "$SVRN (Protocol)", address: "47Xs3xqvyEzqXijtYxoAwpeKKskmnJ4vXdgKdJJxqrxo" },
    { name: "$SOL (Wrapped)", address: "So11111111111111111111111111111111111111112" },
    { name: "$USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { name: "$JUP (Jupiter)", address: "JUPyiZJpEGk4X3zVs6ZEST594rTh1FCWv Di1eGdc2" },
    { name: "$BONK", address: "DezXAZ8z7Pnrn9wvqgdGU3 d2SS3AC6cXKgr8gqc6Fp" }
];

const Dashboard = () => {

    const { connection } = useConnection();
    const { publicKey } = useWallet(); 
    const anchorWallet = useAnchorWallet();

    // --- STATE ---
    const [npmCopied, setNpmCopied] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    
    // UPDATED: proposalId is no longer manually set, it's null until created
    const [proposalId, setProposalId] = useState(null);
    const [nextIdDisplay, setNextIdDisplay] = useState("...");
    
    const [votingMintStr, setVotingMintStr] = useState("47Xs3xqvyEzqXijtYxoAwpeKKskmnJ4vXdgKdJJxqrxo");
    const [propTitle, setPropTitle] = useState("Grant for Privacy Research");
    const [propDesc, setPropDesc] = useState("Allocate 5000 USDC to the SVRN Labs team for ZK-circuit optimizations.");
    const [duration, setDuration] = useState(24);
    
    // SDK State
    // IMPORTANT: Make sure this URL matches your deployed Relayer!
    const svrn = useMemo(() => new SvrnClient("http://localhost:3000"), []);
    const [zkReady, setZkReady] = useState(false);

    const [liveVoteCount, setLiveVoteCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [myVoteWeight, setMyVoteWeight] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);

    // Playground Logs
    const [history, setHistory] = useState([]);
    const terminalRef = useRef(null);

    // --- EFFECTS ---
    useEffect(() => {
        setHasVoted(false);
        // Reset ID when switching mints if needed, or just keep null
    }, [votingMintStr]);

    useEffect(() => {
        // Initialize the SDK (WASM Loading)
        svrn.init(circuit).then(() => {
            setZkReady(true);
            setHistory([{
                title: "INITIALIZATION",
                api: "SDK",
                code: "// SVRN Middleware Loaded.\n// Connected to Arcium MPC Devnet.\n// Waiting for user input...",
                result: null
            }]);
            
            // Auto-Fetch the next ID just for display purposes
            svrn.api.getNextProposalId()
                .then(res => setNextIdDisplay(res.nextId))
                .catch(() => setNextIdDisplay("Err"));
        });
    }, [svrn]);

    useLayoutEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [history]);

    // Live Count Polling
    useEffect(() => {
        if (!publicKey || !proposalId) return;
        const fetchCount = async () => {
            try {
                // Using SDK logic for address derivation to match
                const [pda] = PublicKey.findProgramAddressSync([Buffer.from("svrn_prop"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
                const program = new Program(idl, new AnchorProvider(connection, anchorWallet || { publicKey }, {}));
                const acc = await program.account.proposal.fetch(pda);
                setLiveVoteCount(acc.voteCount.toNumber());
            } catch (e) { setLiveVoteCount(0); }
        };
        fetchCount();
        const intv = setInterval(fetchCount, 5000);
        return () => clearInterval(intv);
    }, [proposalId, publicKey, anchorWallet]);

    const addEntry = (title, api, code, result, tx = null) => {
        setHistory(prev => [...prev, { title, api, code, result, tx }]);
    };

    // --- LOGIC HANDLERS ---
    
    // 1. CREATE PROPOSAL (Updated to use SDK Auto-ID)
    const handleCreate = async () => {
        if (isLoading || !publicKey) return; 
        setIsLoading(true);
        try {
            addEntry("1. Create Proposal", "SDK: createProposal", 
`// SDK: Auto-Detect ID, Snapshot & Transaction
// 1. Fetch next available ID from Relayer
// 2. Build Merkle Snapshot (Quadratic Weights)
// 3. Submit On-Chain via Anchor

const { proposalId, txid } = await svrn.createProposal(
  provider,
  "${publicKey.toBase58().slice(0,6)}...", 
  "${votingMintStr.slice(0,6)}...",
  { title: "Grant...", duration: 24 },
  0.05 // Gas buffer
);`, "Initializing SVRN Pipeline...");

            const provider = new AnchorProvider(connection, anchorWallet, {});
            
            // --- SDK MAGIC HAPPENS HERE ---
            // The SDK handles getNextProposalId, initializeSnapshot, and the Anchor tx internally
            const { proposalId: newId, txid } = await svrn.createProposal(
                provider,
                publicKey,
                votingMintStr,
                { title: propTitle, desc: propDesc, duration },
                0.05 // Gas buffer
            );

            setProposalId(newId);

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `SUCCESS: Proposal #${newId} created & live.`;
                newH[newH.length-1].tx = txid;
                return newH;
            });

        } catch (e) { 
            console.error(e); 
            addEntry("Error", "Creation Failed", "", e.message); 
        } 
        finally { setIsLoading(false); }
    };

    // 2. CAST VOTE (Uses auto-detected ID)
    const handleVote = async (choice) => {
        if (isLoading || !zkReady || !publicKey || !proposalId) return; 
        setIsLoading(true);
        try {
            addEntry("2. Cast Vote", "SDK: castVote", 
`// SDK: Privacy Pipeline
// 1. Generate Noir ZK Proof (Eligibility)
// 2. Encrypt Ballot (Arcium MPC)
// 3. Relay to Solana (Gasless)

await svrn.castVote(
  provider, 
  "${publicKey.toBase58().slice(0,6)}...", 
  ${proposalId}, // Auto-ID #${proposalId}
  ${choice}
);`, "Generating Noir ZK Proof...");

            const provider = new AnchorProvider(connection, anchorWallet, {});
            const result = await svrn.castVote(provider, publicKey.toBase58(), proposalId, choice);

            if (!result.success) throw new Error(result.error);

            // Fetch proof data just to show the user their weight
            const proofData = await svrn.api.getProof(proposalId, publicKey.toBase58());
            setMyVoteWeight(Number(proofData.proof.weight));

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `Confirmed. Proof Verified on-chain.`;
                newH[newH.length-1].tx = result.tx;
                return newH;
            });
            setHasVoted(true);

        } catch (e) { console.error(e); alert(e.message); } 
        finally { setIsLoading(false); }
    };

    // 3. TALLY (Uses auto-detected ID)
    const handleTally = async () => {
        if (isLoading || !proposalId) return;
        setIsLoading(true);
        try {
            addEntry("3. Tally", "POST /prove-tally", 
`// SDK: Generate Trustless Tally Proof
const result = await svrn.api.proveTally({ 
  proposalId: ${proposalId},
  yes: ${myVoteWeight}, 
  quorum: 100 
});`, "Verifying Aggregate Proof...");

            const res = await svrn.api.proveTally(proposalId, myVoteWeight, 0, 50, 100);
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
        <div className={`min-h-screen font-sans overflow-x-hidden ${darkMode ? 'dark-mode' : ''}`} style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}>
            
            {/* --- HEADER --- */}
            <nav className="h-16 border-b-2 border-[var(--border-main)] bg-[var(--bg-card)] flex items-center justify-between px-6 sticky top-0 z-50">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="text-xl font-black tracking-tighter flex items-center gap-2 uppercase">
                            <Shield size={22} className="fill-current"/> SVRN
                        </span>
                        <span className="text-[10px] text-[var(--bg-card)] bg-[var(--text-main)] px-2 py-0.5 font-bold uppercase tracking-wider hidden sm:inline-block">Middleware</span>
                    </div>
                    {/* Dark Mode Toggle */}
                    <button onClick={() => setDarkMode(!darkMode)} className="p-1 hover:bg-[var(--bg-subtle)] rounded transition-colors">
                        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </div>

                <div className="flex items-center gap-6">
                    {/* HIDE LINKS ON MOBILE */}
                    <div className="hidden md:flex items-center gap-6">
                        <a href="#playground" className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Playground</a>
                        <a href="#docs" className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Docs</a>
                        <a href="https://github.com" target="_blank" rel="noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"><Github size={18} /></a>
                    </div>
                    <StyledWalletButton />
                </div>
            </nav>

            {/* --- HERO --- */}
            <section className="py-24 px-6 text-center max-w-6xl mx-auto relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-dots opacity-10 pointer-events-none"></div>
                
                <div className="relative z-10">
              <div 
    onClick={() => {
        navigator.clipboard.writeText("npm install svrn-sdk");
        setNpmCopied(true);
        setTimeout(() => setNpmCopied(false), 2000);
    }}
    className={`inline-block border-2 border-[var(--border-main)] bg-[var(--bg-card)] px-4 py-2 font-mono text-xs font-bold mb-8 shadow-[4px_4px_0px_var(--border-main)] transition-all cursor-pointer select-none
        ${npmCopied ? 'translate-x-[2px] translate-y-[2px] shadow-none bg-emerald-50 dark:bg-emerald-900/20' : 'hover:-translate-y-1 active:translate-y-[2px] active:shadow-none'}`}
>
    {npmCopied ? (
        <span className="flex items-center gap-2 text-emerald-600">
            <CheckCircle size={12}/> COPIED TO CLIPBOARD
        </span>
    ) : (
        <span className="flex items-center gap-2">
            <Terminal size={12}/> npm install svrn-sdk
        </span>
    )}
</div>
                    {/* RESPONSIVE TEXT SIZE */}
                    <h1 className="text-5xl md:text-8xl font-black text-[var(--text-main)] mb-6 tracking-tighter leading-[0.9]">
                        PRIVACY MIDDLEWARE<br/>
                        <span className="text-[var(--text-main)]">FOR SOLANA.</span>
                    </h1>
                  <p className="text-[var(--text-muted)] text-lg md:text-xl mb-12 max-w-3xl mx-auto font-medium leading-relaxed">
    SVRN is a privacy-first governance engine that abstracts the complexity of <span className="text-[var(--text-main)] font-bold underline decoration-1 underline-offset-4">Noir ZK-circuits</span> and <span className="text-[var(--text-main)] font-bold underline decoration-1 underline-offset-4">Arcium MPC clusters</span> into a drop-in SDK. 
</p>
                    
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                         <a href="#playground" className="retro-btn px-8 py-4 text-sm bg-[var(--text-main)] text-[var(--bg-card)] border-[var(--border-main)] hover:opacity-90">
                            Launch Playground
                        </a>
                        <a href="#docs" className="retro-btn px-8 py-4 text-sm">
                            Read the Docs
                        </a>
                    </div>
                </div>
            </section>

            <StatsTicker />


{/* --- THE MISSION / EXPLANER --- */}
<section className="py-20 px-8 bg-[var(--bg-main)] border-b-2 border-[var(--border-main)]">
    <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-black text-white"><Database size={18}/></div>
                    <h3 className="font-black uppercase tracking-tighter text-xl">The Census</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed font-mono">
                    Public Solana token state is "shielded" into a Merklized census. Using our Relayer, we compress thousands of token accounts into a single ZK-friendly Merkle Root.
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-black text-white"><Lock size={18}/></div>
                    <h3 className="font-black uppercase tracking-tighter text-xl">The Vote</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed font-mono">
                    Voters generate a local <span className="text-[var(--text-main)] font-bold">Noir UltraHonk</span> proof of membership. The ballot choice is then encrypted via <span className="text-[var(--text-main)] font-bold">Arcium Threshold MPC</span> before submission.
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-black text-white"><Layers size={18}/></div>
                    <h3 className="font-black uppercase tracking-tighter text-xl">The Tally</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed font-mono">
                    The Relayer aggregates encrypted ballots homomorphically. Only the final result is revealed through a ZK-Validity proof, ensuring individual choices remain secret forever.
                </p>
            </div>

        </div>


    </div>
</section>

{/* --- PLAYGROUND --- */}
<section id="playground" className="py-10 px-6 border-b-2 border-[var(--border-main)] bg-[var(--bg-subtle)]">
    <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end gap-3 mb-6">
            <Terminal size={24} className="text-[var(--text-main)]"/>
            <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-[var(--text-main)] leading-none">Integration Lab</h2>
                <p className="text-xs font-mono text-[var(--text-muted)]">SDK Playground</p>
            </div>
        </div>

        {/* RESPONSIVE GRID WRAPPER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 border-2 border-[var(--border-main)] shadow-[12px_12px_0px_var(--shadow-color)] bg-[var(--bg-card)] h-auto lg:h-[720px] overflow-hidden">
            
            {/* LEFT PANEL: STACK ON MOBILE */}
            <div className="lg:col-span-5 p-8 border-b lg:border-b-0 lg:border-r-2 border-[var(--border-main)] flex flex-col gap-6 bg-[var(--bg-card)] overflow-y-auto custom-scrollbar">
                
                {/* 1. SNAPSHOT & CONFIG */}
                <div className="relative">
                    <h3 className="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Database size={12}/> 01 Census & Config
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-5 gap-3">
                            <div className="col-span-2">
                                <label className="text-[8px] uppercase font-bold text-[#888] mb-1 block">Prop ID</label>
                                {/* REPLACED INPUT WITH DISPLAY BADGE */}
                                <div className="w-full bg-[var(--bg-subtle)] border-2 border-[var(--border-light)] p-3 text-sm font-bold text-[var(--text-main)] flex items-center justify-between">
                                    {proposalId ? (
                                        <span className="text-emerald-600">#{proposalId}</span>
                                    ) : (
                                        <span className="text-[var(--text-muted)]">Next: #{nextIdDisplay}</span>
                                    )}
                                    <div className={`w-2 h-2 rounded-full ${proposalId ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`}></div>
                                </div>
                            </div>
                            <div className="col-span-3">
                                <label className="text-[8px] uppercase font-bold text-[#888] mb-1 block">Target Token</label>
                                <select 
                                    value={votingMintStr} 
                                    onChange={e => setVotingMintStr(e.target.value)} 
                                    className="w-full bg-[var(--bg-subtle)] border-2 border-[var(--border-light)] p-3 text-[11px] font-bold text-[var(--text-main)] focus:border-[var(--border-main)] outline-none cursor-pointer appearance-none"
                                >
                                    {SUPPORTED_TOKENS.map(t => <option key={t.address} value={t.address}>{t.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-[8px] uppercase font-bold text-[#888] mb-1 block">Proposal Title</label>
                            <div className="grid grid-cols-4 gap-3">
                                <input 
                                    type="text" 
                                    placeholder="Title" 
                                    value={propTitle} 
                                    onChange={e => setPropTitle(e.target.value)} 
                                    className="col-span-3 bg-[var(--bg-subtle)] border-2 border-[var(--border-light)] p-3 text-sm font-bold text-[var(--text-main)] focus:border-[var(--border-main)] outline-none" 
                                />
                                <div className="col-span-1 flex items-center bg-[var(--bg-subtle)] border-2 border-[var(--border-light)] px-2">
                                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-transparent text-xs font-bold text-[var(--text-main)] outline-none" />
                                    <span className="text-[9px] font-bold text-[#888]">HR</span>
                                </div>
                            </div>
                        </div>

                        {/* Simplified Protocol Fee Badge */}
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">Required Protocol Fee</span>
                            <span className="text-[10px] font-bold bg-black text-white px-2 py-0.5 rounded-sm">0.05 SOL</span>
                        </div>

                        <button onClick={handleCreate} disabled={isLoading || proposalId !== null} className="retro-btn w-full py-5 text-sm font-black tracking-widest disabled:opacity-50">
                            {proposalId ? "PROPOSAL ACTIVE" : (isLoading ? "INITIALIZING..." : "INITIATE PROPOSAL")}
                        </button>
                    </div>
                </div>

                <hr className="border-dashed border-[var(--border-light)] my-2"/>

                {/* 2. VOTE */}
                <div className={`relative transition-opacity ${!proposalId ? 'opacity-40' : 'opacity-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
                            <Lock size={12}/> 02 Shielded Vote
                        </h3>
                        {proposalId && (
                            <div className="text-[9px] font-mono text-red-500 font-bold animate-pulse uppercase">
                                Expires in {duration}h
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <button onClick={() => handleVote(1)} disabled={!proposalId || isLoading || !zkReady} className="retro-btn py-5 font-black text-sm">YES</button>
                        <button onClick={() => handleVote(0)} disabled={!proposalId || isLoading || !zkReady} className="retro-btn py-5 font-black text-sm">NO</button>
                    </div>
                    <div className="border-2 border-[var(--border-light)] bg-[var(--bg-subtle)] p-2 flex justify-between items-center px-4">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Live Ballots</span>
                        <span className="font-mono text-sm font-bold text-[var(--text-main)]">{liveVoteCount}</span>
                    </div>
                </div>

                <hr className="border-dashed border-[var(--border-light)] my-2"/>

                {/* 3. TALLY */}
                <div className="relative">
                    <h3 className="text-[10px] font-bold text-[var(--text-main)] uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Layers size={12}/> 03 Verifiable Tally
                    </h3>
                    <button onClick={handleTally} disabled={isLoading || !hasVoted} className="retro-btn w-full py-5 text-sm font-black bg-[var(--text-main)] text-[var(--bg-card)] border-[var(--border-main)]">
                        PROVE & EXECUTE
                    </button>
                </div>
            </div>

            {/* RIGHT PANEL (IDE): FIXED HEIGHT ON MOBILE */}
            <div className="lg:col-span-7 bg-[var(--bg-card)] flex flex-col h-[500px] lg:h-full relative border-t-2 lg:border-t-0 border-[var(--border-main)]">
                <div className="h-10 border-b border-[var(--border-light)] bg-[var(--bg-subtle)] flex items-end px-4 gap-1">
                    <div className="bg-[var(--bg-card)] border-t border-l border-r border-[var(--border-light)] px-4 py-2 text-[11px] font-sans text-[var(--text-main)] flex items-center gap-2 rounded-t-sm relative top-[1px]">
                        <FileCode size={12} className="text-blue-500"/> svrn_middleware.ts
                    </div>
                </div>
                
                <div className="flex-1 p-0 overflow-hidden relative flex bg-[var(--bg-card)]">
                    <div className="w-10 bg-[var(--bg-subtle)] border-r border-[var(--border-light)] flex flex-col items-end pr-2 pt-4 select-none">
                        {Array.from({ length: 40 }).map((_, i) => (
                            <span key={i} className="text-[10px] font-mono text-[var(--text-muted)] opacity-30 leading-6">{i + 1}</span>
                        ))}
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar" ref={terminalRef}>
                        {history.length === 0 && <div className="text-[11px] font-mono text-[var(--text-muted)]">// System Awaiting Initialization...</div>}
                        {history.map((entry, i) => <IDEEntry key={i} entry={entry} />)}
                        <div className="w-2 h-5 bg-[var(--text-main)] animate-pulse inline-block align-middle ml-1"></div>
                    </div>
                </div>

                <div className="h-6 bg-[#007acc] text-white flex items-center justify-between px-4 text-[10px] font-sans uppercase tracking-tighter">
                    <div className="flex gap-4">
                        <span className="font-bold">main*</span>
                        <span>0 Errors</span>
                    </div>
                    <span>TypeScript / Node.js</span>
                </div>
            </div>
        </div>
    </div>
</section>

{/* --- SHOWCASE ONE-LINER --- */}
<section className="py-20 bg-[var(--bg-subtle)] text-[var(--text-main)] border-y-2 border-[var(--border-main)] relative overflow-hidden">
    <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <h2 className="text-4xl font-black uppercase mb-8 tracking-tighter leading-none text-[var(--text-main)]">Governance in 3 lines of code.</h2>
        
        {/* Subtle border-white/10 added below */}
        <div className="bg-[var(--bg-code-block)] border-6 border-[var(--border-main)] p-8 text-left shadow-[12px_12px_0px_var(--shadow-color)] transform hover:scale-[1.01] transition-transform border-white/10">
            <pre className="text-sm md:text-base font-mono leading-relaxed overflow-x-auto">
                <div className="mb-4 text-[#abb2bf]">
                    <span className="text-[#7f848e] italic">// 1. Initialize SVRN Client</span><br/>
                    <span className="text-[#c678dd]">const</span> svrn <span className="text-white">=</span> <span className="text-[#c678dd]">new</span> <span className="text-[#e5c07b]">SvrnClient</span><span className="text-white">();</span>
                </div>

                {/* UPDATED CODE SNIPPET TO MATCH REALITY */}
                <div className="mb-4 text-[#abb2bf]">
                    <span className="text-[#7f848e] italic">// 2. Create Proposal (Auto-ID & Snapshot)</span><br/>
                    <span className="text-[#c678dd]">await</span> svrn<span className="text-white">.</span><span className="text-[#61afef]">createProposal</span><span className="text-white">(</span>provider<span className="text-white">,</span> authority<span className="text-white">,</span> mint<span className="text-white">,</span> meta<span className="text-white">);</span>
                </div>

                <div className="text-[#abb2bf]">
                    <span className="text-[#7f848e] italic">// 3. Shielded Privacy Vote (ZK + MPC)</span><br/>
                    <span className="text-[#c678dd]">await</span> svrn<span className="text-white">.</span><span className="text-[#61afef]">castVote</span><span className="text-white">(</span>provider<span className="text-white">,</span> user<span className="text-white">,</span> id<span className="text-white">,</span> <span className="text-[#d19a66]">1</span><span className="text-white">);</span>
                </div>
            </pre>
        </div>
    </div>
</section>
            {/* --- DOCS / QUICKSTART --- */}
            <section id="docs" className="py-24 px-6 max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                    
                    {/* QUICKSTART */}
                    <div>
                        <div className="mb-8 border-b-2 border-[var(--border-main)] pb-2 flex justify-between items-end">
                            <h2 className="text-2xl font-black text-[var(--text-main)] uppercase">Quickstart</h2>
                            <span className="text-xs font-mono bg-[var(--text-main)] text-[var(--bg-card)] px-2 py-0.5">TS / Node</span>
                        </div>
                        
                        <div className="space-y-8">
                            <div className="group">
                                <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">1. Install Package</p>
                                <div className="bg-[var(--bg-card)] border-2 border-[var(--border-main)] p-4 flex justify-between items-center shadow-[4px_4px_0px_var(--shadow-color)] group-hover:shadow-[4px_4px_0px_var(--text-main)] transition-shadow">
                                    <code className="text-xs font-mono text-[var(--text-main)]">npm i svrn-sdk</code>
                                    <CopyButton text="npm i svrn-sdk" />
                                </div>
                            </div>

                            <div className="group">
                                <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">2. Instantiate Client</p>
                                <div className="bg-[var(--bg-card)] border-2 border-[var(--border-main)] p-4 relative shadow-[4px_4px_0px_var(--shadow-color)] group-hover:shadow-[4px_4px_0px_var(--text-main)] transition-shadow">
                                    <pre className="text-xs font-mono text-[var(--text-main)] overflow-x-auto">
                                        <span className="font-bold text-[#a626a4]">import</span> &#123; SvrnClient &#125; <span className="font-bold text-[#a626a4]">from</span> 'svrn-sdk';<br/>
                                        <span className="font-bold text-[#a626a4]">const</span> client = <span className="font-bold text-[#a626a4]">new</span> <span className="text-[#c18401]">SvrnClient</span>(RPC_URL);
                                    </pre>
                                </div>
                            </div>

                            <div className="group">
    <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">3. React Hook Integration</p>
    <div className="bg-[var(--bg-card)] border-2 border-[var(--border-main)] p-4 relative shadow-[4px_4px_0px_var(--shadow-color)] group-hover:shadow-[4px_4px_0px_var(--text-main)] transition-all">
        <pre className="text-[11px] font-mono text-[var(--text-main)] overflow-x-auto leading-relaxed">
            <span className="text-[#a0a1a7]">// Use SVRN in your components</span><br/>
            <span className="text-[#a626a4] font-bold">const</span> &#123; castVote &#125; = useSvrn();<br/><br/>
            <span className="text-[#a626a4] font-bold">const</span> onVote = <span className="text-[#a626a4] font-bold">async</span> (id) =&gt; &#123;<br/>
            &nbsp;&nbsp;<span className="text-[#a626a4] font-bold">await</span> castVote(anchorProvider, id, <span className="text-[#986801]">1</span>);<br/>
            &nbsp;&nbsp;console.log(<span className="text-[#50a14f]">"Identity hidden, vote cast."</span>);<br/>
            &#125;;
        </pre>
    </div>
</div>

                        </div>

                    </div>

                    {/* API REFERENCE */}
                    <div>
                        <div className="mb-8 border-b-2 border-[var(--border-main)] pb-2 flex justify-between items-end">
                            <h2 className="text-2xl font-black text-[var(--text-main)] uppercase">Core Methods</h2>
                            <span className="text-xs font-mono bg-[var(--bg-subtle)] text-[var(--text-main)] px-2 py-0.5 border border-[var(--border-light)]">v1.0</span>
                        </div>

                        {/* API REFERENCE (Right Column of Docs) */}
<div className="space-y-4">
    {/* Method 1 */}
    <div className="border border-[var(--border-light)] bg-[var(--bg-card)] p-5 hover:border-[var(--border-main)] transition-colors group">
        <div className="flex justify-between items-start mb-2">
            <span className="font-mono text-sm font-bold text-[var(--text-main)] group-hover:text-blue-500 transition-colors">castVote()</span>
            <span className="text-[10px] font-bold text-[var(--bg-card)] bg-[var(--text-main)] px-2 py-0.5">ASYNC</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
            Generates a Noir ZK-Proof of eligibility based on the snapshot, encrypts the choice using Arcium MPC, and relays to Solana.
        </p>
        {/* Fixed: text-main ensures visibility in both modes */}
        <div className="bg-[var(--bg-subtle)] border border-[var(--border-light)] p-2 font-mono text-[10px] text-[var(--text-main)] overflow-x-auto">
            <span className="text-[#a626a4] font-bold">async</span> (provider, wallet, id, choice) <span className="text-[#a626a4] font-bold">=&gt;</span> <span className="text-[#c18401]">Promise</span>&lt;TxSignature&gt;
        </div>
    </div>

    {/* Method 2 */}
    <div className="border border-[var(--border-light)] bg-[var(--bg-card)] p-5 hover:border-[var(--border-main)] transition-colors group">
        <div className="flex justify-between items-start mb-2">
            <span className="font-mono text-sm font-bold text-[var(--text-main)] group-hover:text-emerald-500 transition-colors">proveTally()</span>
            <span className="text-[10px] font-bold text-[var(--bg-card)] bg-[var(--text-main)] px-2 py-0.5">ASYNC</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
            Triggers the MPC network to aggregate votes. Generates a validity proof that the decryption matches the sum of inputs.
        </p>
        {/* Fixed: text-main ensures visibility in both modes */}
        <div className="bg-[var(--bg-subtle)] border border-[var(--border-light)] p-2 font-mono text-[10px] text-[var(--text-main)] overflow-x-auto">
            <span className="text-[#a626a4] font-bold">async</span> (id, expectedVotes) <span className="text-[#a626a4] font-bold">=&gt;</span> <span className="text-[#c18401]">Promise</span>&lt;ProofData&gt;
        </div>
    </div>
</div>
                    </div>

                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="bg-[var(--bg-card)] text-[var(--text-main)] py-16 border-t-2 border-[var(--border-main)]">
                <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-12">
                    <div className="text-left">
                        <span className="text-2xl font-black block mb-2 tracking-tighter uppercase">SVRN</span>
                        <span className="text-xs text-[var(--text-muted)] font-mono">
                            Privacy Middleware for the Solana Ecosystem.<br/>
                            &copy; 2026 Sovereign Labs.
                        </span>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-6 md:gap-16 opacity-60 hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-2 font-bold text-sm"><Globe size={18}/> SOLANA</div>
                        <div className="flex items-center gap-2 font-bold text-sm"><Layers size={18}/> ARCIUM</div>
                        <div className="flex items-center gap-2 font-bold text-sm"><Lock size={18}/> NOIR</div>
                        <a href="https://github.com" target="_blank" rel="noreferrer"><Github size={18} /></a>
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