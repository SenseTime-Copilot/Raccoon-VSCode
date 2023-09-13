import axios from "axios";
import { commands, env, extensions, UIKind, Uri, window, Extension } from "vscode";
import { ClientConfig, CodeClient } from "../sensecodeClient/src/CodeClient";

export interface CodeExtension {
  filterEnabled: (clientConfig: ClientConfig) => boolean;
  factory: (clientConfig: ClientConfig, debug?: (message: string, ...args: any[]) => void) => CodeClient | undefined;
}

const requiredProxyVersion = '0.50.5';
const proxyUrl = `http://kestrel.sensetime.com/tools/sensetimeproxy-${requiredProxyVersion}.vsix`;

async function getProxy(): Promise<Extension<CodeExtension> | undefined> {
  let es = extensions.all;
  for (let e of es) {
    if (e.id === "SenseTime.sensetimeproxy") {
      if (e.isActive) {
        return e;
      } else {
        return e.activate().then(() => {
          return e;
        });
      }
    }
  }
  return undefined;
}

function checkProxyVersion(proxy: Extension<CodeExtension> | undefined): boolean | undefined {
  if (!proxy) {
    return undefined;
  }

  return proxy.packageJSON.version === requiredProxyVersion;
}

export async function checkSensetimeEnv(showError?: boolean): Promise<Extension<CodeExtension> | undefined> {
  if (env.uiKind === UIKind.Web) {
    return Promise.resolve(undefined);
  }
  return axios.get(`https://sso.sensetime.com/enduser/sp/sso/`)
    .then(() => {
      return undefined;
    })
    .catch(async (e) => {
      if (e.response?.status === 500) {
        let proxy = await getProxy();
        let status = checkProxyVersion(proxy);
        if (status === undefined) {
          if (showError) {
            window.showWarningMessage("SenseTime 内网环境需安装 Proxy 插件并启用，通过 LDAP 账号登录使用", "下载", "已安装, 去启用").then(
              (v) => {
                if (v === "下载") {
                  commands.executeCommand('vscode.open', Uri.parse(proxyUrl));
                }
                if (v === "已安装, 去启用") {
                  commands.executeCommand('workbench.extensions.search', '@installed sensetimeproxy');
                }
              }
            );
          }
          return undefined;
        } else if (!status) {
          if (showError) {
            window.showWarningMessage("SenseTime 内网环境所需的 Proxy 插件有更新版本，需要升级才能使用", "下载").then(
              (v) => {
                if (v === "下载") {
                  commands.executeCommand('vscode.open', Uri.parse(proxyUrl));
                }
              }
            );
          }
          return undefined;
        } else {
          return proxy;
        }
      }
      return undefined;
    });
}
