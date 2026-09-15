import test from "node:test";
import assert from "node:assert/strict";
import config from "../scripts/build-config.cjs";
test("release configuration requires an explicit HTTPS backend and rejects temporary production endpoints", () => {
  for (const value of [
    undefined,
    "http://api.example.com",
    "https://user:password@api.example.com",
    "https://api.example.com/api/v1",
    "https://api.example.com?secret=1",
  ])
    assert.throws(() => config.validateBuildEndpoint(value, "production"));
  for (const value of [
    "https://project-4000.inc1.devtunnels.ms",
    "https://test.ngrok-free.app",
    "https://localhost",
  ])
    assert.throws(() => config.validateBuildEndpoint(value, "production"));
  assert.doesNotThrow(() =>
    config.validateBuildEndpoint("https://api.example.com", "production"),
  );
  assert.doesNotThrow(() =>
    config.validateBuildEndpoint("https://test.devtunnels.ms", "preview"),
  );
  assert.doesNotThrow(() => config.validateBuildEndpoint(undefined, undefined));
});
