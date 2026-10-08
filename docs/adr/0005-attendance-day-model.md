# ADR 0005: How a punch belongs to an attendance day

**Decision.** Each shift has a timezone and a start time. The attendance date of an instant is the local date whose window `[start - 4h, next start - 4h)` contains it, so a night shift that crosses midnight belongs to one day and an early arrival still belongs to its own shift. Worked time pairs punches into sessions and subtracts break time; lateness is measured against the shift's latest allowed punch-in; overtime is time beyond the shift end.

A day that has not finished and has no activity is **not** recorded as absent: nothing is stored until the shift window has passed. Approved leave, holidays and weekly offs still show immediately.

Status resolution order is fixed and tested: not joined, override, holiday, non-working day, leave (full or half), presence, pending regularization, absent. The policy engine then adjusts the base outcome rule by rule and records a plain-language explanation for every change. Published policy versions are immutable; the latest published version whose start date is on or before the day applies.

**Consequences.** Re-running policies for a range is deterministic and previewable (the preview runs inside a savepoint and rolls back). Late-mark ordinals depend on earlier days in the cycle, so range re-runs go in date order.
