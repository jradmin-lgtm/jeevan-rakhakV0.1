const fs = require("fs");
const path = require("path");

function readEasProjectId() {
  const fromEnv = (
    process.env.USER_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    ""
  ).trim();
  if (fromEnv) return fromEnv;
  const p = path.join(__dirname, "eas-project.json");
  if (!fs.existsSync(p)) return "";
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    return (json.expoProjectId || "").trim();
  } catch {
    return "";
  }
}

module.exports = ({ config }) => {
  const projectId = readEasProjectId();
  // If projectId is empty (e.g. before `eas init` has been run), return the
  // base config so the CLI can create a fresh project and write the new ID
  // into app.json. After init, paste the new ID into eas-project.json.
  if (!projectId) return config;
  return {
    ...config,
    updates: {
      ...(config.updates || {}),
      url: `https://u.expo.dev/${projectId}`
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        ...((config.extra && config.extra.eas) || {}),
        projectId
      }
    }
  };
};
