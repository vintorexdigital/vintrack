export interface Article { slug: string; title: string; summary: string; category: string; body: string[] }

/** Help articles describe what exists today. Each paragraph beginning with "- " is rendered as a list item. */
export const ARTICLES: Article[] = [
  {
    slug: 'get-started', title: 'Set up your company in an afternoon', category: 'Getting started', summary: 'From sign-up to your first punch.',
    body: [
      'Sign up with your company name and your details. You get a free trial of every module and a company address you will use to sign in.',
      '- Add your work locations, departments and designations under Admin > Organization.',
      '- Review the default shift under Admin > Time and attendance, or create your own. Assign employees to it.',
      '- Add employees one by one or import them, then send invitations. Each person sets their own password.',
      '- Set holidays and weekly offs under Admin > Leave, then check the leave types match your policy.',
    ],
  },
  {
    slug: 'punching', title: 'How punching in and out works', category: 'Attendance', summary: 'What the app checks and what to do when a punch is refused.',
    body: [
      'Your shift decides where and how you can punch: which devices, from which networks or places, how early and how late.',
      'If a punch is refused the message says why, for example that you are outside the allowed area or too early. Ask your manager to adjust the shift or raise a regularization.',
      'Punches made without a connection are kept on the phone and sent later with the time they were made. Offline punches older than seven days need a regularization request.',
    ],
  },
  {
    slug: 'regularization', title: 'Fixing a missed punch with a regularization', category: 'Attendance', summary: 'Ask your manager to correct a day.',
    body: [
      'Open My attendance, pick the day and choose Request regularization. Say what the day should be and why.',
      'Your manager approves or rejects it. An approved request changes the day’s status and the register reflects it right away.',
      'Locked pay cycles cannot be changed. Ask HR to unlock the cycle first.',
    ],
  },
  {
    slug: 'policies', title: 'Attendance policies and re-runs', category: 'Attendance', summary: 'Late marks, minimum hours and how to apply a change safely.',
    body: [
      'A policy is a list of rules, such as late punch-in after a grace period, minimum hours for a full day, and what to do about a missing punch-out.',
      'Published policy versions are immutable. To change a rule, create a new version with a start date.',
      'Before re-running a policy over past days, use the preview. It shows which days would change and why, and nothing is saved until you confirm.',
    ],
  },
  {
    slug: 'leave', title: 'Applying for and approving leave', category: 'Leave', summary: 'Balances, restrictions and approvals.',
    body: [
      'Open My leave and choose Apply. Pick the type, the dates and a duration (full day or half day). You see your balance and any rule that blocks the request before you send it.',
      'Managers see requests from their reportees in Leave > Requests. Approve, reject with a reason, or cancel.',
      'Balances come from the leave type’s entitlement rules and the ledger of leave taken. HR can add an adjustment with a reason.',
    ],
  },
  {
    slug: 'field-tasks', title: 'Assigning tasks and checking in on site', category: 'Field', summary: 'For managers and for the people doing the visits.',
    body: [
      'Managers create a task under Field > Tasks, choose the customer and the person, and set a due time.',
      'The person opens My tasks, taps Start and check in at the customer, and Complete when finished, adding a short outcome. Their position is recorded with each step.',
      'If the person is further from the customer than your company allows, they get a warning or are stopped, depending on your Geo settings.',
    ],
  },
  {
    slug: 'location-privacy', title: 'Location tracking and privacy', category: 'Field', summary: 'What is recorded, when, and for how long.',
    body: [
      'Locations are recorded only between punch in and punch out. Anything sent outside that time is refused by the server.',
      'The mobile app shows when tracking is on. Admins can turn tracking off for the whole company, choose how often the app reports, and choose how long history is kept. Older points are deleted automatically.',
      'Managers see only people within their data scope. Location history is never shown to other employees.',
    ],
  },
  {
    slug: 'billing', title: 'Plans, seats and invoices', category: 'Billing', summary: 'Choose a plan, change seats, and pay.',
    body: [
      'Open Admin > Company settings > Plan and billing. During a trial, choose a plan and a seat count and an invoice is created straight away. Your company becomes active when it is paid.',
      'Changing the plan or seats later takes effect immediately and is billed from your next monthly invoice. You cannot set fewer seats than you have active employees.',
      'Invoices are issued monthly in advance. Indian companies are charged 18% GST. If an invoice stays unpaid you get a week’s grace, then the account is marked past due, and after thirty days it is suspended until the invoice is paid.',
    ],
  },
  {
    slug: 'support-access', title: 'Letting Vintorex support look into your account', category: 'Security', summary: 'Time-boxed, reasoned and audited.',
    body: [
      'Support staff cannot open your company unless you turn on support access under Admin > Security > Support access.',
      'When they do, they start a session with a stated reason and a time limit. A banner shows everyone in your company that it is active, and you can end it at any time.',
      'Support sessions cannot read business data such as attendance, leave or locations. Everything done in a session is audited.',
    ],
  },
  {
    slug: 'api', title: 'Using the API', category: 'Developers', summary: 'Authentication, errors and idempotency.',
    body: [
      'The REST API is documented in the API reference. Sign in to get an access token and send it as a Bearer token.',
      'Errors use RFC 9457 problem details with a stable code you can match on. Mobile and desktop sources must send an Idempotency-Key header on writes, so a retried request is never applied twice.',
      'List endpoints use cursor pagination and filters in the form filter[field][op]=value.',
    ],
  },
];
export const articleBySlug = (slug: string): Article | undefined => ARTICLES.find((a) => a.slug === slug);
