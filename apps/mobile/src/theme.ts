import { useColorScheme } from 'react-native';

/** Subset of packages/tokens (Ink, Slate, Paper, Petrol, Marigold) the app uses. Keep in step with native-theme.ts there. */
const light = { canvas: '#F6F7F3', surface: '#FFFFFF', rule: '#E2E5DF', ink: '#17212B', muted: '#52606D', live: '#F2A516', onLive: '#17212B', brand: '#0F5E73', onBrand: '#FFFFFF', present: '#1B7F45', absent: '#C8372D', late: '#B8501F', pending: '#2B6CB0' };
const dark: typeof light = { canvas: '#0E171E', surface: '#15212A', rule: '#27363F', ink: '#E8EDF1', muted: '#A7B4BF', live: '#F2A516', onLive: '#17212B', brand: '#5BBAD3', onBrand: '#06222B', present: '#4FC083', absent: '#F0786E', late: '#EE8D5F', pending: '#6CAEEA' };

export type Palette = typeof light;
export const usePalette = (): Palette => (useColorScheme() === 'dark' ? dark : light);
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
/** Touch targets are never smaller than 48 dp. */
export const TOUCH = 48;
