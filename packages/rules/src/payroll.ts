/* Payroll maths: pure, shared by the API and tests. Simplified on purpose; see ADR 0019 for what is and is not covered. */

export interface SalaryStructure {
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowance: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  /** Fixed monthly professional tax. */
  professionalTax: number;
  /** Fixed monthly deductions (loan instalment, advance recovery). */
  otherDeductions: number;
}

export interface PayslipInput {
  structure: SalaryStructure;
  /** Days in the pay cycle. */
  cycleDays: number;
  /** Days paid: present, paid leave, weekly offs and holidays, less policy deductions, within the employment period. */
  payableDays: number;
  /** Overtime, paid at the hourly rate of basic. 0 disables. */
  overtimeHours?: number;
}

export interface Line { code: string; label: string; amount: number }
export interface Payslip {
  earnings: Line[];
  deductions: Line[];
  employerContributions: Line[];
  gross: number;
  totalDeductions: number;
  net: number;
  payableDays: number;
  cycleDays: number;
  lopDays: number;
  /** Things the person running payroll should look at. */
  warnings: string[];
}

export const PF_RATE = 0.12;
/** Monthly wage ceiling on which provident fund is contributed unless the company pays on full basic. */
export const PF_WAGE_CEILING = 15000;
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;
/** ESI applies only when monthly gross is at or below this. */
export const ESI_GROSS_LIMIT = 21000;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One month's pay for one person. Pay is prorated by payable days; statutory items follow the usual Indian rules in simplified form. */
export function computePayslip(i: PayslipInput): Payslip {
  const s = i.structure;
  const warnings: string[] = [];
  const days = Math.max(0, Math.min(i.payableDays, i.cycleDays));
  if (i.payableDays > i.cycleDays) warnings.push('Payable days exceed the days in the cycle.');
  const f = i.cycleDays > 0 ? days / i.cycleDays : 0;
  const earned = (v: number) => r2(v * f);
  const earnings: Line[] = [
    { code: 'BASIC', label: 'Basic', amount: earned(s.basic) },
    { code: 'HRA', label: 'House rent allowance', amount: earned(s.hra) },
    { code: 'SPECIAL', label: 'Special allowance', amount: earned(s.specialAllowance) },
    { code: 'OTHER', label: 'Other allowances', amount: earned(s.otherAllowance) },
  ].filter((l) => l.amount > 0 || l.code === 'BASIC');
  if ((i.overtimeHours ?? 0) > 0 && s.basic > 0) {
    const hourly = s.basic / i.cycleDays / 8;
    earnings.push({ code: 'OT', label: `Overtime (${i.overtimeHours} h)`, amount: r2(hourly * 2 * i.overtimeHours!) });
  }
  const gross = r2(earnings.reduce((a, l) => a + l.amount, 0));
  const basicEarned = earnings.find((l) => l.code === 'BASIC')!.amount;

  const deductions: Line[] = [];
  const employer: Line[] = [];
  if (s.pfEnabled) {
    const wage = Math.min(basicEarned, PF_WAGE_CEILING);
    const pf = Math.round(wage * PF_RATE);
    if (pf > 0) {
      deductions.push({ code: 'PF', label: 'Provident fund (employee)', amount: pf });
      employer.push({ code: 'PF_ER', label: 'Provident fund (employer)', amount: pf });
    }
  }
  if (s.esiEnabled) {
    if (gross <= ESI_GROSS_LIMIT && gross > 0) {
      deductions.push({ code: 'ESI', label: 'State insurance (employee)', amount: Math.ceil(gross * ESI_EMPLOYEE_RATE) });
      employer.push({ code: 'ESI_ER', label: 'State insurance (employer)', amount: Math.ceil(gross * ESI_EMPLOYER_RATE) });
    } else if (gross > ESI_GROSS_LIMIT) warnings.push(`State insurance is switched on but gross pay is above ${ESI_GROSS_LIMIT}, so none was taken.`);
  }
  if (s.professionalTax > 0 && gross > 0) deductions.push({ code: 'PT', label: 'Professional tax', amount: s.professionalTax });
  if (s.otherDeductions > 0 && gross > 0) deductions.push({ code: 'OTHER_DED', label: 'Other deductions', amount: s.otherDeductions });
  const totalDeductions = r2(deductions.reduce((a, l) => a + l.amount, 0));
  const net = r2(gross - totalDeductions);
  if (net < 0) warnings.push('Deductions are more than the pay for this month.');
  if (days === 0) warnings.push('No payable days in this cycle.');
  return { earnings, deductions, employerContributions: employer, gross, totalDeductions, net: Math.max(0, net), payableDays: days, cycleDays: i.cycleDays, lopDays: r2(i.cycleDays - days), warnings };
}
