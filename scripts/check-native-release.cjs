const fs = require('node:fs');
const assert = require('node:assert/strict');
for (const app of ['user', 'driver']) {
  const root = `apps/${app}-app`;
  const config = JSON.parse(fs.readFileSync(`${root}/app.json`, 'utf8')).expo;
  const gradle = fs.readFileSync(`${root}/android/app/build.gradle`, 'utf8');
  const strings = fs.readFileSync(`${root}/android/app/src/main/res/values/strings.xml`, 'utf8');
  const properties = fs.readFileSync(`${root}/android/gradle.properties`, 'utf8');
  const runtime = strings.match(/<string name="expo_runtime_version">([^<]+)<\/string>/)?.[1];
  assert.equal(runtime, config.version, `${app}: native OTA runtime differs from app version`);
  assert.equal(gradle.match(/versionName\s+"([^"]+)"/)?.[1], config.version, `${app}: APK version differs from app version`);
  assert.equal(Number(gradle.match(/versionCode\s+(\d+)/)?.[1]), config.android.versionCode, `${app}: APK version code differs from app configuration`);
  const abi = properties.match(/^reactNativeArchitectures=(.+)$/m)?.[1].split(',').sort();
  assert.deepEqual(abi, ['armeabi-v7a','arm64-v8a','x86','x86_64'].sort(), `${app}: universal build architectures missing`);
  assert.equal(properties.match(/^newArchEnabled=(.+)$/m)?.[1], String(config.newArchEnabled), `${app}: native architecture setting differs`);
  console.log(`PASS ${app}: APK version, OTA runtime and universal architectures agree`);
}
