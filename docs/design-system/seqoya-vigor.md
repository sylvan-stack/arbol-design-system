---
role: derived
---
# Seqoya Vigor

Vigor shows one ranked row per Subscription with Quota Dash, potential weekly loss, user score and resulting Vigor. Refresh retains the last readable list while readings update. Missing weekly inputs stay visible as unavailable. The saved Radar result follows SGM-1.

An active weekly window can be marked or dismissed locally. The choice applies to that Subscription and window end. Automatically mark when an available reset with known weekly scope expires during the current window or during the first half of the next. A later expiry leaves the next window eligible when it opens. Show the reason on the control. Unused-quota thresholds are configurable in a later version.

Potential weekly loss multiplies remaining output-token equivalents by the matching saved weekly token cost. Mark it as estimated. Today's reference inherits the pricing assumptions of the Subscription card. Rank monetary amounts together when their currency is the same. Normalize comparable loss by the highest visible amount. The mean of normalized loss and the user score contributes up to 0.49. Quota Dash adds 0.51, placing a marked active weekly window above unmarked windows. Missing comparable loss contributes zero to the ranking while its display remains unavailable. Use the saved user score or the neutral 0.5 default.

The **Pages / Seqoya / Vigor** story uses fictional accounts and shows automatic and manual marks, zero and missing loss, and loading and refresh failure states.
