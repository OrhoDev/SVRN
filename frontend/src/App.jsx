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

import { SolvrnClient } from 'solvrn-sdk';
import circuit from '../circuit/target/circuit.json';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import { 
    Terminal, ArrowRight, Shield, Lock, 
    Database, Globe, Layers, ExternalLink, 
    FileCode, Github, Moon, Sun, CheckCircle, Copy, GitBranch
} from 'lucide-react';
const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID || "AL2krCFs4WuzAdjZJbiYJCUnjJ2gmzQdtQuh7YJ3LXcv");
const THRESHOLD_REQ = parseInt(import.meta.env.VITE_THRESHOLD_REQ) || 51;
const QUORUM_REQ = parseInt(import.meta.env.VITE_QUORUM_REQ) || 10;

const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="opacity-40 hover:opacity-100 transition-opacity">
            {copied ? <CheckCircle size={12} className="text-emerald-600"/> : <Copy size={12} className="text-[var(--text-muted)]"/>}
        </button>
    );
};

const SyntaxHighlight = ({ code }) => {
    const parts = code.split(/(\b(?:const|await|import|from|return|function|if|else|new|async)\b|\/\/.*|"[^"]*"|'[^']*'|`[^`]*`|\d+|[{}()[\].;,]|[A-Z][a-zA-Z0-9_]*\b|[a-z][a-zA-Z0-9_]*(?=\())\b/g);
    
    return (
        <span className="font-mono text-[12px] leading-5">
            {parts.map((part, i) => {
                if (!part) return null;
                
                if (/^(const|await|import|from|return|function|if|else|new|async)$/.test(part)) 
                    return <span key={i} className="text-[#569cd6]">{part}</span>;
                
                if (part.startsWith('//')) 
                    return <span key={i} className="text-[#6a9955] italic">{part}</span>;
                
                if (part.startsWith('"') || part.startsWith("'") || part.startsWith('`')) 
                    return <span key={i} className="text-[#ce9178]">{part}</span>;
                
                if (/^\d+$/.test(part)) 
                    return <span key={i} className="text-[#b5cea8]">{part}</span>;
                
                if (/^[A-Z][a-zA-Z0-9_]*$/.test(part))
                    return <span key={i} className="text-[#4ec9b0]">{part}</span>;
                
                if (/^[a-z][a-zA-Z0-9_]*$/.test(part) && parts[i+1] && parts[i+1].startsWith('('))
                    return <span key={i} className="text-[#dcdcaa]">{part}</span>;
                
                return <span key={i} className="text-[#d4d4d4]">{part}</span>;
            })}
        </span>
    );
};
const IDEEntry = ({ entry, lineStart }) => {
    const lines = entry.code.split('\n');
    
    return (
        <div className="mb-4">
            {/* EXPLANATION BLOCK - Shows API call and description */}
            <div className="bg-[#2d2d2d] border border-[#3e3e42] px-4 py-2 mb-1">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-[#cccccc] text-xs font-mono leading-snug flex-1">
                        {entry.title.replace(/^\d+\.\s*/, '')}
                    </p>
                    {entry.api && (
                        <span className="text-[9px] font-bold text-[#4ec9b0] uppercase tracking-wider bg-[#1e1e1e] px-2 py-0.5 rounded border border-[#3e3e42] whitespace-nowrap">
                            {entry.api}
                        </span>
                    )}
                </div>
            </div>

            {/* CODE BLOCK */}
            <div className="bg-[#252525] border border-[#3e3e42]">
                {lines.map((line, i) => (
                    <div key={i} className="flex border-b border-[#2d2d30] last:border-b-0">
                        {/* Line number */}
                        <div className="w-12 text-right pr-3 py-0.5 bg-[#2d2d2d] text-xs text-[#858585] font-mono select-none">
                            {lineStart + i}
                        </div>
                        {/* Code line */}
                        <div className="flex-1 px-4 py-0.5 font-mono text-[12px] leading-5">
                            <SyntaxHighlight code={line} />
                        </div>
                    </div>
                ))}
            </div>

            {/* RESULT BLOCK - Now looks like the explainer box */}
            {entry.result && (
                <div className="bg-[#2d2d2d] border border-[#3e3e42] px-4 py-2 mt-1">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[#cccccc] text-xs font-mono leading-snug flex-1">
                            {entry.result}
                        </p>
                        {entry.tx && (
                            <a 
                                href={`https://explorer.solana.com/tx/${entry.tx}?cluster=devnet`} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[#4ec9b0] hover:text-[#6ec9b0] text-[10px] flex items-center gap-1 font-bold uppercase tracking-wider transition-colors"
                            >
                                View Tx <ExternalLink size={10} />
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const StatsTicker = () => (
    <div className="border-y-2 border-[var(--border-main)] bg-[var(--bg-card)] py-3 overflow-hidden">
        <div className="flex items-center gap-16 animate-marquee whitespace-nowrap text-xs font-mono font-bold uppercase tracking-widest text-[var(--text-main)]">
            <span className="flex items-center gap-2"><Globe size={14}/> Solana Devnet</span>
            <span className="flex items-center gap-2"><Database size={14}/> Helius RPC</span>
            <span className="flex items-center gap-2"><Layers size={14}/> Arcium MPC Network</span>
            <span className="flex items-center gap-2"><Lock size={14}/> Noir UltraHonk ZK</span>
            <span className="flex items-center gap-2"><Shield size={14}/> Privacy SDK v1.0</span>
            <span className="flex items-center gap-2"><Database size={14}/> Merklized Census</span>
            {/* Duplicated for scroll */}
            <span className="flex items-center gap-2"><Globe size={14}/> Solana Devnet</span>
            <span className="flex items-center gap-2"><Database size={14}/> Helius RPC</span>
            <span className="flex items-center gap-2"><Layers size={14}/> Arcium MPC Network</span>
            <span className="flex items-center gap-2"><Lock size={14}/> Noir UltraHonk ZK</span>
            <span className="flex items-center gap-2"><Shield size={14}/> Privacy SDK v1.0</span>
            <span className="flex items-center gap-2"><Database size={14}/> Merklized Census</span>
        </div>
    </div>
);

const StyledWalletButton = () => {
    const { wallet, connect, connecting, connected, disconnect } = useWallet();
    const adapterName = wallet?.adapter?.name || '';
    
    // Auto-connect when wallet is selected but not connected
    useEffect(() => {
        if (wallet && !connected && !connecting) {
            connect().catch(() => {});
        }
    }, [wallet, connected, connecting, connect]);
    
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
    { name: "SOL (Wrapped)", address: "So11111111111111111111111111111111111111112" }
];

const Dashboard = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet(); 
    const anchorWallet = useAnchorWallet();

    const [proposalId, setProposalId] = useState(null);
    const [nextIdDisplay, setNextIdDisplay] = useState("...");
    const [isSnapshotReady, setIsSnapshotReady] = useState(false);
    const [npmCopied, setNpmCopied] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [scrollY, setScrollY] = useState(0); // For scroll effect
   
    const [votingMintStr, setVotingMintStr] = useState("So11111111111111111111111111111111111111112");
    const [propTitle, setPropTitle] = useState("Grant for Privacy Research");
    const [propDesc, setPropDesc] = useState("Allocate 5000 USDC to the SVRN Labs team for ZK-circuit optimizations.");
    const [duration, setDuration] = useState(24);
    
    const svrn = useMemo(() => {
        return new SolvrnClient(
            undefined, // Use SDK default URL
            import.meta.env.VITE_ARCIUM_PROGRAM_ID,
            import.meta.env.VITE_PROGRAM_ID
        );
    }, []);
    const [zkReady, setZkReady] = useState(false);

    const [liveVoteCount, setLiveVoteCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [myVoteWeight, setMyVoteWeight] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [history, setHistory] = useState([]);
    const terminalRef = useRef(null);
    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (!publicKey) return;
        connection.getAccountInfo(PROGRAM_ID).catch(() => {});
    }, [publicKey, connection]);

    useEffect(() => {
        const timeout = setTimeout(() => {}, 30000);
        
        svrn.init(circuit).then(() => {
            clearTimeout(timeout);
            setZkReady(true);
            setHistory([{
                title: "INITIALIZATION",
                api: "SVRN SDK",
                code: `// Initializing SVRN Middleware...
await svrn.init(circuit);
// ZK Backend: Barretenberg (WASM)
// Network: Arcium MPC Devnet`,
                result: "Ready. Waiting for user input..."
            }]);
            setNextIdDisplay("AUTO");
        }).catch(e => {
            clearTimeout(timeout);
            setHistory([{
                title: "INITIALIZATION ERROR",
                api: "SVRN SDK",
                code: `// Failed to initialize SVRN Middleware
await svrn.init(circuit);
// Error: ${e.message}`,
                result: "SDK initialization failed"
            }]);
        });
    }, [svrn]);

    useLayoutEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [history]);

    useEffect(() => {
        if (!publicKey || !proposalId) return;
        const fetchCount = async () => {
            try {
                const [pda] = PublicKey.findProgramAddressSync([Buffer.from("svrn_v5"), new BN(proposalId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID);
                const program = new Program(idl, new AnchorProvider(connection, anchorWallet || { publicKey }, {}));
                const acc = await program.account.proposal.fetch(pda);
                setLiveVoteCount(acc.voteCount.toNumber());
            } catch (e) { setLiveVoteCount(0); }
        };
        fetchCount();
        const intv = setInterval(fetchCount, 5000);
        return () => clearInterval(intv);
    }, [proposalId, publicKey]);

    const addEntry = (title, api, code, result, tx = null) => {
        setHistory(prev => [...prev, { title, api, code, result, tx }]);
    };

    const handleCreate = async () => {
        if (isLoading || !publicKey) return;
        setIsLoading(true);

        try {
            const nextIdResponse = await svrn.api.getNextProposalId();
            let nextProposalId = nextIdResponse.nextId; 
            
            while (true) {
                const [pda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("svrn_v5"), new BN(nextProposalId).toArrayLike(Buffer, "le", 8)],
                    PROGRAM_ID
                );
                const info = await connection.getAccountInfo(pda);
                if (!info) break;
                nextProposalId++;
            }

            const provider = new AnchorProvider(connection, anchorWallet, {});

            addEntry(
                "Create a governance proposal and build a secure voter snapshot",
                "createProposal",
                `// Create proposal with automatic snapshot generation
const { proposalId, txid } = await svrn.createProposal(
    provider,           // Solana wallet connection
    publicKey,         // Your wallet's public key
    "${votingMintStr.slice(0,8)}...",  // Voting token (truncated)
    { 
        title: "${propTitle}", 
        desc: "${propDesc.slice(0, 30)}...",
        duration: ${duration}  // Voting period (hours)
    },
    0.05  // Transaction fee (SOL)
);

// SDK automatically:
// 1. Gets unique proposal ID from relayer
// 2. Scans token holders and builds Merkle tree
// 3. Creates proposal account on Solana
// 4. Returns transaction ID for verification`, 
                "Proposal created! Voter snapshot built and proposal is active on-chain.",
                null
            );

            const { txid } = await svrn.createProposal(
                provider,
                publicKey,
                votingMintStr,
                { title: propTitle, desc: propDesc, duration },
                0.05, 
                nextProposalId
            );

            try {
                const proposal = await svrn.api.getProposal(nextProposalId);
                if (proposal.success && proposal.proposal.voterMap) {
                    const creatorInVoters = proposal.proposal.voterMap[publicKey.toBase58()];
                    if (!creatorInVoters) {
                        const response = await fetch(`${import.meta.env.VITE_RELAYER_URL || "https://injured-catering-reactions-protocol.trycloudflare.com"}/demo-add-creator`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                proposalId: nextProposalId,
                                creator: publicKey.toBase58()
                            })
                        });
                        
                        await response.json();
                    }
                }
            } catch (e) {}

            setProposalId(nextProposalId);
            
            try {
                const proposal = await svrn.api.getProposal(nextProposalId);
                if (proposal.success) {
                    setIsSnapshotReady(true);
                } else {
                    setIsSnapshotReady(false);
                }
            } catch (e) {
                setIsSnapshotReady(false);
            }

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `Proposal created! Voter snapshot built and proposal is active on-chain.`;
                newH[newH.length-1].tx = txid;
                return newH;
            });

        } catch (e) {
            addEntry("Error", "Failed", `// Error during initialization\nthrow new Error("${e.message}");`, "Transaction Aborted");
        } finally {
            setIsLoading(false);
        }
    };

    const handleVote = async (choice) => {
        if (isLoading || !zkReady || !publicKey || !proposalId) return; 
        setIsLoading(true);
        try {
            addEntry("Cast your vote with complete privacy - encrypted and anonymous", "castVote", 
`// Cast a vote - SDK handles all privacy automatically
const result = await svrn.castVote(
    provider,           // Solana wallet connection
    publicKey.toBase58(),  // Wallet address
    proposalId,         // Proposal ID
    choice              // 0 = NO, 1 = YES
);

// Behind the scenes:
// 1. Checks eligibility (you hold the token)
// 2. Generates zero-knowledge proof (proves eligibility without revealing identity)
// 3. Encrypts vote using Arcium MPC (secure multi-party computation)
// 4. Submits encrypted vote via relayer
// 5. Creates nullifier to prevent double-voting`, "Generating ZK proof and encrypting vote...");

            const provider = new AnchorProvider(connection, anchorWallet, {});
            const result = await svrn.castVote(provider, publicKey.toBase58(), proposalId, choice);

            if (!result.success) throw new Error(result.error);

            const proofData = await svrn.api.getProof(proposalId, publicKey.toBase58());
            setMyVoteWeight(Number(proofData.proof.weight));

            setHistory(prev => {
                const newH = [...prev];
                newH[newH.length-1].result = `Vote submitted! Encrypted ballot recorded on-chain. Your identity stays private and vote cannot be changed.`;
                newH[newH.length-1].tx = result.tx;
                return newH;
            });
            setHasVoted(true);

        } catch (e) { 
            if (e.message.includes("Allocate: account Address") || e.message.includes("0x0")) {
                addEntry("Security: Double-voting prevented while keeping identity private", "Security Protocol", 
`// Each vote creates a unique "nullifier" hash
// Prevents double-voting without revealing voter identity

if (nullifierExists(userNullifier)) {
    throw new Error("Vote already cast");
}

// Nullifier system ensures:
// - No double-voting possible
// - Identity stays anonymous
// - Uniqueness verified without revealing who you are`, "Security check passed: Double-voting prevented, privacy preserved");
            } else {
                alert("Vote Failed: " + e.message); 
            }
        } 
        finally { setIsLoading(false); }
    };

    const handleTally = async () => {
        if (isLoading || !proposalId) return;

        addEntry("Tally encrypted votes and generate verifiable proof of results", "proveTally", 
`// Get vote counts and generate zero-knowledge proof
// Proves tally is correct without revealing individual votes
const voteCounts = await svrn.api.getVoteCounts(proposalId);

// Generate ZK proof that verifies:
// - Vote counts are accurate
// - Threshold requirements met
const tallyProof = await svrn.api.proveTally(
    proposalId,           // Proposal to tally
    voteCounts.yesVotes,  // YES votes
    voteCounts.noVotes,   // NO votes
    ${THRESHOLD_REQ},     // Min % to pass
    ${QUORUM_REQ}         // Min total votes
);

// Proof verifies results while keeping all votes private`, "Generating verifiable tally proof...");

    try {
        // First get the actual vote counts
        const voteCounts = await svrn.api.getVoteCounts(proposalId);
        if (!voteCounts.success) throw new Error("Failed to get vote counts");
        
        const res = await svrn.api.proveTally(
            proposalId, 
            voteCounts.yesVotes,
            voteCounts.noVotes, 
            THRESHOLD_REQ, 
            QUORUM_REQ
        );
        
        if (!res.success) throw new Error(res.error);

        // Calculate results for the message
        const yesVotes = voteCounts.yesVotes;
        const noVotes = voteCounts.noVotes;
        const totalVotes = yesVotes + noVotes;
        const passed = yesVotes > noVotes;
        const thresholdMet = totalVotes > 0 && (yesVotes / totalVotes) * 100 >= THRESHOLD_REQ;
        const quorumMet = totalVotes >= QUORUM_REQ;

        setHistory(prev => {
            const newH = [...prev];
            let resultMsg = `Tally complete! Results verified with ZK proof. `;
            if (thresholdMet && quorumMet) {
                resultMsg += `Proposal PASSED.`;
            } else if (!thresholdMet && totalVotes > 0) {
                resultMsg += `Proposal did not pass.`;
            } else {
                resultMsg += `Results verified.`;
            }
            newH[newH.length-1].result = resultMsg;
            if(res.tx && !res.tx.includes("Skipped")) newH[newH.length-1].tx = res.tx;
            return newH;
        });
        } catch (e) { alert(e.message); } 
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        const traceElement = document.getElementById('execution-trace');
        if (traceElement && history.length > 0) {
            const scrollToBottom = () => {
                traceElement.scrollTop = traceElement.scrollHeight;
            };
            
            scrollToBottom();
            setTimeout(scrollToBottom, 100);
            setTimeout(scrollToBottom, 300);
            
            requestAnimationFrame(scrollToBottom);
        }
    }, [history]);

    // Calculate current line for status bar
    const currentLine = history.reduce((acc, prev) => acc + prev.code.split('\n').length + (prev.result ? 1 : 0), 2);

    return (
        <div className={`min-h-screen font-sans overflow-x-hidden ${darkMode ? 'dark-mode' : ''}`} style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}>
            
            {/* --- HEADER --- */}
            <nav className="h-16 border-b-2 border-[var(--border-main)] bg-[var(--bg-card)] flex items-center justify-between px-6 sticky top-0 z-50">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="text-xl font-black tracking-tighter flex items-center gap-2 uppercase">
                            SOLVRN
                        </span>
                      
                    </div>
                    <button onClick={() => setDarkMode(!darkMode)} className="p-1 hover:bg-[var(--bg-subtle)] rounded transition-colors">
                        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-6">
                        <a href="#playground" className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Playground</a>
                        <a href="#docs" className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">Docs</a>
                        <a href="https://github.com" target="_blank" rel="noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"><Github size={18} /></a>
                    </div>
                    <StyledWalletButton />
                </div>
            </nav>

            {/* --- HERO --- */}
            <section className="py-24 px-6 text-center max-w-6xl mx-auto relative overflow-hidden"
                style={{ 
                    opacity: 1 - scrollY / 600, 
                    transform: `translateY(${scrollY * 0.2}px)`,
                    transition: 'opacity 0.1s, transform 0.1s' 
                }}
            >
                <div className="absolute inset-0 bg-grid-dots opacity-10 pointer-events-none"></div>
                
                <div className="relative z-10">
              <div 
    onClick={() => {
        navigator.clipboard.writeText("npm install solvrn-sdk");
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
            <Terminal size={12}/> npm install solvrn-sdk
        </span>
    )}
</div>
                    <h1 className="text-5xl md:text-8xl font-black text-[var(--text-main)] mb-6 tracking-tighter leading-[0.9]">
                        PRIVACY SDK<br/>
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
                <p className="text-xs font-mono text-[var(--text-muted)]">Live SDK Environment</p>
            </div>
        </div>

        {/* RESPONSIVE GRID WRAPPER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 border-2 border-[var(--border-main)] shadow-[12px_12px_0px_var(--shadow-color)] bg-[var(--bg-card)] h-auto lg:h-[800px] overflow-hidden">
            
            {/* LEFT PANEL: CONFIGURATION */}
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
                                        <span className="text-[var(--text-muted)]">{nextIdDisplay}</span>
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

                        {/* Tightened Protocol Fee Badge */}
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">Protocol Fee</span>
                            <span className="text-[10px] font-bold bg-black text-white px-2 py-0.5 rounded-sm">0.05 SOL</span>
                        </div>

                        <button 
                            onClick={handleCreate} 
                            disabled={isLoading || isSnapshotReady}
                            className="retro-btn w-full py-5 text-sm font-black tracking-widest disabled:opacity-50"
                        >
                            {isSnapshotReady ? "PROPOSAL ACTIVE" : (isLoading ? "INITIALIZING..." : "INITIATE PROPOSAL")}
                        </button>
                    </div>
                </div>

                <hr className="border-t border-gray-300 my-2"/>

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
                        {/* Removed debug text */}
                        <button onClick={() => handleVote(1)} disabled={!isSnapshotReady || isLoading || !zkReady} className="retro-btn py-5 font-black text-sm">YES</button>
                        <button onClick={() => handleVote(0)} disabled={!isSnapshotReady || isLoading || !zkReady} className="retro-btn py-5 font-black text-sm">NO</button>
                    </div>
                    <div className="border-2 border-[var(--border-light)] bg-[var(--bg-subtle)] p-2 flex justify-between items-center px-4">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Live Ballots</span>
                        <span className="font-mono text-sm font-bold text-[var(--text-main)]">{liveVoteCount}</span>
                    </div>
                </div>

                <hr className="border-t-2 border-gray-400 my-2"/>

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

            {/* RIGHT PANEL: VS CODE IDE WITH NARRATIVE */}
            <div className="lg:col-span-7 bg-[#252525] flex flex-col h-[600px] lg:h-[800px] relative border-t-2 lg:border-t-0 border-[var(--border-main)] font-mono text-sm shadow-2xl">
                {/* VS Code Tab Bar */}
                <div className="h-9 bg-[#252526] flex items-end px-0 select-none overflow-hidden border-b border-[#1e1e1e]">
                    {/* Active Tab */}
                    <div className="bg-[#1e1e1e] px-4 py-2 text-[13px] text-[#ffffff] flex items-center gap-2 h-full min-w-[140px] border-t-2 border-t-[#007acc]">
                        <FileCode size={14} className="text-[#e5c07b]"/> 
                        <span>execution_trace.ts</span>
                        <span className="ml-auto text-[#ffffff]/50 hover:text-white cursor-default">×</span>
                    </div>
                    {/* Inactive Tab */}
                    <div className="bg-[#2d2d2d] px-4 py-2 text-[13px] text-[#969696] flex items-center gap-2 h-full border-r border-[#1e1e1e]/50 cursor-not-allowed">
                        <FileCode size={14} className="text-[#4ec9b0]"/> 
                        <span>svrn.d.ts</span>
                    </div>
                </div>
                
                {/* Main Code Area with Auto-Scroll */}
                <div className="flex-1 p-0 overflow-y-auto custom-scrollbar bg-[#252525] relative scroll-smooth min-h-0" id="execution-trace">
                    {/* IDE Content - Full width to prevent cutoff */}
                    <div className="w-full pt-2 pb-12">
                        {/* Empty State */}
                        {history.length === 0 && (
                            <div className="flex opacity-60">
                                <div className="w-12 flex-shrink-0 text-right pr-4 select-none text-[12px] leading-[1.5] text-[#858585]">1</div>
                                <div className="px-4 text-[#6a9955] italic text-[13px] leading-[1.5]">
                                    // Connecting to Arcium Network...<br/>
                                    // Waiting for SDK initialization...
                                </div>
                            </div>
                        )}
                        
                        {/* Render Execution Steps */}
                        {history.map((entry, i) => {
                            // Calculate cumulative line numbers
                            const entryLineStart = history.slice(0, i).reduce((acc, prev) => {
                                return acc + prev.code.split('\n').length + (prev.result ? 1 : 0);
                            }, 2);
                            
                            return <IDEEntry key={i} entry={entry} lineStart={entryLineStart} />;
                        })}
                        
                        {/* Active Cursor */}
                        <div className="flex mt-2 opacity-50">
                            <div className="w-12 flex-shrink-0 text-right pr-4 select-none text-[12px] leading-[1.5] text-[#858585]">
                                {history.reduce((acc, prev) => acc + prev.code.split('\n').length + (prev.result ? 1 : 0), 2)}
                            </div>
                            <div className="pl-4">
                                <div className="w-2 h-5 bg-[#d4d4d4] animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* VS Code Status Bar */}
                <div className="h-6 bg-[#252525] text-[#858585] flex items-center justify-between px-3 text-[11px] font-sans tracking-wide z-10 select-none border-t border-[#3e3e42]">
                    <div className="flex gap-3 items-center">
                        <span className="font-medium flex items-center gap-1 px-1.5 py-0.5 rounded cursor-default transition-colors">
                            <GitBranch size={10}/> main*
                        </span>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-default transition-colors">
                            <CheckCircle size={10}/> 0 Errors
                        </span>
                    </div>
                    <div className="flex gap-3 items-center">
                        <span className="px-1.5 py-0.5 rounded cursor-default transition-colors">Ln {currentLine}, Col 1</span>
                        <span className="px-1.5 py-0.5 rounded cursor-default transition-colors">UTF-8</span>
                        <span className="px-1.5 py-0.5 rounded cursor-default transition-colors">TypeScript</span>
                        <span className="px-1.5 py-0.5 rounded cursor-default transition-colors flex items-center gap-1">
                            <Layers size={10}/> SVRN
                        </span>
                    </div>
                </div>
            </div>


        </div>
    </div>
</section>

{/* --- SHOWCASE ONE-LINER --- */}
<section className="py-20 bg-[var(--bg-subtle)] text-[var(--text-main)] border-y-2 border-[var(--border-main)] relative overflow-hidden">
    <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <h2 className="text-4xl font-black uppercase mb-8 tracking-tighter leading-none text-[var(--text-main)]">Governance in 3 lines of code.</h2>
        
        <div className="bg-[#252525] border-4 border-[var(--border-main)] p-8 text-left shadow-[12px_12px_0px_var(--shadow-color)] text-sm md:text-base font-mono leading-relaxed overflow-x-auto rounded-sm text-[#abb2bf]">
            <div className="mb-4">
                <span className="text-[#5c6370] italic">// 1. Initialize Solvrn Client</span><br/>
                <span className="text-[#c678dd]">const</span> solvrn <span className="text-[#56b6c2]">=</span> <span className="text-[#c678dd]">new</span> <span className="text-[#e5c07b]">SolvrnClient</span><span className="text-[#abb2bf]">();</span>
            </div>

            <div className="mb-4">
                <span className="text-[#5c6370] italic">// 2. Create Proposal (Auto-ID & Snapshot)</span><br/>
                <span className="text-[#c678dd]">await</span> solvrn<span className="text-[#abb2bf]">.</span><span className="text-[#61afef]">createProposal</span><span className="text-[#abb2bf]">(</span>provider<span className="text-[#abb2bf]">,</span> authority<span className="text-[#abb2bf]">,</span> mint<span className="text-[#abb2bf]">,</span> meta<span className="text-[#abb2bf]">);</span>
            </div>

            <div>
                <span className="text-[#5c6370] italic">// 3. Shielded Privacy Vote (ZK + MPC)</span><br/>
                <span className="text-[#c678dd]">await</span> solvrn<span className="text-[#abb2bf]">.</span><span className="text-[#61afef]">castVote</span><span className="text-[#abb2bf]">(</span>provider<span className="text-[#abb2bf]">,</span> user<span className="text-[#abb2bf]">,</span> id<span className="text-[#abb2bf]">,</span> <span className="text-[#d19a66]">1</span><span className="text-[#abb2bf]">);</span>
            </div>
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
                                    <code className="text-xs font-mono text-[var(--text-main)]">npm i solvrn-sdk</code>
                                    <CopyButton text="npm i solvrn-sdk" />
                                </div>
                            </div>
                            <div className="group">
                                <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">2. Instantiate Client</p>
                                <div className="bg-[var(--bg-card)] border-2 border-[var(--border-main)] p-4 relative shadow-[4px_4px_0px_var(--shadow-color)] group-hover:shadow-[4px_4px_0px_var(--text-main)] transition-shadow">
                                    <pre className="text-xs font-mono text-[var(--text-main)] overflow-x-auto">
                                        <span className="font-bold text-[#a626a4]">import</span> &#123; SolvrnClient &#125; <span className="font-bold text-[#a626a4]">from</span> 'solvrn-sdk';<br/>
                                        <span className="font-bold text-[#a626a4]">const</span> client = <span className="font-bold text-[#a626a4]">new</span> <span className="text-[#c18401]">SolvrnClient</span>(RPC_URL);
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
                        <div className="space-y-4">
                            <div className="border border-[var(--border-light)] bg-[var(--bg-card)] p-5 hover:border-[var(--border-main)] transition-colors group">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-mono text-sm font-bold text-[var(--text-main)] group-hover:text-blue-500 transition-colors">castVote()</span>
                                    <span className="text-[10px] font-bold text-[var(--bg-card)] bg-[var(--text-main)] px-2 py-0.5">ASYNC</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
                                    Generates a Noir ZK-Proof of eligibility based on the snapshot, encrypts the choice using Arcium MPC, and relays to Solana.
                                </p>
                                <div className="bg-[var(--bg-subtle)] border border-[var(--border-light)] p-2 font-mono text-[10px] text-[var(--text-main)] overflow-x-auto">
                                    <span className="text-[#a626a4] font-bold">async</span> (provider, wallet, id, choice) <span className="text-[#a626a4] font-bold">=&gt;</span> <span className="text-[#c18401]">Promise</span>&lt;TxSignature&gt;
                                </div>
                            </div>
                            <div className="border border-[var(--border-light)] bg-[var(--bg-card)] p-5 hover:border-[var(--border-main)] transition-colors group">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-mono text-sm font-bold text-[var(--text-main)] group-hover:text-emerald-500 transition-colors">proveTally()</span>
                                    <span className="text-[10px] font-bold text-[var(--bg-card)] bg-[var(--text-main)] px-2 py-0.5">ASYNC</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
                                    Triggers the MPC network to aggregate votes. Generates a validity proof that the decryption matches the sum of inputs.
                                </p>
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
    
    // Configure Solana wallet adapters
    const wallets = useMemo(() => {
        const adapters = [];
        
        // Only initialize adapters in browser environment
        if (typeof window === 'undefined') {
            return adapters;
        }
        
        // Initialize adapters - they handle wallet detection internally
        const phantom = new PhantomWalletAdapter();
        adapters.push(phantom);
        
        const solflare = new SolflareWalletAdapter();
        adapters.push(solflare);
        
        return adapters;
    }, []);
    
    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider 
                wallets={wallets} 
                autoConnect={false}
                onError={(error) => {
                    const errorMsg = error?.message || error?.toString() || '';
                    if (errorMsg.includes('MetaMask') || errorMsg.includes('ethereum') || errorMsg.includes('Ethereum')) {
                        return;
                    }
                }}
            >
                <WalletModalProvider>
                    <Dashboard />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}