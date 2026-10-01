export * from './org.js';
export * from './employees.js';

import { businessUnits, costCenters, departments, designations, employeeTypes, employmentTypes, teams, workLocations } from './org.js';
import { employees } from './employees.js';
import type { EntityKit } from '../entity.js';

/** Every CRUD entity in the product. Add new kits here so permissions, routes and OpenAPI pick them up. */
export const ALL_KITS: EntityKit[] = [
  workLocations, businessUnits, costCenters, employeeTypes, employmentTypes, departments, designations, teams, employees,
] as EntityKit[];
export const kitByKey = (key: string): EntityKit | undefined => ALL_KITS.find((k) => k.def.key === key);

import { attendancePolicies, breakTypes, holidays, leaveProfiles, leaveRequests, leaveTypes, nonWorkingRules, regularizations, shifts } from './time.js';
export * from './time.js';
ALL_KITS.push(breakTypes, shifts, leaveProfiles, holidays, nonWorkingRules, leaveTypes, attendancePolicies, leaveRequests, regularizations);

import { geoFences } from './field.js';
export * from './field.js';
ALL_KITS.push(geoFences);
