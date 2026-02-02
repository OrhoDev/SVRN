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
const web3_js_1 = require("@solana/web3.js");
const client_1 = require("@arcium-hq/client");
const fs = __importStar(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function main() {
    const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
    const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
    const keypairData = JSON.parse(fs.readFileSync('./relayer-keypair.json', 'utf-8'));
    const owner = web3_js_1.Keypair.fromSecretKey(new Uint8Array(keypairData));
    const wallet = new anchor.Wallet(owner);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const PROGRAM_ID = new web3_js_1.PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
    console.log("Finalizing Computation Definition...");
    console.log("   RPC:", RPC_URL);
    console.log("   Wallet:", owner.publicKey.toBase58());
    console.log("   Program:", PROGRAM_ID.toBase58());
    const baseSeedCompDefAcc = (0, client_1.getArciumAccountBaseSeed)("ComputationDefinitionAccount");
    const offset = (0, client_1.getCompDefAccOffset)("add_together");
    const compDefPDA = web3_js_1.PublicKey.findProgramAddressSync([baseSeedCompDefAcc, PROGRAM_ID.toBuffer(), offset], (0, client_1.getArciumProgramId)())[0];
    console.log("   CompDef PDA:", compDefPDA.toBase58());
    const compDefInfo = await connection.getAccountInfo(compDefPDA);
    if (!compDefInfo) {
        console.log("Computation definition doesn't exist!");
        return;
    }
    console.log("   Current data length:", compDefInfo.data.length, "bytes");
    console.log("   Finalization byte:", compDefInfo.data[8]);
    if (compDefInfo.data[8] !== 0) {
        console.log("Already finalized!");
        return;
    }
    console.log("\nUploading circuit...");
    const circuitPath = "../svrn_engine/build/add_together.arcis";
    if (!fs.existsSync(circuitPath)) {
        console.log("Circuit file not found:", circuitPath);
        return;
    }
    const rawCircuit = fs.readFileSync(circuitPath);
    console.log("   Circuit size:", rawCircuit.length, "bytes");
    try {
        await client_1.uploadCircuit(provider, "add_together", PROGRAM_ID, rawCircuit, true);
        console.log("Circuit uploaded and finalized!");
        const updatedInfo = await connection.getAccountInfo(compDefPDA);
        if (updatedInfo && updatedInfo.data[8] !== 0) {
            console.log("Verified: Computation definition is now finalized!");
        }
        else {
            console.log("Finalization byte still 0 - may need manual finalization");
        }
    }
    catch (e) {
        console.log("Error:", e.message);
        if (e.logs) {
            console.log("Logs:", e.logs.slice(0, 10));
        }
    }
}
main().catch(console.error);
