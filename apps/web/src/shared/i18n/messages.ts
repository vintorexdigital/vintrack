/** Launch languages: English, Tamil and Hindi. Missing keys fall back to English, never to a blank. */
export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'hi', label: 'हिन्दी' },
] as const;
export type Locale = (typeof LOCALES)[number]['code'];

const en = {
  'nav.home': 'Home', 'nav.feed': 'Activity feed', 'nav.people': 'People', 'nav.employees': 'Employees', 'nav.teams': 'Teams', 'nav.orgchart': 'Org chart',
  'nav.time': 'Time', 'nav.attendance': 'Attendance', 'nav.dailylog': 'Daily log', 'nav.register': 'Monthly register', 'nav.regularizations': 'Regularizations',
  'nav.leave': 'Leave', 'nav.requests': 'Requests', 'nav.calendar': 'Calendar', 'nav.balances': 'Balances', 'nav.field': 'Field', 'nav.geofences': 'Geo-fences',
  'nav.admin': 'Admin', 'nav.settings': 'Settings', 'nav.myattendance': 'My attendance', 'nav.myleave': 'My leave', 'nav.profile': 'Profile',
  'nav.organization': 'Organization', 'nav.timeattendance': 'Time and attendance', 'nav.security': 'Security',
  'action.punchin': 'Punch in', 'action.punchout': 'Punch out', 'action.signout': 'Sign out', 'action.save': 'Save changes', 'action.create': 'Create', 'action.cancel': 'Cancel',
  'action.export': 'Export', 'action.search': 'Search', 'action.add': 'Add', 'action.delete': 'Delete', 'action.restore': 'Restore', 'action.apply': 'Apply',
  'mode.manager': 'Manager', 'mode.employee': 'Employee', 'status.punchedin': 'Punched in', 'status.punchedout': 'Punched out', 'status.onbreak': 'On break',
  'common.loading': 'Loading', 'common.noresults': 'Nothing matches those filters', 'common.language': 'Language', 'common.theme': 'Theme',
  'common.more': 'More', 'common.menu': 'Menu', 'common.collapse': 'Collapse sidebar', 'common.expand': 'Expand sidebar', 'common.modules': 'All modules',
} as const;

export type MessageKey = keyof typeof en;

const ta: Partial<Record<MessageKey, string>> = {
  'nav.home': 'முகப்பு', 'nav.feed': 'செயல்பாடு', 'nav.people': 'நபர்கள்', 'nav.employees': 'ஊழியர்கள்', 'nav.teams': 'குழுக்கள்', 'nav.time': 'நேரம்',
  'nav.attendance': 'வருகை', 'nav.dailylog': 'தினசரி பதிவு', 'nav.register': 'மாதாந்திர பதிவேடு', 'nav.regularizations': 'சரிசெய்தல் கோரிக்கைகள்', 'nav.leave': 'விடுப்பு',
  'nav.requests': 'கோரிக்கைகள்', 'nav.calendar': 'நாட்காட்டி', 'nav.balances': 'இருப்பு', 'nav.field': 'களப்பணி', 'nav.admin': 'நிர்வாகம்', 'nav.settings': 'அமைப்புகள்',
  'nav.myattendance': 'என் வருகை', 'nav.myleave': 'என் விடுப்பு', 'nav.profile': 'சுயவிவரம்',
  'action.punchin': 'வருகை பதிவு', 'action.punchout': 'புறப்பாடு பதிவு', 'action.signout': 'வெளியேறு', 'action.save': 'மாற்றங்களைச் சேமி', 'action.create': 'உருவாக்கு',
  'action.cancel': 'ரத்து செய்', 'action.export': 'ஏற்றுமதி', 'action.search': 'தேடு', 'action.add': 'சேர்', 'action.delete': 'நீக்கு', 'action.restore': 'மீட்டெடு', 'action.apply': 'விண்ணப்பி',
  'mode.manager': 'மேலாளர்', 'mode.employee': 'ஊழியர்', 'status.punchedin': 'வருகை பதிவானது', 'status.punchedout': 'புறப்பாடு பதிவானது', 'status.onbreak': 'இடைவேளையில்',
  'common.loading': 'ஏற்றுகிறது', 'common.language': 'மொழி', 'common.theme': 'தோற்றம்', 'common.more': 'மேலும்', 'common.menu': 'பட்டி',
};

const hi: Partial<Record<MessageKey, string>> = {
  'nav.home': 'होम', 'nav.feed': 'गतिविधि', 'nav.people': 'लोग', 'nav.employees': 'कर्मचारी', 'nav.teams': 'टीमें', 'nav.time': 'समय',
  'nav.attendance': 'उपस्थिति', 'nav.dailylog': 'दैनिक लॉग', 'nav.register': 'मासिक रजिस्टर', 'nav.regularizations': 'नियमितीकरण अनुरोध', 'nav.leave': 'छुट्टी',
  'nav.requests': 'अनुरोध', 'nav.calendar': 'कैलेंडर', 'nav.balances': 'शेष', 'nav.field': 'फ़ील्ड', 'nav.admin': 'एडमिन', 'nav.settings': 'सेटिंग्स',
  'nav.myattendance': 'मेरी उपस्थिति', 'nav.myleave': 'मेरी छुट्टी', 'nav.profile': 'प्रोफ़ाइल',
  'action.punchin': 'पंच इन', 'action.punchout': 'पंच आउट', 'action.signout': 'साइन आउट', 'action.save': 'बदलाव सहेजें', 'action.create': 'बनाएँ',
  'action.cancel': 'रद्द करें', 'action.export': 'निर्यात', 'action.search': 'खोजें', 'action.add': 'जोड़ें', 'action.delete': 'हटाएँ', 'action.restore': 'बहाल करें', 'action.apply': 'आवेदन करें',
  'mode.manager': 'मैनेजर', 'mode.employee': 'कर्मचारी', 'status.punchedin': 'पंच इन', 'status.punchedout': 'पंच आउट', 'status.onbreak': 'ब्रेक पर',
  'common.loading': 'लोड हो रहा है', 'common.language': 'भाषा', 'common.theme': 'थीम', 'common.more': 'और', 'common.menu': 'मेनू',
};

export const CATALOGS: Record<Locale, Partial<Record<MessageKey, string>>> = { en, ta, hi };
export const translate = (locale: Locale, key: MessageKey): string => CATALOGS[locale][key] ?? en[key];
