"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const client_1 = require("@arcium-hq/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ARCIUM_ID = new web3_js_1.PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS");
const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
async function main() {
    console.log("🔍 Checking cluster offset...");
    console.log("   MXE Program ID:", ARCIUM_ID.toString());
    console.log("   RPC:", RPC_URL);
    console.log("");
    const mxeAccount = (0, client_1.getMXEAccAddress)(ARCIUM_ID);
    const mxeInfo = await connection.getAccountInfo(mxeAccount);
    if (!mxeInfo) {
        console.log("❌ MXE account not found!");
        return;
    }
    console.log("✅ MXE account exists");
    // Try common cluster offsets
    const commonOffsets = [0, 1, 456, 100, 200, 300, 400, 500];
    console.log("\nChecking cluster offsets:");
    for (const offset of commonOffsets) {
        const clusterPda = (0, client_1.getClusterAccAddress)(offset);
        const clusterInfo = await connection.getAccountInfo(clusterPda);
        if (clusterInfo) {
            console.log(`   ✅ Offset ${offset}: ${clusterPda.toString()} (${clusterInfo.data.length} bytes)`);
        }
    }
}
main().catch(console.error);
