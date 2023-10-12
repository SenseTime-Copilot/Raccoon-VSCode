import axios from "axios";
import { commands, env, extensions, UIKind, Uri, window, Extension, workspace, ExtensionContext, tasks, Task, ProcessExecution, TaskScope, ShellExecution, ShellQuoting } from "vscode";
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

export async function checkSensetimeEnv(context: ExtensionContext, showError?: boolean): Promise<Extension<CodeExtension> | undefined> {
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
            window.showWarningMessage("SenseTime 内网环境需安装 Proxy 插件并启用，通过 LDAP 账号登录使用", "安装", "已安装, 去启用").then(
              (v) => {
                if (v === "安装") {
                  downloadAndInstallProxy(context).catch((reason) => {
                    window.showErrorMessage("安装失败 " + reason, "Close");
                  });
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
            window.showWarningMessage("SenseTime 内网环境所需的 Proxy 插件有更新版本，需要升级才能使用", "升级").then(
              (v) => {
                if (v === "升级") {
                  downloadAndInstallProxy(context).catch((reason) => {
                    window.showErrorMessage("升级失败 " + reason, "Close");
                  });
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

async function downloadAndInstallProxy(context: ExtensionContext): Promise<void> {
  let localfile = Uri.joinPath(context.globalStorageUri, `sensetimeproxy-${requiredProxyVersion}.vsix`);
  return axios.get(proxyUrl, { responseType: 'arraybuffer' }).then((response) => {
    workspace.fs.writeFile(localfile, new Uint8Array(response.data)).then(() => {
      tasks.executeTask(
        new Task({ type: "SenseCode Proxy Installer" },
          TaskScope.Workspace,
          'SenseCode Proxy Installer',
          'SenseCode',
          new ShellExecution(
            { value: 'code', quoting: ShellQuoting.Escape },
            [
              '--install-extension',
              `sensetimeproxy-${requiredProxyVersion}.vsix`,
              '--force'
            ],
            {
              cwd: context.globalStorageUri.fsPath
            }
          )
        )
      );
    });
  });
}

