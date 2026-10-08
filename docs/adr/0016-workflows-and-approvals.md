# 0016 Workflow engine and multi-level approvals

Status: accepted

## Two mechanisms, on purpose
1. **Approval levels for leave, regularizations and expenses** (`approvals.*_levels` settings, 1 to 3). The direct manager approves first, then their manager, and so on up the reporting line. Each approval is recorded (`approval_steps`); only the last one finishes the request; anyone can reject at their level. With 1 level (the default) nothing changes from before. The number of levels is fixed for a request when its first decision is made, so changing the setting never changes requests in flight. A person with a company-wide approval scope, or an owner, may step in at any level; that is recorded as an override. If the chain is shorter than the setting, the request needs only as many levels as there are managers. Expenses can ask for one extra level above an amount.
2. **Workflows** for everything else: *when* an event happens, *only if* conditions hold, *then* run steps. Steps: notify, create a task, wait, call a web address, ask for approval. An approval step stops the run until one of the named people decides; a rejection ends it. This is how a company adds, for example, a finance sign-off on large claims on top of the manager's.

Keeping them apart keeps the common case (a longer approval chain) a setting, not a program.

## How workflows run
- Triggered from the transactional outbox, in the same relay that builds the feed and notifications. A run is unique per workflow and event, so a re-delivered event never runs twice. The steps are copied onto the run, so editing a workflow does not change runs in flight.
- Events a workflow causes (a task it creates) are tagged and never start workflows, so there are no loops and no depth to reason about. Consequence: workflows cannot be chained through events.
- Conditions are a list that must all hold (and, no or). The language is deliberately small: compare, contains, in, exists, over `payload.*` and the person's details.
- Placeholders `{{employee.name}}` and `{{payload.amount}}` are substituted as text. Nothing is evaluated.
- Waiting runs resume from the `run-workflows` job (every minute): delays are minute-accurate at best.
- A failing step fails its run (kept, with the reason) and never the event for other handlers.

## Webhook safety
The address is company-supplied, so the server could be pointed at its own network. Calls must be https, the host and every address it resolves to must be public, redirects are not followed, the call times out in 5 s. Every call is signed (`x-trackrex-signature`, HMAC-SHA256 of the body with a per-company key admins can read). **Known limit:** the name is resolved once to check and again to connect; run the worker with egress rules that block private ranges too.

## Not built
Branching (if/else) and loops inside a workflow, chaining workflows, retries of a failed step, a test-run button, schedule triggers (every Monday), triggers on custom data, approval escalation when nobody answers, delegation while on leave.
