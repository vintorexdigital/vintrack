const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Shared client logic lives in packages/client-core, outside this project's folder.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../packages/client-core'), path.resolve(__dirname, '../../packages/rules')];
module.exports = config;
