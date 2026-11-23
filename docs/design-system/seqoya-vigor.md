---
role: derived
---
# Seqoya Vigor

Vigor uses the current weekly allowance window. The formula header shows `Vigor = a₁ × D + a₂ × T + a₃ × Q + a₄ × L + a₅ × U`. The list keeps Subscription identity first and follows with Quota Dash, User Score, Time Left, Potential Weekly Loss, Available Tokens, and Vigor. Size columns from collapsed content and scroll horizontally when needed. Display Dash activated! in bold green and Off in normal text. Time Left uses days and hours or hours and minutes. Show weekly potential loss in the configured currency when the saved estimate matches it, and show available output-token equivalents in millions. Emphasize the Vigor value with larger bold type. Activate the row or its disclosure control to show the current weekly deadline, raw inputs, factors, normalized weights, contributions and arithmetic. Keep the previous rows visible during refresh. The saved Radar result follows SGM-1.

| Variable | Factor | Default weight |
| --- | --- | ---: |
| D | Quota Dash is 1 when marked and 0 otherwise. | 51 |
| T | Time urgency is 1 minus hours left divided by the full 168 hours, bounded to 0–1. | 20 |
| Q | Available weekly equivalents divided by available equivalents plus the token scale. | 12 |
| L | Potential weekly quota loss divided by potential loss plus the loss scale, in the configured currency. | 10 |
| U | Saved user score on a 0–1 scale with a neutral 0.5 default. | 7 |

Configure formula saves the raw weights, scales and loss currency for the installation. Each coefficient divides its raw weight by the sum of weights. Weights must be nonnegative with a positive sum. Both scales must be positive. The starting scales are 400,000 output-token equivalents and USD 6. Use defaults restores the draft values. Save applies changes, and Cancel or Escape closes the editor.

Potential loss multiplies remaining weekly equivalents by the matching saved reference token cost estimate. The calculation details show the rate per million with additional precision, its saved price and allowance derivation, and the arithmetic from the row’s available equivalents to the estimated loss. Weekly rates from the Subscription card use 52/12 weeks per month as their price basis. The monetary factor requires a matching currency. A missing factor contributes zero and stays visibly unavailable in the breakdown.

An active weekly window can be marked or dismissed locally. The choice applies to that Subscription and window end. Automatically mark when an available reset with known weekly scope expires during the current window or during the first half of the next. Show the reason on the control.

Configure formula also saves three optional **Automatic Quota Dash** thresholds. Blank fields turn their rules off. A weekly window with known unused allowance qualifies when any configured threshold is met or exceeded. Required pace uses the fraction of weekly quota remaining divided by the fraction of the week remaining, expressed in weekly Mach. Potential weekly loss uses the estimated monetary value of the remaining weekly equivalents. Projected monthly ETC uses the configured currency and is quoted per million equivalents. Show matching names next to the mark and measured values and thresholds in the expanded row. The manual decision governs that window and its existing matches remain inspectable.

The monthly ETC rule uses an editable, local forecast on each Subscription. Save the actual billing start and renewal, total period charge and currency, equivalents already used, and expected additional equivalents through renewal. ETC is the charge divided by the combined usage, expressed per million. A positive charge with zero projected usage gives an unbounded cost. Expired forecasts and forecasts in a different currency cannot trigger the rule. The row displays the saved period and inputs. Automatic rules apply to the current window; the Next available projection uses reset expiry at the future renewal.

An exhausted weekly window scores zero unless it is marked Quota Dash and a known eligible reset is usable. Its Next available score projects the same formula at the scheduled weekly renewal, using a fresh weekly window, the estimated full weekly quota and corresponding potential loss, and any automatic mark that still qualifies at the projected time. Show the projected inputs and arithmetic in the expanded row. Manual marks apply to their selected window.

The **Pages / Seqoya / Vigor** story uses fictional accounts and supports disclosure, scoring settings and manual marks. It includes a row matching all three thresholds, an exhausted row with a renewal projection, missing data and refresh failure.
