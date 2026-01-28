fn main(
    yes_votes: pub u64,
    no_votes: pub u64,
    majority_threshold_percent: pub u64, // e.g., 50 for 50%
    quorum_requirement: pub u64          // Minimum total votes required
) {
    let total_votes = yes_votes + no_votes;

    // 1. QUORUM CHECK
    // The total voting power participating must meet the DAO's minimum.
    assert(total_votes >= quorum_requirement);

    // 2. MAJORITY CHECK
    // Does (Yes / Total) * 100 >= Threshold?
    // We cast to u128 to prevent overflow during multiplication.
    // We use cross-multiplication to avoid division (floating point) issues.
    // Logic: Yes * 100 >= Total * Threshold
    
    let lhs = (yes_votes as u128) * 100;
    let rhs = (total_votes as u128) * (majority_threshold_percent as u128);

    assert(lhs >= rhs);
}