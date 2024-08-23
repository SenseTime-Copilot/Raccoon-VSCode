const args = require('minimist')(process.argv.slice(2));
const fs = require('node:fs');

let packageId = args.packageId.toLowerCase().replaceAll(" ", "-") || "raccoon";
let packageName = args.packageName || "Raccoon";
let packageValueFile = args.packageValueFile || undefined;
let packageType = args.packageType || "Standard";
let completionModel = args.completionModel || "Raccoon Completion 7B (16k)";
let assistantModel = args.assistantModel || "Raccoon Assistant 70B (32k)";
let betaFeature = args.betaFeature ? args.betaFeature.split(",").map((feature) => feature.trim()) : undefined;
let apiType = args.apiType || "Raccoon";
let baseUrl = args.baseUrl || "https://raccoon.sensetime.com";
let authMethod = (packageType === "Enterprise" ? ["email"] : ["browser", "wechat", "email", "phone"]);

let extensionId = packageId.replace(/^@/g, '').replace(/[@~.\/]/g, '-');
let extensionIdCamel = extensionId.replace(/-./g, x=>x[1].toUpperCase());
let extensionName = packageName;

console.log("=============== Rendering Settings ===============");
console.log(` Package ID         : ${extensionId}`);
console.log(` Package Name       : ${extensionName}`);
if (packageValueFile) {
  console.log(` Package Value File : ${packageValueFile}`);
} else {
  console.log(` Package Type       : ${packageType}`);
  console.log(` Completion Model   : ${completionModel}`);
  console.log(` Assistant Model    : ${assistantModel}`);
  console.log(` Beta Feature       : ${JSON.stringify(betaFeature)}`);
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
  let content = data.replaceAll("{extensionId}", extensionId).replaceAll("{extensionIdCamel}", extensionIdCamel).replaceAll("{extensionName}", extensionName);
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
        console.log(`Configuration:\n`);
        console.log(`${JSON.stringify(JSON.parse(data), undefined, 2)}`);
        console.log("==================================================");
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
    if (betaFeature) {
      cfg.beta = betaFeature;
    }
    for (let e of cfg.engines) {
      e.robotname = extensionName;
      e.apiType = apiType;
      e.baseUrl = baseUrl;
      e.authMethod = authMethod;
      e.completion.maxInputTokenNum = 12288;
      e.completion.totalTokenNum = 16384;
      e.assistant.maxInputTokenNum = 28672;
      e.assistant.totalTokenNum = 32768;
      switch (completionModel) {
        case "Raccoon Completion 7B (16k)": {
          e.completion.maxInputTokenNum = 12288;
          e.completion.totalTokenNum = 16384;
          break;
        }
        case "Raccoon Completion 13B (16k)": {
          e.completion.maxInputTokenNum = 12288;
          e.completion.totalTokenNum = 16384;
          break;
        }
      }
      switch (assistantModel) {
        case "Raccoon Assistant 7B (16k)": {
          e.assistant.maxInputTokenNum = 12288;
          e.assistant.totalTokenNum = 16384;
          break;
        }
        case "Raccoon Assistant 70B (16k)": {
          e.assistant.maxInputTokenNum = 12288;
          e.assistant.totalTokenNum = 16384;
          break;
        }
        case "Raccoon Assistant 70B (32k)": {
          e.assistant.maxInputTokenNum = 28672;
          e.assistant.totalTokenNum = 32768;
          break;
        }
      }
    }
    let content = JSON.stringify(cfg, undefined, 2);
    fs.writeFile('./config/value.json', content, writeErr => {
      if (writeErr) {
        console.error(writeErr);
      } else {
        console.log(`Value File:\n`);
        console.log(`${JSON.stringify(JSON.parse(content), undefined, 2)}`);
        console.log("==================================================");
      }
    });
  });
}
