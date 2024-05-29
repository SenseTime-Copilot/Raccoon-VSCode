# Rewrite Package Guide

```shell
node ./render_manifest.js --packageId="<PACKAGE-ID>" --packageName="<PACKAGE-NAME>" --apiBaseUrl="<API-BASE-URL>"
```

params:

* `packageId` - 扩展id，全小写，无空格，可用 `-` 分割，默认 `raccoon`
* `packageName` - 显示名称，大写小英文字母，中间可加空格，默认 `Raccoon`
* `apiBaseUrl` - 后端对应的 API 地址，默认：`https://raccoon-api.sensetime.com/api/plugin`

