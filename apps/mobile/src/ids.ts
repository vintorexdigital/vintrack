import * as ExpoCrypto from 'expo-crypto';

export const Crypto = { randomUUID: (): string => ExpoCrypto.randomUUID() };
