import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'trk:public';
export const REALM = 'trk:realm';
export const PLATFORM_ROLES = 'trk:platform-roles';
export const ALLOW_PENDING_2FA = 'trk:pending2fa';
export const ALLOW_SUSPENDED = 'trk:allow-suspended';

/** No authentication required (sign-in, health, public invitation lookups). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route belongs to the platform console realm. Company tokens are rejected there. */
export const PlatformRealm = () => SetMetadata(REALM, 'platform');
export const PlatformRoles = (...roles: string[]) => SetMetadata(PLATFORM_ROLES, roles);
export const AllowPending2fa = () => SetMetadata(ALLOW_PENDING_2FA, true);
/** Allow writes while a company is suspended (billing recovery). */
export const AllowWhenSuspended = () => SetMetadata(ALLOW_SUSPENDED, true);
