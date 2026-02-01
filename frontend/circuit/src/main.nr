use dep::std;

fn main(
    user_secret: Field,           
    balance: Field,
    weight: Field,              // <--- NEW INPUT
    merkle_path: [Field; 8],    
    merkle_index: Field,        
    merkle_root: pub Field,       
    proposal_id: pub Field        
) -> pub [Field; 3] { 
    
    // --- FEATURE 1: ZK QUADRATIC WEIGHTING ---
    // Instead of calculating sqrt, we VERIFY it.
    // 1. Ensure the user isn't lying about their weight.
    //    We check that weight^2 is not greater than the balance.
    //    We cast to u64 for safe integer comparison.
    assert((weight as u64 * weight as u64) <= balance as u64);

    // 2. Compute Leaf using the WEIGHT
    let leaf = std::hash::pedersen_hash([user_secret, weight]);
    
    // 3. Compute Root (Standard Merkle Verification)
    let index_bits: [u1; 8] = merkle_index.to_le_bits();
    let mut current = leaf;
    for i in 0..8 {
        let path_bit = index_bits[i] != 0;
        let (hash_left, hash_right) = if path_bit {
            (merkle_path[i], current)
        } else {
            (current, merkle_path[i])
        };
        current = std::hash::pedersen_hash([hash_left, hash_right]);
    }
    
    // 4. Verification
    assert(current == merkle_root);

    // 5. Nullifier
    let nullifier = std::hash::pedersen_hash([user_secret, proposal_id]);

    [leaf, current, nullifier]
}