use dep::std;

fn main(
    user_secret: Field,           // Private: Secret key
    balance: u64,                 // Private: Wallet balance
    merkle_path: [Field; 3],      // Private: Merkle path (height 3)
    merkle_index: u32,            // Private: Leaf index in tree
    merkle_root: pub Field,       // Public: Root of eligibility snapshot
    proposal_id: pub Field        // Public: Proposal ID
) -> pub Field {                  // Output: Nullifier
    
    // 1. Compute Leaf: Pedersen Hash of (user_secret, balance)
    let balance_field = balance as Field;
    let leaf = std::hash::pedersen_hash([user_secret, balance_field]);
    
    // 2. Verify Merkle Inclusion Proof
    // Uses proper bit-based traversal (like Noir's merkle_insert example)
    // DEMO MODE: If merkle_root is 0, skip verification (for legacy proposals)
    let is_demo_mode = merkle_root == 0;
    if !is_demo_mode {
        let computed_root = compute_merkle_root(leaf, merkle_index as Field, merkle_path);
        assert(computed_root == merkle_root);
    }

    // 3. Nullifier Generation
    // Unique per user + proposal. Prevents double voting.
    std::hash::pedersen_hash([user_secret, proposal_id])
}

/// Compute Merkle root from leaf, index, and hash path
/// Based on Noir's merkle_insert example: https://github.com/noir-lang/noir/blob/b9b06c0e59e1fda40f64d10b9c0dc845fcf50393/test_programs/execution_success/merkle_insert/src/main.nr
fn compute_merkle_root<let N: u32>(leaf: Field, index: Field, hash_path: [Field; N]) -> Field {
    let index_bits: [u1; N] = index.to_le_bits();
    let mut current = leaf;
    for i in 0..N {
        let path_bit = index_bits[i] != 0;
        let (hash_left, hash_right) = if path_bit {
            (hash_path[i], current)
        } else {
            (current, hash_path[i])
        };
        current = std::hash::pedersen_hash([hash_left, hash_right]);
    }
    current
}