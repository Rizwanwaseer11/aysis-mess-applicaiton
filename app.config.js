const { validateBuildEndpoint } = require("./scripts/build-config.cjs");
module.exports = ({ config }) => {
  validateBuildEndpoint(
    process.env.EXPO_PUBLIC_API_URL,
    process.env.AYSIS_BUILD_MODE,
  );
  return config;
};
