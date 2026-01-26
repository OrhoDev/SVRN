use dep::std;

fn main(
    user_secret: Field,           
    balance: Field,             
    merkle_path: [Field; 3],    
    merkle_index: Field,        
    merkle_root: pub Field,       
    proposal_id: pub Field        
) -> pub [Field; 3] { 
    
    // 1. Compute Leaf
    let leaf = std::hash::pedersen_hash([user_secret, balance]);
    
    // 2. Compute Root
    let index_bits: [u1; 3] = merkle_index.to_le_bits();
    let mut current = leaf;
    for i in 0..3 {
        let path_bit = index_bits[i] != 0;
        let (hash_left, hash_right) = if path_bit {
            (merkle_path[i], current)
        } else {
            (current, merkle_path[i])
        };
        current = std::hash::pedersen_hash([hash_left, hash_right]);
    }
    
    // Verification
    assert(current == merkle_root);

    // Nullifier
    let nullifier = std::hash::pedersen_hash([user_secret, proposal_id]);

    [leaf, current, nullifier]
}