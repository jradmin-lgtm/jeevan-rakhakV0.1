const fs = require("fs");
const path = require("path");

function readEasProjectId() {
  const fromEnv = (
    process.env.DRIVER_EAS_PROJECT_ID ||
    process.env.USER_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    ""
  ).trim();
  if (fromEnv) return fromEnv;
  const p = path.join(__dirname, "eas-project.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      "Missing eas-project.json. Run eas init in apps/driver-app or set DRIVER_EAS_PROJECT_ID."
    );
  }
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  return (json.expoProjectId || "").trim();
}

module.exports = ({ config }) => {
  const projectId = readEasProjectId();
  if (!projectId) {
    throw new Error("expoProjectId is empty in eas-project.json (apps/driver-app).");
  }
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
