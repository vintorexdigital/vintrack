import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { CONFIG, type Config } from '../../core/config.js';
import { unauthorized, badRequest } from '../../core/errors.js';

export type OidcProvider = 'google' | 'microsoft';

export interface OidcIdentity {
  provider: OidcProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const DISCOVERY: Record<OidcProvider, { jwks: string; issuer: (claims: { tid?: string }) => string[] }> = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuer: () => ['https://accounts.google.com', 'accounts.google.com'] },
  microsoft: { jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys', issuer: (c) => (c.tid ? [`https://login.microsoftonline.com/${c.tid}/v2.0`] : []) },
};

/** Verifies Google and Microsoft ID tokens against the provider's published keys. */
@Injectable()
export class OidcService {
  private keys = new Map<OidcProvider, JWTVerifyGetKey>();
  /** Tests inject a local key set here. */
  keyOverride: Partial<Record<OidcProvider, JWTVerifyGetKey>> = {};

  constructor(@Inject(CONFIG) private readonly cfg: Config) {}

  private clientId(p: OidcProvider): string {
    const id = p === 'google' ? this.cfg.GOOGLE_CLIENT_ID : this.cfg.MICROSOFT_CLIENT_ID;
    if (!id) throw badRequest('provider_not_configured', `${p === 'google' ? 'Google' : 'Microsoft'} sign-in is not set up.`);
    return id;
  }

  async verify(provider: OidcProvider, idToken: string): Promise<OidcIdentity> {
    const audience = this.clientId(provider);
    const key = this.keyOverride[provider] ?? this.keys.get(provider) ?? this.remember(provider);
    try {
      const { payload } = await jwtVerify(idToken, key, { audience });
      const issuers = DISCOVERY[provider].issuer({ tid: payload.tid as string | undefined });
      if (!payload.iss || !issuers.includes(payload.iss)) throw new Error('issuer');
      if (!payload.sub) throw new Error('subject');
      const email = (payload.email as string | undefined) ?? (payload.preferred_username as string | undefined) ?? null;
      return {
        provider, subject: payload.sub, email: email?.toLowerCase() ?? null,
        // Microsoft does not send email_verified; its tokens are tenant-verified, so treat a present email as verified.
        emailVerified: provider === 'microsoft' ? !!email : payload.email_verified === true,
        name: (payload.name as string | undefined) ?? null,
      };
    } catch {
      throw unauthorized('We could not verify that sign-in. Try again.', 'oidc_invalid');
    }
  }

  private remember(p: OidcProvider): JWTVerifyGetKey {
    const k = createRemoteJWKSet(new URL(DISCOVERY[p].jwks));
    this.keys.set(p, k);
    return k;
  }
}
