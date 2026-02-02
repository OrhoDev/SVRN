import { getMXEPublicKey, RescueCipher, x25519 } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// Arcium MXE Program ID (deployed with arcium deploy)
const ARCIUM_MXE_ID = new PublicKey("DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS"); 

export const encryptVote = async (provider, voteChoice, realBalance) => {
  try {
    // Retry logic for MXE key (keygen might still be in progress)
    // The MXE account exists, but the public key isn't available until keygen completes
    // Keygen can take 2-5 minutes after initialization, so we retry for up to 6 minutes
    let mxePublicKey = null;
    let attempts = 0;
    const maxAttempts = 120; // 120 attempts × 3 seconds = 6 minutes total
    const retryDelayMs = 3000; // 3 seconds between attempts
    
    while (!mxePublicKey && attempts < maxAttempts) {
      try {
        mxePublicKey = await getMXEPublicKey(provider, ARCIUM_MXE_ID);
        if (mxePublicKey) {
          break;
        }
      } catch (err) {
        // Silent retry
      }
      if (!mxePublicKey && attempts < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
      attempts++;
    }
    
    if (!mxePublicKey) {
      throw new Error(
        `MXE Key not found after ${maxAttempts} attempts (${Math.floor(maxAttempts * retryDelayMs / 60000)} minutes). ` +
        `Keygen may still be in progress. ` +
        `Check status: cd svrn_engine && RPC_URL="..." yarn run check-keygen`
      );
    }

    const ephemeralSecret = x25519.utils.randomSecretKey();
    const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
    const sharedSecret = x25519.getSharedSecret(ephemeralSecret, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    // Map to Rust struct: v1 (Credits), v2 (Choice)
    const inputs = [
        BigInt(realBalance), 
        BigInt(voteChoice)
    ]; 
    
    const nonce = x25519.utils.randomSecretKey().slice(0, 16); 
    const encrypted = cipher.encrypt(inputs, nonce);
    
    return {
      ciphertext: Buffer.from(new Uint8Array(encrypted.flat().map(n => Number(n)))),
      nonce: Array.from(nonce),         
      public_key: Array.from(ephemeralPublic) 
    };
  } catch (err) {
    throw err;
  }
};