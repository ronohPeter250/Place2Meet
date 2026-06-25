const { withAndroidManifest } = require('@expo/config-plugins');

// Cloud-based map styling (googleMapId) REQUIRES the LATEST renderer.
// Force LATEST and remove any pre-existing LEGACY meta-data so the cloud
// style attached to our Map ID actually applies.
module.exports = function withMapRenderer(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;
    app['meta-data'] = app['meta-data'] || [];
    app['meta-data'] = app['meta-data'].filter(
      (m) => m.$['android:name'] !== 'com.google.android.geo.MAP_RENDERER'
    );
    app['meta-data'].push({
      $: {
        'android:name': 'com.google.android.geo.MAP_RENDERER',
        'android:value': 'LATEST',
      },
    });
    return cfg;
  });
};
