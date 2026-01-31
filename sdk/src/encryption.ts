import { getMXEPublicKey, RescueCipher, x25519 } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import { AnchorProvider } from "@coral-xyz/anchor";

export class SvrnEncryption {
    private programId: PublicKey;

    constructor(programId: string = process.env.ARCIUM_PROGRAM_ID || "DBCtofDd6f3U342nwz768FXbH6K5QyGxZUGLjFeb9JTS") {
        this.programId = new PublicKey(programId);
    }

    async encryptVote(provider: AnchorProvider, voteChoice: number, votingWeight: number) {
        let mxePublicKey = null;
        let attempts = 0;
        
        while (!mxePublicKey && attempts < 20) {
            try {
                mxePublicKey = await getMXEPublicKey(provider, this.programId);
                if (mxePublicKey) break;
            } catch (err) {}
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!mxePublicKey) throw new Error("Arcium MXE Public Key not found.");

        const ephemeralSecret = x25519.utils.randomSecretKey();
        const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
        const sharedSecret = x25519.getSharedSecret(ephemeralSecret, mxePublicKey);
        const cipher = new RescueCipher(sharedSecret);

        const inputs = [BigInt(votingWeight), BigInt(voteChoice)];
        const nonce = x25519.utils.randomSecretKey().slice(0, 16);
        const encrypted = cipher.encrypt(inputs, nonce);

        return {
            ciphertext: Buffer.from(new Uint8Array(encrypted.flat().map((n: number | bigint) => Number(n)))),
            nonce: Array.from(nonce),
            public_key: Array.from(ephemeralPublic)
        };
    }
}