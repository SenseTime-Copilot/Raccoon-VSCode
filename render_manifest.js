const args = require('minimist')(process.argv.slice(2));
const fs = require('node:fs');

let packageId = args.packageId || "raccoon";
let packageName = args.packageName || "Raccoon";
let apiBaseUrl = args.apiBaseUrl || "https://raccoon-api.sensetime.com/api/plugin";

console.log("=============== Rendering Settings ===============");
console.log(` Package ID   : ${packageId}`);
console.log(` Package Name : ${packageName}`);
console.log(` API Base URL : ${apiBaseUrl}`);
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

fs.readFile('./config/value.json', 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }
  let cfg = JSON.parse(data);
  for (let e of cfg.engines) {
    e.apiBaseUrl = apiBaseUrl;
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
