---
role: derived
---
# Editable subscription cards

This layout supersedes the earlier allowance metrics table in the Seqoya chapter.

Each card shows its subscription name. Edit appears on heading hover or keyboard focus and stays visible on touch devices. Use InlineRename with the displayed name, Save/Enter, Cancel/Escape, 1–256 Unicode code points on one line, a saving state and retained text with an error on refusal. Native saving updates the Driver label. Default vendor labels retain familiar provider headings; custom names appear as entered.

If a Driver cannot list its accounts, keep its last account cards visible with a stale label and suspend account actions. If there is no earlier list, show that Driver’s known default provider cards with an unavailable state. Only current accounts count as subscriptions. Render each available account as soon as its catalogue arrives, while dashboard readings load separately.

Normalize allowance types and order them as 5h, week, month, other. Each section begins with a centered, small separator label: 5 hours, 7 days, a month, other. Separate provider scopes remain separate windows even when their durations match.

The first section component is a remaining-capacity bar. Remaining occupies its left in the main color; Used occupies its right in the secondary color. Put the remaining and used percentages at the matching ends. Unknown shares remain neutral and are never zero-filled.

Below the bar, show Time remaining as a plain label. Only the value is the hover and keyboard-focus target for the tooltip giving Resets at in local 24-hour format, plus expiration where applicable; hovering the label or row gap shows no tooltip. Then show output-token equivalents used, output-token equivalents remaining and remaining equivalents per hour. Pending start and renewal states keep their meaning; the rate begins after the period starts. Keep available limit resets at the card bottom.

Read each subscription’s metrics from its confirmed Arbol Browser profile. The dashboard shortcut uses the same subscription ID and profile as refresh. A failed dashboard refresh shows its issue on the affected card and keeps the last reading while the binding still matches. A five-hour window that starts on use stays pending until the dashboard confirms ordinary use has started it. When a dashboard supplies both an API balance and plan windows, show both on the card.

Show **Total tokens per window** below Time remaining for each timed allowance. Use the calibrated full output-token-equivalent capacity or, for older records, the sum of known used and remaining equivalents for that window. Show the estimated total in millions, including for values below a million, and retain the estimate’s basis. Show Unavailable when the current or projected total is unknown. API balance sections omit this row.

Kimi's reported quota ratios and normalized limits do not encode token counts in thousands or millions. The earlier calls conversion is invalid. Calibrate a reference output capacity from recorded model output and quota-share movement in the same reset window, preserving both observations, identity, model and substituted arithmetic. Label quantities as estimates and expose their basis with the figures.

Sources: maintained InlineRename and Tooltip; the original provider quota windows; Kimi's [quota schema](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html) and [credit rules](https://www.kimi.com/en/help/membership/membership-update-rules).

A historical output-capacity estimate may explicitly use Plan reference mode for Claude or Codex. It is an approximation for the same configured subscription incarnation and reported plan, with its original model, observation date and arithmetic retained; a successful account check alone does not erase it. It can remain applicable to another remote account on that same plan, so its details must say Plan reference and disclose the workload assumption. Current used/remaining percentages always come from the current quota reading, independently of the capacity reference. Reject plan/incarnation changes, future observations and observations older than 28 days. Unmarked and other-provider references keep their stricter identity binding. Never relabel an old observation as fresh or rewrite its numerical operands to make it match.

When an allowance comes from a captured dashboard reading, the time tooltip identifies the source and observation time. A reset calculated from a rounded countdown shows an approximate remaining time and says Resets around. Use the newest valid observation for that subscription and window. Token equivalents retain their own arithmetic and provenance.

## Vigor calculations

An expanded row starts with **Used metrics**. Show the card’s allowance pace and time per window, token cost, performance, reset inventory, price with its period and source, and user score. Keep quota evidence and recorded activity available within this section.

On the Subscriptions card, Option-click the user score value or activate it from the keyboard to edit it inline. Focus and select the current value. Enter saves, Escape cancels, and the editor also offers Save and Cancel. Accept decimal values from 0 to 1 inclusive. Keep invalid input visible with a message. Persist the score per Driver and Subscription in the installation's Seqoya preferences and use it immediately for the card and Vigor. New subscriptions start at 0.5. API-billed accounts have no score editor.

**Calculations** begins with the estimated pace for each calibrated window and the effective token cost. A grant counts for a window when its scope and expiry are known and it can restore that window. With remaining equivalents `R`, full allowance `C`, hours left `H` and `N` grants, the total through the final modeled window is `R + N × C`. The pace required to redeem grant `i` after depletion is `(R + (i − 1) × C) / hours until its deadline`. Model overlapping calibrated windows independently and use their lowest projected pace.

For Codex, the deadline is the grant’s own expiry. Model a fresh usage window starting at each planned redemption. Use the greatest of the current-window pace `R / H`, the fresh-window pace `C / window hours` and each deadline’s pace. For a scoped Claude refill that keeps the plan’s scheduled end, bound redemption by that end and include `(R + N × C) / H` in the pace calculation. [Codex banked resets](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex) · [Claude limit resets](https://support.claude.com/en/articles/17007452-what-is-a-limit-reset)

Adjust token cost for modeled capacity gained over scheduled renewals. Each fixed-schedule refill counts as one full allowance. A restart counts the fraction of the usage period by which it brings the refill forward. Redeeming at the scheduled end adds no capacity over the ordinary renewal. Divide the card’s token cost by `1 + extra full allowances / baseline monthly allowances` for the pricing window.

Vigor averages the user score, adjusted pace divided by the highest pace, and the lowest positive token cost divided by adjusted token cost. Zero token cost receives the maximum cost factor. Multiply by the subscription’s monthly cost divided by the highest monthly cost. Use the same observed bounds across scored subscriptions and both reset scenarios. Show the score before and after resets, and show an unchanged result when the projection makes no difference. Normalize the price period and use the dated ECB rates for currency conversion. Display **Monthly cost = $200** for a $200 monthly plan. Performance remains visible as context. Show zero while an active allowance is exhausted, explain missing evidence and leave API billing out of numeric ranking.
