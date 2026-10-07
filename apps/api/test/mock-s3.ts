import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { signV4 } from '../src/modules/files/s3-storage.js';

/**
 * An in-process S3-compatible double (path-style). It re-computes the Signature V4 for each request and rejects
 * mismatches, so the adapter's signing is exercised for real. It is a test double, not S3.
 */
export async function startMockS3(creds = { accessKeyId: 'AKIAMOCK', secretAccessKey: 'mock-secret', region: 'ap-south-1', bucket: 'trackrex-test' }) {
  const objects = new Map<string, Buffer>();
  const requests: { method: string; path: string }[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method ?? '', path: req.url ?? '' });
      const amz = String(req.headers['x-amz-date'] ?? '');
      const hash = String(req.headers['x-amz-content-sha256'] ?? '');
      const now = new Date(`${amz.slice(0, 4)}-${amz.slice(4, 6)}-${amz.slice(6, 8)}T${amz.slice(9, 11)}:${amz.slice(11, 13)}:${amz.slice(13, 15)}Z`);
      const expect_ = signV4({ method: req.method ?? '', host: String(req.headers.host), path: (req.url ?? '').split('?')[0]!, region: creds.region, accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey, payloadHash: hash, now });
      if (req.headers.authorization !== expect_.authorization || createHash('sha256').update(body).digest('hex') !== hash) { res.statusCode = 403; res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>'); return; }
      const m = /^\/([^/]+)\/(.+)$/.exec((req.url ?? '').split('?')[0]!);
      if (!m || m[1] !== creds.bucket) { res.statusCode = 404; res.end('<Error><Code>NoSuchBucket</Code></Error>'); return; }
      const key = m[2]!.split('/').map(decodeURIComponent).join('/');
      if (req.method === 'PUT') { objects.set(key, body); res.statusCode = 200; res.end(); return; }
      const o = objects.get(key);
      if (!o) { res.statusCode = 404; res.end('<Error><Code>NoSuchKey</Code></Error>'); return; }
      res.statusCode = 200;
      res.setHeader('content-length', o.length);
      res.end(req.method === 'HEAD' ? undefined : o);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { endpoint: `http://127.0.0.1:${port}`, creds, objects, requests, close: () => new Promise<void>((r) => server.close(() => r())) };
}
