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
