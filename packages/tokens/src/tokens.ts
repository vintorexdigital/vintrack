/**
 * Three layers: primitive (raw values), semantic (purpose), component. Components reference only
 * semantic or component tokens. Themes redefine semantic tokens only; white-label tenants override
 * only the --brand-* tokens (see validateBrandOverride).
 */
export const primitive = {
  ink: '#17212B',
  slate: '#52606D',
  paper: '#F6F7F3',
  white: '#FFFFFF',
  rule: '#E2E5DF',
  petrol: '#0F5E73',
  petrolHover: '#0C4B5C',
  petrolActive: '#0A3C4A',
  marigold: '#F2A516',
  green: '#1B7F45',
  red: '#C8372D',
  amber: '#9A6414',
  rust: '#B8501F',
  violet: '#6D5BD0',
  grey: '#6B7580',
  blue: '#2B6CB0',
  googleBlue: '#4285F4',
  googleBlueHover: '#1A73E8',
  googleBlueActive: '#174EA6',
  googleRed: '#EA4335',
  googleYellow: '#FBBC05',
  googleGreen: '#34A853',
} as const;

export type SemanticTokens = Record<string, string>;

/** Light theme: the default. Status colours are used as text only on Surface. */
export const semanticLight: SemanticTokens = {
  'color-canvas': primitive.paper,
  'color-surface': primitive.white,
  'color-rule': primitive.rule,
  'color-ink': primitive.ink,
  'color-muted': primitive.slate,
  'color-live': primitive.marigold,
  'color-on-live': primitive.ink,
  'brand-primary': '#1A73E8',
  'brand-primary-hover': '#174EA6',
  'brand-primary-active': '#153E85',
  'brand-on-primary': primitive.white,
  'brand-blue': primitive.googleBlue,
  'brand-red': primitive.googleRed,
  'brand-yellow': primitive.googleYellow,
  'brand-green': primitive.googleGreen,
  'status-present': primitive.green,
  'status-absent': primitive.red,
  'status-leave': primitive.amber,
  'status-late': primitive.rust,
  'status-holiday': primitive.violet,
  'status-non-working': primitive.grey,
  'status-pending': primitive.blue,
  'color-overlay': 'rgba(23, 33, 43, 0.45)',
  'shadow-overlay': '0 4px 16px -2px rgba(23, 33, 43, 0.12)',
};

export const semanticDark: SemanticTokens = {
  'color-canvas': '#0E171E',
  'color-surface': '#15212A',
  'color-rule': '#27363F',
  'color-ink': '#E8EDF1',
  'color-muted': '#A7B4BF',
  'color-live': primitive.marigold,
  'color-on-live': primitive.ink,
  'brand-primary': '#8AB4F8',
  'brand-primary-hover': '#AECBFA',
  'brand-primary-active': '#D2E3FC',
  'brand-on-primary': '#06222B',
  'brand-blue': '#8AB4F8',
  'brand-red': '#F28B82',
  'brand-yellow': '#FDD663',
  'brand-green': '#81C995',
  'status-present': '#4FC083',
  'status-absent': '#F0786E',
  'status-leave': '#E0A24A',
  'status-late': '#EE8D5F',
  'status-holiday': '#A99BF5',
  'status-non-working': '#9AA5B0',
  'status-pending': '#6CAEEA',
  'color-overlay': 'rgba(0, 0, 0, 0.6)',
  'shadow-overlay': '0 4px 16px -2px rgba(0, 0, 0, 0.5)',
};

export const semanticHighContrast: SemanticTokens = {
  ...semanticLight,
  'color-canvas': '#FFFFFF',
  'color-rule': '#17212B',
  'color-ink': '#000000',
  'color-muted': '#222B33',
  'brand-primary': '#0D47A1',
  'brand-primary-hover': '#002171',
  'brand-primary-active': '#000051',
  'brand-blue': '#0D47A1',
  'brand-red': '#B71C1C',
  'brand-yellow': '#F57F17',
  'brand-green': '#1B5E20',
  'status-present': '#0B5A2C',
  'status-absent': '#9B1C13',
  'status-leave': '#6B4300',
  'status-late': '#8A3410',
  'status-holiday': '#3F2FA0',
  'status-non-working': '#3F4850',
  'status-pending': '#154A84',
};

/** Layout, type and motion tokens shared by every theme. */
export const scale: SemanticTokens = {
  'radius-input': '4px',
  'radius-button': '6px',
  'radius-overlay': '10px',
  'radius-pill': '9999px',
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-6': '24px',
  'space-8': '32px',
  'sidebar-width-expanded': '264px',
  'sidebar-width-rail': '72px',
  'font-sans': "'Anek Latin Variable', 'Anek Tamil Variable', 'Anek Devanagari Variable', system-ui, sans-serif",
  'font-numeric': "'Anek Latin Variable', system-ui, sans-serif",
  'text-caption': 'clamp(0.75rem, 0.74rem + 0.05vw, 0.78rem)',
  'text-table': '0.8125rem',
  'text-body': 'clamp(0.875rem, 0.86rem + 0.1vw, 0.9375rem)',
  'text-section': '1rem',
  'text-page': 'clamp(1.125rem, 1rem + 0.5vw, 1.25rem)',
  'text-kpi': 'clamp(1.5rem, 1.3rem + 0.7vw, 1.75rem)',
  'motion-fast': '150ms',
  'motion-base': '200ms',
};

/** Status keys paired with their register letter code, never colour alone. */
export const statusKeys = ['present', 'absent', 'leave', 'late', 'holiday', 'non-working', 'pending'] as const;
export type StatusKey = (typeof statusKeys)[number];
