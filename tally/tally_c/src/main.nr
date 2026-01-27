fn main(
    yes_votes: pub u64,
    no_votes: pub u64,
    threshold_percent: pub u64
) {
    let total_votes = yes_votes + no_votes;

    // 1. Sanity Check: Ensure there is at least one vote
    assert(total_votes > 0);

    // 2. Majority Check
    // We cast to u128 to perform the multiplication safely.
    // Integers support >=, Fields do not.
    let lhs = (yes_votes as u128) * 100;
    let rhs = (total_votes as u128) * (threshold_percent as u128);

    assert(lhs >= rhs);
}