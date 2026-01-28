import { useState, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css'; // Assuming you copied the css too, or just use basic styles

// --- SDK IMPORTS ---
// 1. Import the Client
import { SvrnClient } from 'svrn-sdk'; 

// 2. Import Circuit (Passed to SDK init)
// Adjust path if needed depending on where you are running this
import circuit from '../circuit/target/circuit.json';

const TestDashboard = () => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Initialize SDK Instance
    const svrn = useMemo(() => new SvrnClient("http://localhost:3000"), []);

    const addLog = (msg) => setLogs(p => [...p, `> ${msg}`]);

    const handleSDKTest = async () => {
        if (!wallet) return addLog("Connect Wallet first.");
        setIsLoading(true);
        
        try {
            const proposalId = 287; // Ensure this matches an active proposal on Relayer
            const choice = 1;       // Yes

            addLog("1. Initializing SDK (WASM)...");
            await svrn.init(circuit);
            addLog("✅ SDK Initialized.");

            addLog("2. Casting Vote via SDK...");
            const provider = new AnchorProvider(connection, wallet, {});
            
            // --- THE MAGIC LINE ---
            // Replaces 100 lines of manual logic
            const result = await svrn.castVote(provider, wallet, proposalId, choice);
            // ---------------------

            if (result.success) {
                addLog(`✅ SUCCESS! Tx: ${result.tx}`);
                console.log("Transaction:", result.tx);
            } else {
                addLog(`❌ FAILED: ${result.error}`);
            }

        } catch (e) {
            console.error(e);
            addLog(`❌ CRITICAL ERROR: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ padding: 50, background: '#111', color: '#fff', minHeight: '100vh', fontFamily: 'monospace' }}>
            <h1>SVRN SDK Integration Test</h1>
            <div style={{ marginBottom: 20 }}>
                <WalletMultiButton />
            </div>

            <div style={{ border: '1px solid #333', padding: 20, borderRadius: 8, marginBottom: 20 }}>
                <h3>Action</h3>
                <button 
                    onClick={handleSDKTest} 
                    disabled={isLoading}
                    style={{ 
                        padding: '15px 30px', 
                        fontSize: '16px', 
                        background: isLoading ? '#555' : '#00ffbd', 
                        color: 'black',
                        border: 'none',
                        fontWeight: 'bold',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isLoading ? "RUNNING SDK..." : "TEST SDK VOTE FLOW"}
                </button>
            </div>

            <div style={{ border: '1px solid #333', padding: 20, borderRadius: 8, background: '#000' }}>
                <h3>Logs</h3>
                {logs.map((l, i) => (
                    <div key={i} style={{ color: l.includes('❌') ? 'red' : l.includes('✅') ? '#00ffbd' : '#aaa' }}>
                        {l}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function App() {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <TestDashboard />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}