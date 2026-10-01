# ADR 0001: Monorepo, internal packages and the decorator toolchain

**Status:** accepted. **Context:** the master prompt prescribes pnpm and Turborepo with shared `packages/*` consumed by the API, web, mobile and desktop apps.

**Decision.**
- Internal packages (`schemas`, `rules`, `tokens`, `ui`) are consumed as TypeScript source (`"main": "./src/index.ts"`), so there is no per-package build step to forget. Next.js transpiles them (`transpilePackages`, plus an `extensionAlias` so `.js` specifiers resolve to `.ts`); the API bundles them with tsup.
- NestJS needs `emitDecoratorMetadata`, which esbuild and `tsx` do not provide. The API therefore runs in development and in the worker through `@swc-node/register`, tests through `unplugin-swc`, and production builds through tsup with the SWC plugin. `tsx` is used only for plain scripts (migrations, token generation).
- The worker (`src/worker.ts`) lives in the API package, not a separate `apps/worker`, because it shares every service and the same container image. It is a second entry point with its own `start:worker` script and Compose service.

**Consequences.** One install, one typecheck, shared types end to end. A new internal package needs only a `package.json` with a source `main`. Mobile and desktop will consume the same packages through Metro and Vite aliases.
