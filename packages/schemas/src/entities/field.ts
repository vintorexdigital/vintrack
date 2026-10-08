import { z } from 'zod';
import { defineEntity, f } from '../entity.js';

const status = f.select('Status', ['active', 'inactive'], { default: 'active', list: true, filter: true, sort: true });

export const polygonSchema = z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(3).max(200);

export const geoFences = defineEntity({
  key: 'geo-fences', singular: 'Geo-fence', plural: 'Geo-fences', module: 'field', resource: 'geo-fence',
  path: '/field/geo-fences', titleField: 'name', defaultSort: 'name', unique: ['name'], licenseModule: 'tracking',
  fields: {
    name: f.text('Fence name', { required: true, list: true, sort: true, search: true }),
    fenceType: f.select('Shape', ['circle', 'polygon'], { required: true, default: 'circle', list: true, filter: true }),
    latitude: f.number('Centre latitude', { min: -90, max: 90 }),
    longitude: f.number('Centre longitude', { min: -180, max: 180 }),
    radiusMeters: f.number('Radius (metres)', { min: 10, max: 50000, default: 150, list: true }),
    polygon: f.json('Polygon points', polygonSchema.nullable().default(null), { editor: 'polygon' }),
    address: f.textarea('Address', { list: true, search: true }),
    workLocationId: f.ref('Work location', 'work-locations', { filter: true }),
    status,
  },
  empty: { title: 'No geo-fences yet', hint: 'Draw a circle or polygon around an office or customer site to check punches and visits against it.' },
});

export const customers = defineEntity({
  key: 'customers', singular: 'Customer', plural: 'Customers', module: 'field', resource: 'customer',
  path: '/field/customers', codePrefix: 'CUST', titleField: 'name', defaultSort: 'name', licenseModule: 'customers',
  fields: {
    name: f.text('Customer name', { required: true, list: true, sort: true, search: true }),
    customerType: f.select('Type', ['business', 'individual', 'distributor', 'retailer', 'other'], { default: 'business', list: true, filter: true }),
    phone: f.phone('Phone', { list: true, search: true }),
    email: f.email('Email', { search: true }),
    address: f.textarea('Address', { list: true, search: true }),
    city: f.text('City', { list: true, filter: true, search: true }),
    latitude: f.number('Latitude', { min: -90, max: 90, section: 'Location' }),
    longitude: f.number('Longitude', { min: -180, max: 180, section: 'Location' }),
    geoFenceId: f.ref('Geo-fence', 'geo-fences', { section: 'Location' }),
    accountOwnerId: f.ref('Account owner', 'employees', { filter: true, list: true }),
    notes: f.textarea('Notes'),
    status: f.select('Status', ['prospect', 'active', 'inactive'], { default: 'active', list: true, filter: true, sort: true }),
  },
  empty: { title: 'No customers yet', hint: 'Add the businesses your team visits so tasks and check-ins can be matched to a place.' },
});

export const contacts = defineEntity({
  key: 'contacts', singular: 'Contact', plural: 'Contacts', module: 'field', resource: 'contact',
  path: '/field/contacts', titleField: 'name', defaultSort: 'name', licenseModule: 'customers',
  fields: {
    customerId: f.ref('Customer', 'customers', { required: true, list: true, filter: true }),
    name: f.text('Name', { required: true, list: true, sort: true, search: true }),
    designation: f.text('Role', { list: true }),
    phone: f.phone('Phone', { list: true, search: true }),
    email: f.email('Email', { search: true }),
    isPrimary: f.boolean('Primary contact', { default: false, list: true }),
  },
  empty: { title: 'No contacts yet', hint: 'Add the people you deal with at each customer.' },
});

export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export const tasks = defineEntity({
  key: 'tasks', singular: 'Task', plural: 'Tasks', module: 'field', resource: 'task',
  path: '/field/tasks', codePrefix: 'TSK', titleField: 'title', defaultSort: 'dueAt', scoped: 'employee', ownerColumn: 'assigneeId', licenseModule: 'tasks',
  fields: {
    title: f.text('Task', { required: true, list: true, search: true }),
    taskType: f.select('Type', ['visit', 'call', 'delivery', 'collection', 'survey', 'other'], { default: 'visit', list: true, filter: true }),
    customerId: f.ref('Customer', 'customers', { list: true, filter: true }),
    assigneeId: f.ref('Assigned to', 'employees', { required: true, list: true, filter: true }),
    dueAt: f.datetime('Due', { list: true, sort: true, filter: true }),
    priority: f.select('Priority', ['low', 'normal', 'high', 'urgent'], { default: 'normal', list: true, filter: true, sort: true }),
    description: f.textarea('Details'),
    status: f.select('Status', TASK_STATUSES, { default: 'open', list: true, filter: true, sort: true, hideInForm: true, immutable: true }),
    startedAt: f.datetime('Started', { hideInForm: true, immutable: true }),
    completedAt: f.datetime('Completed', { hideInForm: true, immutable: true, list: true, sort: true }),
    checkInLatitude: f.number('Check-in latitude', { hideInForm: true, immutable: true }),
    checkInLongitude: f.number('Check-in longitude', { hideInForm: true, immutable: true }),
    checkOutLatitude: f.number('Check-out latitude', { hideInForm: true, immutable: true }),
    checkOutLongitude: f.number('Check-out longitude', { hideInForm: true, immutable: true }),
    checkInDistanceM: f.number('Distance at check-in (m)', { hideInForm: true, immutable: true }),
    outcome: f.textarea('Outcome', { hideInForm: true, immutable: true }),
  },
  empty: { title: 'No tasks', hint: 'Assign visits, calls and deliveries to your team and follow them to completion.' },
});
