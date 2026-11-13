---
role: derived
---
# Editable subscription cards

This layout supersedes the earlier allowance metrics table in the Seqoya chapter.

Each card shows its subscription name. Edit appears on heading hover or keyboard focus and stays visible on touch devices. Use InlineRename with the displayed name, Save/Enter, Cancel/Escape, 1–256 Unicode code points on one line, a saving state and retained text with an error on refusal. Native saving updates the Driver label. Default vendor labels retain familiar provider headings; custom names appear as entered.

Normalize allowance types and order them as 5h, week, month, other. Each section begins with a centered, small separator label: 5 hours, 7 days, a month, other. Separate provider scopes remain separate windows even when their durations match.

The first section component is a remaining-capacity bar. Remaining occupies its left in the main color; Used occupies its right in the secondary color. Put the remaining and used percentages at the matching ends. Unknown shares remain neutral and are never zero-filled.

Below the bar, show Time remaining. Its hover and keyboard-focus tooltip gives Resets at in local 24-hour format, plus expiration where applicable. Then show output-token equivalents used, output-token equivalents remaining and remaining equivalents per hour. Pending start and renewal states keep their meaning; the rate begins after the period starts. Keep available limit resets at the card bottom.

Kimi's reported quota ratios and normalized limits do not encode token counts in thousands or millions. The earlier calls conversion is invalid. Calibrate a reference output capacity from recorded model output and quota-share movement in the same reset window, preserving both observations, identity, model and substituted arithmetic. Label quantities as estimates and expose their basis with the figures.

Sources: maintained InlineRename and Tooltip; the original provider quota windows; Kimi's [quota schema](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html) and [credit rules](https://www.kimi.com/en/help/membership/membership-update-rules).
