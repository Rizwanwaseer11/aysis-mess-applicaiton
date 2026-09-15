function validateBuildEndpoint(value, mode) {
  if (!mode) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to the backend HTTPS origin before building an APK.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an HTTPS origin without credentials, query parameters or an API path.",
    );
  }
  if (
    mode === "production" &&
    (/\.(devtunnels\.ms|ngrok(-free)?\.app|ngrok\.io|trycloudflare\.com)$/.test(
      url.hostname,
    ) ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new Error(
      "Production APKs require a stable backend domain, not a development tunnel or localhost.",
    );
  }
}
module.exports = { validateBuildEndpoint };
