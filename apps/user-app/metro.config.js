const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..", "..");
const config = getDefaultConfig(projectRoot);

// pnpm stores actual package contents under node_modules/.pnpm symlinks.
// Metro must watch and resolve through both app and monorepo roots.
config.watchFolders = [monorepoRoot];
config.resolver.unstable_enableSymlinks = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;

