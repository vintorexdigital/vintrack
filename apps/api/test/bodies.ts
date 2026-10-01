import type { EntityKit, FieldDef } from '@trackrex/schemas';

let n = 0;
/** Build a valid create body for any entity from its field definitions (required fields only, plus overrides). */
export function validBody(kit: EntityKit, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  n++;
  const body: Record<string, unknown> = {};
  for (const [key, d] of Object.entries(kit.def.fields) as [string, FieldDef][]) {
    if (!d.required) continue;
    body[key] = sample(key, d);
  }
  // unique fields must differ between rows
  for (const u of kit.def.unique ?? []) {
    const d = kit.def.fields[u]!;
    if (body[u] === undefined) body[u] = sample(u, d);
  }
  return { ...body, ...overrides };
}

function sample(key: string, d: FieldDef): unknown {
  switch (d.kind) {
    case 'text': return key === 'timezone' ? 'Asia/Kolkata' : `${d.label} ${n}`;
    case 'email': return `u${n}.${Date.now().toString(36)}@example.com`;
    case 'phone': return `+9198${String(10_000_000 + n).slice(-8)}`;
    case 'date': return '2026-01-05';
    case 'time': return '09:00';
    case 'json': return key === 'entitlement' ? { tiers: [{ totalDays: 12 }] } : {};
    case 'number': return d.min ?? 1;
    case 'select': return d.options![0]!.value;
    case 'boolean': return true;
    default: return `${key}-${n}`;
  }
}
