import { createRequire } from 'node:module';
import { pathToFileURL, URL } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightPackage = pathToFileURL(
  require.resolve('playwright/package.json'),
);
const playwrightCorePackage = pathToFileURL(
  createRequire(playwrightPackage).resolve('playwright-core/package.json'),
);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright') {
    return nextResolve(new URL('./index.mjs', playwrightPackage).href, context);
  }

  if (specifier === 'playwright-core') {
    return nextResolve(
      new URL('./index.mjs', playwrightCorePackage).href,
      context,
    );
  }

  return nextResolve(specifier, context);
}
