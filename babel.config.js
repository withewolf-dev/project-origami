module.exports = function (api) {
  // api.env() caches this config per environment, so the dev-only plugin
  // below can never leak into a production bundle from a stale cache.
  const isProduction = api.env('production');

  return {
    presets: ['babel-preset-expo'],
    // Stamps RN host elements with their source location for the design
    // tuner (docs/tuner/TODO.md). Phase 7.1 asserts the prod bundle is clean.
    plugins: isProduction ? [] : [require.resolve('./src/devtools/tuner/babel-plugin')],
  };
};
