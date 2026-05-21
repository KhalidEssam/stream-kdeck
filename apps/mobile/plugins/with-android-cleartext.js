const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function upsertPermission(manifest, name, attributes = {}) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  const existing = manifest['uses-permission'].find(
    (permission) => permission.$?.['android:name'] === name,
  );

  if (existing) {
    existing.$ = { ...existing.$, ...attributes };
    return;
  }

  manifest['uses-permission'].push({
    $: {
      'android:name': name,
      ...attributes,
    },
  });
}

function withAndroidCleartext(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    upsertPermission(manifest, 'android.permission.NEARBY_WIFI_DEVICES', {
      'android:usesPermissionFlags': 'neverForLocation',
    });

    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:usesCleartextTraffic'] = 'true';
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }

    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
        'utf8',
      );

      return modConfig;
    },
  ]);
}

module.exports = withAndroidCleartext;
