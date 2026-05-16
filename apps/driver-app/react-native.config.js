// Force the correct ExpoModulesPackage namespace.
// Some autolinking caches still emit `expo.core.ExpoModulesPackage`,
// but the actual class lives in `expo.modules.ExpoModulesPackage` on
// Expo SDK 49+. Without this override, EAS's generated PackageList.java
// has the wrong import → javac fails: 'cannot find symbol'.
module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: {
          packageImportPath: "import expo.modules.ExpoModulesPackage;",
          packageInstance: "new ExpoModulesPackage()",
        },
      },
    },
  },
};
