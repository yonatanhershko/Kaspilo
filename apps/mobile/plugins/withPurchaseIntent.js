// Puts the "Kaspilo purchase" App Intent into the iOS app target (docs/spec.md "Purchase
// detected"). App Intents must be compiled into the app itself: Shortcuts does not find
// intents inside a pod. The file lives in modules/kaspilo-purchase/ios-app/.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILE = 'KaspiloPurchaseIntent.swift';

function withPurchaseIntent(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const source = path.join(cfg.modRequest.projectRoot, 'modules', 'kaspilo-purchase', 'ios-app', FILE);
      fs.copyFileSync(source, path.join(cfg.modRequest.platformProjectRoot, projectName, FILE));
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${projectName}/${FILE}`;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project });
    }
    return cfg;
  });
}

module.exports = withPurchaseIntent;
