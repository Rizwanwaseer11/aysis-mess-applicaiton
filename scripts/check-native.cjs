const { execFileSync } = require('node:child_process');
function assertUniqueNativeModules(modules) {
  const duplicated = Object.values(modules).filter(module => module.duplicates?.length).map(module => module.name);
  if (duplicated.length) throw new Error('Duplicate native modules: ' + duplicated.join(', ') + '. Run npm dedupe and recheck before building.');
}
if (require.main === module) {
  const cli = require.resolve('expo-modules-autolinking/bin/expo-modules-autolinking.js');
  const output = execFileSync(process.execPath, [cli, 'search', '--platform', 'android', '--json'], { encoding: 'utf8' });
  assertUniqueNativeModules(JSON.parse(output));
  console.log('Native dependencies verified: no duplicate Android modules.');
}
module.exports = { assertUniqueNativeModules };
