export interface ProofData {
  index: number;
  balance: number;
  weight: number;
  secret: string;
  leaf: string;
  path: string[];
  root: string;
}

export interface EncryptedVote {
  ciphertext: Uint8Array;
  nonce: number[];
  public_key: number[];
}

export interface VoteProof {
  proof: Uint8Array;
  publicInputs: string[];
}

export interface SubmitVoteResponse {
  success: boolean;
  tx?: string;
  error?: string;
}

export interface SnapshotResponse {
  success: boolean;
  root: string;
  count: number;
}

export interface ProofResponse {
  success: boolean;
  proof: ProofData;
}

export interface TallyProofResponse {
  success: boolean;
  proof: string;
  msg: string;
}
