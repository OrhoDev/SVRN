use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub struct InputValues {
        v1: u64, // Credits (Voting Power)
        v2: u64, // Choice (1 = Yes)
    }

    #[instruction]
    // Linear Voting: weight = credits (1 credit = 1 vote)
    // Returns: Enc<Shared, u64> (decrypted on output via .reveal())
    pub fn add_together(input_ctxt: Enc<Shared, InputValues>) -> Enc<Shared, u64> {
        let input = input_ctxt.to_arcis();
        
        // Apply Choice Filter
        // If they voted YES (1), they contribute their credits.
        // If NO (0), they contribute 0.
        let result = if input.v2 == 1 { input.v1 } else { 0 };

        // Reveal (decrypts on output)
        // The .reveal() call ensures it is decrypted by the nodes before writing to Solana
        let encrypted_result = input_ctxt.owner.from_arcis(result);
        encrypted_result.reveal()
    }
}