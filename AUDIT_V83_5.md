# Operational audit — V83.5

## Critical consistency issue addressed
The previous completion flow changed a trip's final fare after the order transition had already calculated commission, provider payout, and settlement values. It also marked cash payment paid without refreshing the payment amount. The completion flow now recalculates the fare first, reloads the versioned order, transitions using that final price, and updates the cash payment to the final agreed amount.

## Regression coverage
The trip-completion test now verifies that the order's final price, commission, provider payout, and payment amount/status all agree with the final fare.
