# Rewrite Package Guide

## Rewrite Script Usage

```shell
node ./render_manifest.js \
--packageValueFile="<PACKAGE_VALUE_FILE>" \
--packageId="<PACKAGE_ID>" \
--packageName="<PACKAGE_NAME>" \
--packageType="<PACKAGE_TYPE>" \
--completionModel="<COMPLETION_MODEL>" \
--assistantModel="<ASSISTANT_MODEL>" \
--apiType="<API_TYPE>" \
--baseUrl="<BASEURL>"
```

params:

* `packageValueFile` - 扩展配置文件内容，一旦设置，其他参数都将被忽略
* `packageId` - 扩展id，全小写，无空格，可用 `-` 分割，默认 `raccoon`
* `packageName` - 显示名称，大写小英文字母，中间可加空格，默认 `Raccoon`
* `packageType` - 扩展类型，可以为 `Standard` 或 `Enterprise`, 默认 `Standard`
* `completionModel` - 补全模型选择，可以为 `Raccoon Completion 7B (16k)`, `Raccoon Completion 13B (16k)` 默认 `Raccoon Completion 13B (16k)`
* `assistantModel` - 对话模型选择，可以为 `Raccoon Assistant 7B (16k)`, `Raccoon Assistant 70B (16k)`, `Raccoon Assistant 70B (32k)` 默认 `Raccoon Assistant 70B (32k)`
* `apiType` - API 类型，可以为 `Raccoon` 或 `TGI`, 默认 `Raccoon`
* `baseUrl` - 后端服务 URL 地址，默认：`https://raccoon.sensetime.com`

## Package Value File

Package Value File 是扩展配置文件

### Example

```jsonc
{
  "type": "Standard", // 扩展类型，可以是 "Standard" 或 "Enterprise"
  "engines": [ // 后端引擎列表
    {
      "robotname": "Raccoon", // 显示名称，仅用于多后端时下拉选项中区分显示，仅一个后端时没有用处
      "apiType": "Raccoon", // API 类型，可以是 "Raccoon" 或 "TGI"
      "baseUrl": "https://raccoon.sensetime.com", // 后端服务地址
      "authMethod": [ // 授权认证方法列表，扩展类型为 "Enterprise" 时，默认仅支持邮箱登录
        "browser", // 浏览器回调登陆
        "email", // 邮箱密码登录
        "phone" // 手机号登录
      ],
      "completion": { // 补全配置
        "parameters": { // 补全参数
          "stop": [
            "<EOT>"
          ],
          "temperature": 0.4
        },
        "maxInputTokenNum": 12288, // 模型单个请求最大输入 token 数
        "totalTokenNum": 16384 // 模型单个请求最大总 token 数
      },
      "assistant": { // 对话配置
        "parameters": { // 对话参数
          "stop": [
            "<|endofmessage|>"
          ],
          "temperature": 0.4
        },
        "maxInputTokenNum": 28672, // 模型单个请求最大输入 token 数
        "totalTokenNum": 32768 // 模型单个请求最大总 token 数
      }
    }
  ]
}
```
