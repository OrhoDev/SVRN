"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const web3_js_2 = require("@solana/web3.js");
const client_2 = require("@arcium-hq/client");
const fs = __importStar(require("fs"));
const dotenv_2 = __importDefault(require("dotenv"));
dotenv_2.default.config();
async function main() {
    const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
    const connection = new web3_js_2.Connection(RPC_URL, "confirmed");
    // Load relayer keypair
    const keypairData = JSON.parse(fs.readFileSync('./relayer-keypair.json', 'utf-8'));
    const owner = web3_js_2.Keypair.fromSecretKey(new Uint8Array(keypairData));
    const wallet = new anchor.Wallet(owner);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    // Arcium program ID
    const PROGRAM_ID = new web3_js_2.PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
    // Load Arcium IDL
    const arciumIdl = JSON.parse(fs.readFileSync('./arcium_idl.json', 'utf-8'));
    const program = new anchor.Program(arciumIdl, provider);
    console.log("🔧 Reinitializing Computation Definition...");
    console.log("   RPC:", RPC_URL);
    console.log("   Wallet:", owner.publicKey.toBase58());
    console.log("   Program:", PROGRAM_ID.toBase58());
    // Get computation definition PDA
    const baseSeedCompDefAcc = (0, client_2.getArciumAccountBaseSeed)("ComputationDefinitionAccount");
    const offset = (0, client_2.getCompDefAccOffset)("add_together");
    const compDefPDA = web3_js_2.PublicKey.findProgramAddressSync([baseSeedCompDefAcc, PROGRAM_ID.toBuffer(), offset], (0, client_2.getArciumProgramId)())[0];
    const mxeAccount = (0, client_2.getMXEAccAddress)(PROGRAM_ID);
    console.log("   CompDef PDA:", compDefPDA.toBase58());
    console.log("   MXE Account:", mxeAccount.toBase58());
    // Check current state
    const compDefInfo = await connection.getAccountInfo(compDefPDA);
    if (!compDefInfo) {
        console.log("❌ Computation definition doesn't exist!");
        return;
    }
    console.log("   Current data length:", compDefInfo.data.length, "bytes");
    console.log("   Finalization byte:", compDefInfo.data[8]);
    // Try calling initAddTogetherCompDef to reinitialize
    console.log("\n📝 Calling initAddTogetherCompDef...");
    try {
        const modifyComputeUnits = web3_js_2.ComputeBudgetProgram.setComputeUnitLimit({
            units: 600000,
        });
        const tx = await program.methods
            .initAddTogetherCompDef()
            .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount: mxeAccount,
        })
            .preInstructions([modifyComputeUnits])
            .signers([owner])
            .rpc();
        console.log("✅ Transaction sent:", tx);
        // Wait a bit and check
        await new Promise(r => setTimeout(r, 3000));
        const updatedInfo = await connection.getAccountInfo(compDefPDA);
        if (updatedInfo) {
            console.log("   Updated data length:", updatedInfo.data.length, "bytes");
            console.log("   Updated finalization byte:", updatedInfo.data[8]);
            if (updatedInfo.data[8] !== 0) {
                console.log("✅ Computation definition is now finalized!");
            }
            else {
                console.log("⚠️ Still not finalized - may need circuit upload");
            }
        }
    }
    catch (e) {
        console.log("❌ Error:", e.message);
        if (e.logs) {
            console.log("Logs:", e.logs.slice(0, 10));
        }
    }
}
main().catch(console.error);
