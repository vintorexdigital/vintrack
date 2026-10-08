import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3Storage } from '../src/modules/files/s3-storage.js';
import { startMockS3 } from './mock-s3.js';

let s3: Awaited<ReturnType<typeof startMockS3>>;
beforeAll(async () => { s3 = await startMockS3(); });
afterAll(async () => { await s3.close(); });
const store = (over: Partial<ConstructorParameters<typeof S3Storage>[0]> = {}) =>
  new S3Storage({ endpoint: s3.endpoint, region: s3.creds.region, bucket: s3.creds.bucket, accessKeyId: s3.creds.accessKeyId, secretAccessKey: s3.creds.secretAccessKey, pathStyle: true, ...over });

describe('S3 storage adapter (against a signature-checking double)', () => {
  it('writes, reads and checks objects under the same keys the disk provider uses', async () => {
    const st = store();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
    await st.put('selfies/t/u/a b.jpg', bytes);
    expect(s3.objects.has('selfies/t/u/a b.jpg')).toBe(true);
    expect(Buffer.compare((await st.get('selfies/t/u/a b.jpg'))!, bytes)).toBe(0);
    expect(await st.exists('selfies/t/u/a b.jpg')).toBe(true);
    expect(await st.get('selfies/t/u/missing.jpg')).toBeNull();
    expect(await st.exists('selfies/t/u/missing.jpg')).toBe(false);
    await st.delete('selfies/t/u/a b.jpg');
    expect(await st.exists('selfies/t/u/a b.jpg')).toBe(false);
    await st.delete('selfies/t/u/never-existed.jpg'); // deleting nothing is not an error
  });

  it('is refused when the secret is wrong, and says so', async () => {
    const bad = store({ secretAccessKey: 'wrong' });
    await expect(bad.put('x/y.bin', Buffer.from('1'))).rejects.toThrow(/refused the upload \(403\)/);
    await expect(bad.get('x/y.bin')).rejects.toThrow(/403/);
  });

  it('refuses keys that climb out of the bucket', async () => {
    await expect(store().put('../etc/passwd', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
  });
});
