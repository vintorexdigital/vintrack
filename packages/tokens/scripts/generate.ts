import { mkdirSync, writeFileSync } from 'node:fs';
import { toCss, toNativeTheme, toTailwindTheme } from '../src/css.js';

mkdirSync('css', { recursive: true });
writeFileSync('css/tokens.css', toCss());
writeFileSync('css/tailwind.css', toTailwindTheme());
writeFileSync('css/native-theme.ts', toNativeTheme());
console.log('tokens generated');
