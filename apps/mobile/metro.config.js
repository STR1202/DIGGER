// モノレポ構成: packages/core の変更を Metro に見せるための最小限の追記だけを行う。
// Expo の既定値は壊さない（disableHierarchicalLookup を立てると
// expo-asset のようなホイスト済みパッケージを解決できなくなる）。
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver.nodeModulesPaths = [
  ...new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ]),
];

module.exports = config;
