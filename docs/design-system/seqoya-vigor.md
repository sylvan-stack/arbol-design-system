---
role: derived
---
# Seqoya Vigor

Vigor ranks each Subscription on its current weekly allowance when available. Otherwise, use the current allowance matching the saved reference token cost, then the Kimi Code monthly quota or MiMo Token Plan where available, then any current monthly or other timed allowance. A live deadline comes from the earlier of the reported reset and expiry. Pay-as-you-go API balances are postponed. An account waiting for a confirmed current allowance shows that the input is unavailable.

The formula header shows `Vigor = a₁ × D + a₂ × T + a₃ × Q + a₄ × L + a₅ × U`. The list shows Subscription identity and the selected window, then Quota Dash, User Score, Time Left, Potential Loss, Available Tokens, and Vigor. Size columns from collapsed content and scroll horizontally when needed. Display Dash activated! in bold green and Off in normal text on weekly rows. Show a dash for other windows. Time Left uses days and hours or hours and minutes. Show potential loss in the configured currency when the saved estimate uses it, and show output-token equivalents in K below one million and M from one million onward. Emphasize the Vigor value with larger bold type. Activate a row or its disclosure control to show its deadline, raw inputs, factors, normalized weights, contributions and arithmetic. Keep the previous rows visible during refresh. The saved Radar result follows SGM-1.

| Variable | Factor | Default weight |
| --- | --- | ---: |
| D | Quota Dash is 1 for a marked weekly window and 0 otherwise. | 51 |
| T | Time urgency is 1 minus hours left divided by the selected window’s full duration, bounded to 0–1. The factor is unavailable when the duration is unknown. | 20 |
| Q | Available equivalents divided by available equivalents plus the token scale. | 12 |
| L | Potential quota loss divided by potential loss plus the loss scale, in the configured currency. | 10 |
| U | Saved user score on a 0–1 scale with a neutral 0.5 default. | 7 |

Configure formula saves the raw weights, scales and loss currency for the installation. Each coefficient divides its raw weight by the sum of weights. Weights must be nonnegative with a positive sum. Both scales must be positive. The starting scales are 400,000 output-token equivalents and USD 6. Use defaults restores the draft values. Save applies changes, and Cancel or Escape closes the editor.

Expanded details show **Total tokens per window** for the selected allowance in millions, using the same full output-token-equivalent estimate as its Subscription card. Display the total beside the calculation for reference. The formula uses the available balance for its token factor.

Potential loss multiplies the selected window’s remaining equivalents by its matching saved reference token cost estimate. The calculation details show the rate per million with two decimal places, its saved price and allowance derivation, and the arithmetic from the row’s available equivalents to the estimated loss. Weekly rates from the Subscription card use 52/12 weeks per month as their price basis. Fractional readouts use two decimal places. Token counts in the table, calculations and pricing basis use the same K/M notation. Calculations and editable settings retain full precision. The monetary factor requires a matching currency. A missing factor contributes zero and stays visibly unavailable in the breakdown.

An active weekly window can be marked or dismissed locally. The choice applies to that Subscription and window end. Automatically mark when an available reset with known weekly scope expires during the current window or during the first half of the next. Show the reason on the control.

Configure formula also saves three optional **Automatic Quota Dash** thresholds. Blank fields turn their rules off. A weekly window with known unused allowance qualifies when any configured threshold is met or exceeded. Required pace uses the fraction of weekly quota remaining divided by the fraction of the week remaining, expressed in weekly Mach. Potential weekly loss uses the estimated monetary value of the remaining weekly equivalents. Projected monthly ETC uses the configured currency and is quoted per million equivalents. Show matching names next to the mark and measured values and thresholds in the expanded row. The manual decision governs that window and its existing matches remain inspectable.

The monthly ETC rule uses an editable, local forecast on each Subscription. Save the actual billing start and renewal, total period charge and currency, equivalents already used, and expected additional equivalents through renewal. ETC is the charge divided by the combined usage, expressed per million. A positive charge with zero projected usage gives an unbounded cost. Expired forecasts and forecasts in a different currency cannot trigger the rule. The row displays the saved period and inputs. Automatic rules apply to the current window; the Next available projection uses reset expiry at the future renewal.

An exhausted allowance scores zero unless a marked weekly window has a known eligible reset ready. For exhausted allowances with a scheduled renewal, Next available projects the same formula using a fresh window, its estimated full quota and corresponding potential loss, and any automatic weekly mark that still qualifies. Show projected inputs and arithmetic in the expanded row. Terminal rows display Expires and omit a renewal projection. Manual marks apply to their selected weekly window.

The **Pages / Seqoya / Vigor** stories use fictional accounts and support disclosure, scoring settings and manual marks. They show Kimi Code and MiMo beside weekly plans and a postponed API balance. They cover an exhausted renewal, exhausted terminal expiry, a priced short allowance with an active monthly allowance, missing duration, a row matching all three thresholds, and refresh failure.
