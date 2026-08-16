const { getDefaultConfig } = require('expo/metro-config');

const { createTunerMiddleware } = require('./src/devtools/tuner/server/middleware');

const config = getDefaultConfig(__dirname);

// Mount the design tuner's dev endpoints (docs/tuner/TODO.md, phase 5).
// `enhanceMiddleware` is deprecated in Metro but explicitly composed by the
// Expo CLI (verified in @expo/cli instantiateMetro.js). Dev server only —
// production bundles never run this process.
const previousEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const base = previousEnhance ? previousEnhance(metroMiddleware, server) : metroMiddleware;
  const tuner = createTunerMiddleware(__dirname);
  return (req, res, next) => tuner(req, res, () => base(req, res, next));
};

module.exports = config;
