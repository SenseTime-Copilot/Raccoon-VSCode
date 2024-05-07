# Variables

`extensionId`: 扩展id，全小写，无空格，可用 `-` 分割
`extensionName`: 显示名称，大写小英文字母，中间可加空格
`extensionNameWithoutWhiteSpace`: `extensionName` 无空格版本

在以下信息中，{xxx} 代表 xxx 变量值的占位符，可替换为实际值，以下均以

extensionId: "raccoon-sample"
extensionName: "Raccoon Sample"
extensionNameWithoutWhiteSpace: "RaccoonSample"

为例提供替换示例。

# extension.vsixmanifest

```xml
<Identity Id="{extensionId}" />
<DisplayName>{extensionName}</DisplayName>
```

如：
```xml
<Identity Id="raccoon-sample" />
<DisplayName>Raccoon Sample</DisplayName>
```

# package.json

从 `package-sample.json` 复制到 `package.json`, 将其中对于变量占位符替换为值，如：

`{extensionId}` 替换为 `raccoon-sample`
`{extensionName}` 替换为 `Raccoon Sample`
`{extensionNameWithoutWhiteSpace}` 替换为 `RaccoonSample`

# package.nls.*.json

一系列国际化文件，将所有文件中 `Raccoon` (大小写敏感) 替换为扩展显示名称