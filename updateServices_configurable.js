const fs = require("fs-extra");
const unzipper = require("unzipper");
const { execSync } = require("child_process");
const path = require("path");
const readline = require("readline");
const configPath = "./config.json";

const services = [
  { serviceName: "WE Config", folderName: "ConfigServices" },
  { serviceName: "WE DbUpdater", folderName: "DbUpdaterServices" },
  { serviceName: "WE Devices", folderName: "DvServices" },
  { serviceName: "WE Human Resources", folderName: "HrServices" },
  { serviceName: "WE Quartz", folderName: "QuartzServices" },
  { serviceName: "WE Scheduling", folderName: "SchServices" },
  { serviceName: "WE SelfieEnrollment", folderName: "SelfieEnrollment" },
  { serviceName: "WE Time and Attendance", folderName: "TaServices" },
  { serviceName: "WE Time Off", folderName: "ToServices" },
  { serviceName: "WE Webhooks", folderName: "WebhooksServices" },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function confirmAndUpdate(promptText, targetKey, config) {
  const confirm = (
    await askQuestion(`\nDo you want to change the ${promptText}? (yes/no): `)
  )
    .trim()
    .toLowerCase();

  if (confirm === "yes") {
    config[targetKey] = await askQuestion(`\nEnter full ${promptText}: `);
  }
}

async function main() {
  let config = {
    zipPath: "E:\\Services.zip",
    extractPath: "E:\\temp_update",
    targetBase: "E:\\SERVICES\\App_Data\\jobs\\continuous",
    backupBase: "E:\\backups",
  };

  // Load config if it exists
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  console.log("\nCurrent Config Paths:");
  console.log("ZIP Path:       " + config.zipPath);
  console.log("Extract Path:   " + config.extractPath);
  console.log("Target Folder:  " + config.targetBase);
  console.log("Backup Path:    " + config.backupBase);

  let answer = (
    await askQuestion("\nWould you like to use these paths? (yes/no): ")
  )
    .trim()
    .toLowerCase();
  if (answer === "no") {
    await confirmAndUpdate("path to ZIP file", "zipPath", config);
    await confirmAndUpdate("extract path", "extractPath", config);
    await confirmAndUpdate("target service folder", "targetBase", config);
    await confirmAndUpdate("path for backups", "backupBase", config);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Updated config saved.\n");
  }

  rl.close();

  if (!fs.existsSync(config.zipPath)) {
    console.error(`❌ ZIP file not found at: ${config.zipPath}`);
    process.exit(1);
  }

  const extractParent = path.dirname(config.extractPath);
  if (!fs.existsSync(extractParent)) {
    console.error(
      `❌ Parent folder of extract path does not exist: ${extractParent}`
    );
    process.exit(1);
  }

  if (!fs.existsSync(config.targetBase)) {
    console.error(`❌ Target folder not found at: ${config.targetBase}`);
    process.exit(1);
  }

  const backupParent = path.dirname(config.backupBase);
  if (!fs.existsSync(backupParent)) {
    console.error(
      `❌ Parent folder of backup path does not exist: ${backupParent}`
    );
    process.exit(1);
  }

  try {
    console.log("Cleaning up any old temp folder...");
    await fs.remove(config.extractPath);
    await fs.ensureDir(config.extractPath);

    console.log("Unzipping update file...");
    await fs
      .createReadStream(config.zipPath)
      .pipe(unzipper.Extract({ path: config.extractPath }))
      .promise();
    console.log("✅ Unzip complete.\n");

    const sourceBase = path.join(
      config.extractPath,
      "Services",
      "App_Data",
      "jobs",
      "continuous"
    );

    const dateStr = new Date().toISOString().slice(0, 10);
    const backupRoot = path.join(config.backupBase, `backup-${dateStr}`);
    await fs.ensureDir(backupRoot);

    for (const { serviceName, folderName } of services) {
      try {
        console.log(`\nStopping service: "${serviceName}"...`);
        execSync(`net stop "${serviceName}"`, { stdio: "inherit" });

        const src = path.join(sourceBase, folderName);
        const dest = path.join(config.targetBase, folderName);

        const backupDest = path.join(backupRoot, folderName);
        console.log(`Backing up ${folderName} to: ${backupDest}`);
        await fs.copy(dest, backupDest);

        console.log(`Updating folder: ${folderName}`);
        await fs.copy(src, dest, { overwrite: true });

        console.log(`Starting service: "${serviceName}"...`);
        execSync(`net start "${serviceName}"`, { stdio: "inherit" });

        console.log(`✅ ${serviceName} updated successfully\n`);
      } catch (err) {
        console.error(`❌ Error updating ${serviceName}:`, err.message);
      }
    }

    console.log("Cleaning up temp folder...");
    await fs.remove(config.extractPath);
    console.log("✅ Update process complete.");
  } catch (err) {
    console.error("❌ Script failed:", err.message);
  }
}

main();
