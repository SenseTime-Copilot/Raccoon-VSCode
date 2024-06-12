const args = require('minimist')(process.argv.slice(2));
const fs = require('node:fs');

let packageId = args.packageId.toLowerCase().replaceAll(" ", "-") || "raccoon";
let packageName = args.packageName || "Raccoon";
let packageValueFile = args.packageValueFile || undefined;
let packageType = args.packageType || "Standard";
let apiType = args.apiType || "Raccoon";
let baseUrl = args.baseUrl || "https://raccoon.sensetime.com";
let authMethod = (packageType === "Enterprise" ? ["email"] : ["browser", "email", "phone"]);

console.log("=============== Rendering Settings ===============");
console.log(` Package ID         : ${packageId}`);
console.log(` Package Name       : ${packageName}`);
if (packageValueFile) {
  console.log(` Package Value File : ${packageValueFile}`);
} else {
  console.log(` Package Type       : ${packageType}`);
  console.log(` API Type           : ${apiType}`);
  console.log(` Base URL           : ${baseUrl}`);
  console.log(` Auth Method        : ${authMethod}`);
}
console.log("==================================================");

fs.readFile('./package-sample.json', 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }
  let nameWoWs = packageName.replace(" ", "");
  let content = data.replaceAll("{extensionId}", packageId).replaceAll("{extensionName}", packageName).replaceAll("{extensionNameWithoutWhiteSpace}", nameWoWs);
  fs.writeFile('./package.json', content, writeErr => {
    if (writeErr) {
      console.error(writeErr);
    } else {
      // file written successfully
    }
  });
});

if (packageValueFile) {
  fs.readFile(packageValueFile, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return;
    }
    fs.writeFile('./config/value.json', data, writeErr => {
      if (writeErr) {
        console.error(writeErr);
      } else {
        // file written successfully
      }
    });
  });
} else {
  fs.readFile('./config/value.json', 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return;
    }
    let cfg = JSON.parse(data);
    cfg.type = packageType;
    for (let e of cfg.engines) {
      e.robotname = packageName;
      e.apiType = apiType;
      e.baseUrl = baseUrl;
      e.authMethod = authMethod;
    }
    let content = JSON.stringify(cfg, undefined, 2);
    fs.writeFile('./config/value.json', content, writeErr => {
      if (writeErr) {
        console.error(writeErr);
      } else {
        // file written successfully
      }
    });
  });
}
