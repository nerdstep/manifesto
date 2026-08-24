/**
 * Hutch owns the toolchain; this file is where the project overrides it.
 *
 * Hutch's built-in resolver would otherwise ignore `bun.lock` entirely — never read,
 * migrated, or modified — and resolve `package.json` itself into a second `hutch.lock`.
 * Naming Bun here keeps one lockfile and one `node_modules`, which is what every other
 * script in `package.json` already assumes.
 *
 * The Electrobun release is deliberately not pinned here: the `electrobun` devDependency
 * selects it, so the toolchain moves with the lockfile like any other dependency.
 */
export default {
  packageManager: 'bun',
} as const
