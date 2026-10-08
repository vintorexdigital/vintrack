export const money = (minor: number, cur: string): string => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(minor / 100);
