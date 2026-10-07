# 0020 Help desk and assets

Status: accepted

## Tickets
- Anyone raises a ticket for themselves (category: IT, HR, admin, facilities, finance, other). The people who work the desk hold `helpdesk.ticket.assign`: they see the whole queue, assign, change status, reply, and add **internal notes** the requester never sees.
- **Deadlines** come from company settings by priority (first reply and resolution, in hours) and are fixed at creation; changing priority recalculates them. The `check-ticket-sla` job reports each missed deadline **once** (assignee, or administrators when unassigned) and raises a `ticket.sla_breached` event workflows can act on. Resolved tickets nobody reopens are closed after a setting (default 7 days).
- The requester can reword a ticket until someone picks it up, reply, close it, reopen it for 14 days after resolution, and rate it 1 to 5. Managers read their reportees' tickets but do not speak on them.
- Visibility follows data scope (`tickets` are owned by the requester), like any other employee record.

## Assets
Equipment (laptop, phone, vehicle, ID card, furniture) with a serial, who has it now, and the full history. Assign, take back with a condition (good → in stock, needs repair → repair, lost → retired), repair and back. Retired assets are frozen. Anyone sees their own assets; the company list is for administrators only.

## Not built
Email-in (tickets from an inbox), attachments on tickets, canned replies, knowledge base, ticket merging, business hours for deadlines (deadlines run on the clock), asset depreciation, maintenance schedules, barcode scanning.
