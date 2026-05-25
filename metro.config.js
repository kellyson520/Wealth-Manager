const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'bundle'];

module.exports = config;
