# 0015 Custom task forms

Status: accepted

## Decision
- An admin builds a **template** (CRUD kit `form-templates`; questions are one validated JSON field with a form-builder editor in the web console). Question types: text, long text, number (min/max), yes/no, choose one, choose several, date, rating, photo. A question can be shown only when an earlier yes/no or choice question has a given answer.
- A template is **copied** onto a task (`task_forms`, one per task). Editing or archiving the template never changes forms already in use, so old answers always read against the questions that were asked.
- Templates attach automatically to new tasks of the types they list, or by hand on the task. A template can be required: the task cannot be completed until the form is submitted (`form_required`).
- The assignee saves drafts and submits. **One validator** (`validateAnswers` in `packages/rules/src/forms.ts`) is used by the API, the web form and the mobile form; the server runs it again regardless of the client.
- Photos are JPEGs uploaded to the person's own folder (`forms/<company>/<user>/<id>.jpg`), sealed like selfies (ADR 0013), and readable by the person and by managers who can see the task. Photo answers must be the caller's own uploads.
- Mobile works offline: answers (and photos) go through the same queue as punches, in order.

## Not built
Signature and location questions, calculated fields, forms on things other than tasks (visits, leads, customers), per-question permissions, answer reports and exports (answers appear in the company export and on the task).
