const fs = require("fs-extra");
const unzipper = require("unzipper");
const { execSync } = require("child_process");
const path = require("path");
const readline = require("readline");
const configPath = "./config.json";

const apps = [
  { pool: "AppPoolnskbeta-api", folder: "WebApi" },
  { pool: "AppPoolnskbeta-intapi", folder: "PublicWebApi" },
  { pool: "AppPoolnskbeta-signalr", folder: "SignalR" },
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
    zipPath: "E:\\drop.zip",
    extractPath: "E:\\temp_iis_update",
    targetBase: "E:\\pub\\beta-ci",
    backupBase: "E:\\backups",
  };

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  console.log("\nCurrent Config Paths:");
  console.log("ZIP Path:       " + config.zipPath);
  console.log("Extract Path:   " + config.extractPath);
  console.log("Target Folder:  " + config.targetBase);
  console.log("Backup Path:    " + config.backupBase);

  const answer = (
    await askQuestion("\nWould you like to use these paths? (yes/no): ")
  )
    .trim()
    .toLowerCase();

  if (answer === "no") {
    await confirmAndUpdate("path to ZIP file", "zipPath", config);
    await confirmAndUpdate("extract path", "extractPath", config);
    await confirmAndUpdate("target web root folder", "targetBase", config);
    await confirmAndUpdate("path for backups", "backupBase", config);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Updated config saved.\n");
  }

  rl.close();

  if (!fs.existsSync(config.zipPath)) {
    console.error(`❌ ZIP file not found at: ${config.zipPath}`);
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

    const sourceBase = path.join(config.extractPath, "drop");

    // Create a backup folder inside targetBase/backups with today's date
    const dateStr = new Date().toISOString().slice(0, 10);
    const backupRoot = path.join(config.backupBase, `backup-${dateStr}`);
    await fs.ensureDir(backupRoot);

    for (const { pool, folder } of apps) {
      try {
        const appcmd = "C:\\Windows\\System32\\inetsrv\\appcmd.exe";
        console.log(`\nStopping App Pool: \"${pool}\"...`);
        execSync(`"${appcmd}" stop apppool /apppool.name:"${pool}"`, {
          stdio: "inherit",
        });

        const src = path.join(sourceBase, folder);
        const dest = path.join(config.targetBase, folder);

        // Backup current folder
        const backupDest = path.join(backupRoot, folder);
        console.log(`Backing up ${folder} to: ${backupDest}`);
        await fs.copy(dest, backupDest);

        // Replace with new version
        console.log(`Updating folder: ${folder}`);
        await fs.copy(src, dest, { overwrite: true });

        console.log(`Starting App Pool: \"${pool}\"...`);
        execSync(`"${appcmd}" start apppool /apppool.name:"${pool}"`, {
          stdio: "inherit",
        });

        console.log(`✅ ${folder} updated successfully\n`);
      } catch (err) {
        console.error(`❌ Error updating ${folder}:`, err.message);
      }
    }

    console.log("Cleaning up temp folder...");
    await fs.remove(config.extractPath);
    console.log("✅ IIS update process complete.");
  } catch (err) {
    console.error("❌ Script failed:", err.message);
  }
}

main();
