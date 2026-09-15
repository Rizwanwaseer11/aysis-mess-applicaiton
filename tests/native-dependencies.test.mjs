import test from 'node:test';
import assert from 'node:assert/strict';
import checker from '../scripts/check-native.cjs';
test('native build check rejects duplicate native modules even when Expo verification would exit successfully',()=>{
 assert.throws(()=>checker.assertUniqueNativeModules({asset:{name:'expo-asset',duplicates:[{version:'old'}]}}),/expo-asset/);
 assert.doesNotThrow(()=>checker.assertUniqueNativeModules({asset:{name:'expo-asset',duplicates:[]}}));
});
