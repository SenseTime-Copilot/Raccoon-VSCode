import { ExtensionContext, Uri, Webview, env } from 'vscode';
import { extensionDisplayName, extensionNameKebab, raccoonConfig, raccoonManager } from "../globalEnv";
import { AccountInfo, AuthMethod, Capability, Organization, UrlType } from '../raccoonClient/CodeClient';
import { phoneZoneCode } from '../utils/phoneZoneCode';
import { CompletionPreferenceType } from './raccoonManager';

function buildOrgHint(): string {
  return `<a class="switch-org reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
          <span class='material-symbols-rounded pointer-events-none'>switch_account</span>
          <div class='inline-block leading-loose pointer-events-none'>${raccoonConfig.t("Switch Organization")}</div>
          <span class="material-symbols-rounded grow text-right pointer-events-none">keyboard_double_arrow_right</span>
        </a>`;
}

function buildLoginHint() {
  let robotname = extensionDisplayName || "Raccoon";
  return `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" href="command:${extensionNameKebab}.settings">
          <span class='material-symbols-rounded'>person</span>
          <div class='inline-block leading-loose'>${raccoonConfig.t("Login to <b>{{robotname}}</b>", { robotname })}</div>
          <span class="material-symbols-rounded grow text-right">keyboard_double_arrow_right</span>
        </a>`;
}

function buildDocumentLinkHint() {
  let robotname = extensionDisplayName || "Raccoon";
  return `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" href="command:${extensionNameKebab}.help">
  <span class="material-symbols-rounded">book</span>
  <div class="inline-block leading-loose">${raccoonConfig.t("Read {{robotname}} document", { robotname })}</div>
  <span class="material-symbols-rounded grow text-right">keyboard_double_arrow_right</span>
</a>`;
}

export async function buildWelcomeMessage(robotname: string, userinfo?: AccountInfo, org?: Organization, switchEnable?: boolean) {
  let detail = '';
  let name = org?.username || userinfo?.username || "";
  let username = '';
  if (raccoonManager.isClientLoggedin()) {
    username = ` @${name}`;
    if (org) {
      username += ` (${org.name})`;
    }
    if (switchEnable) {
      detail += buildOrgHint();
    }
  } else {
    detail += buildLoginHint();
  }
  return raccoonConfig.t("Welcome<b>{{username}}</b>, I'm <b>{{robotname}}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", { username, robotname })
    + `<div style="margin: 0.25rem auto;">${raccoonConfig.t("Double-pressing {{hotkey}} to summon me at any time.", { hotkey: `<kbd ondblclick="document.getElementById('question-input').focus();document.getElementById('chat-input-box').classList.remove('flash');void document.getElementById('chat-input-box').offsetHeight;document.getElementById('chat-input-box').classList.add('flash');">Ctrl</kbd>` })}</div>`
    + detail
    + `<a class="reflink flex items-center gap-2 my-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);" onclick='vscode.postMessage({type: "sendQuestion", userAgent: navigator.userAgent, prompt: { label: "", type: "help", message: { role: "function", content: "" }}});'>
<span class="material-symbols-rounded">celebration</span>
<div class="inline-block leading-loose">${raccoonConfig.t("Quick Start")}</div>
<span class="material-symbols-rounded grow text-right">keyboard_double_arrow_right</span>
</a>`;
}

export function makeGuide(isMac: boolean) {
  return `
  <h3>${raccoonConfig.t("Coding with {{robotname}}", { robotname: extensionDisplayName })}</h3>
  <ol>
  <li>
    ${raccoonConfig.t("Stop typing or press hotkey (default: <code>{{hotkey}}</code>) to starts {{robotname}} thinking", { hotkey: isMac ? "⌥/" : "Alt+/", robotname: extensionDisplayName })}:
    <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-welcomePage-tileBorder); line-height: 1.2;">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
      <span style="color: var(--foreground); opacity: 0.4;">("hello world");</span>
    </code>
  </li>
  <li>
  ${raccoonConfig.t("When multi candidates generated, use <code>{{prev}}</code> or <code>{{next}}</code> to switch between them", { prev: isMac ? "⌥[" : "Alt+[", next: isMac ? "⌥]" : "Alt+]" })}:
    <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-welcomePage-tileBorder); line-height: 1.2;">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
      <span style="color: var(--foreground); opacity: 0.4;">("hello", "world");</span>
    </code>
  </li>
  <li>
  ${raccoonConfig.t("Accept the chosen code snippet with <code>Tab</code> key")}:
    <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-welcomePage-tileBorder); line-height: 1.2;">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
      <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
      <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
    </code>
  </li>
  <li>
  ${raccoonConfig.t("Or, accept signle word by <code>Ctrl+→</code>, accept single line by <code>Ctrl+↓</code>")}.
  </li>
  </ol>
  <h3>${raccoonConfig.t("Ask {{robotname}}", { robotname: extensionDisplayName })}</h3>
  <ol>
  <li>
  ${raccoonConfig.t("Select code in editor (if necessary)")}:
    <code style="display: flex; padding: 0.1rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-welcomePage-tileBorder); line-height: 1.2;">
    <div class="flex rounded-sm" style="padding: 0.2rem; margin: 0.3rem; width: fit-content;background-color: var(--vscode-editor-selectionBackground);">
      <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
      <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
      <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
      <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
    </div>
    </code>
  </li>
  <li>
  ${raccoonConfig.t("Select prompt (by typing <code>/</code>)/write your question in input box at bottom, complete the prompt (if necessary), click send button (or press <code>Enter</code>) to ask {{robotname}}", { robotname: extensionDisplayName })}:
      <a onclick="document.getElementById('question-input').focus();document.getElementById('chat-input-box').classList.remove('flash');void document.getElementById('chat-input-box').offsetHeight;document.getElementById('chat-input-box').classList.add('flash');" style="text-decoration: none;cursor: pointer;">
        <div class="chat-box flex p-1 px-2 m-2 text-xs flex-row-reverse rounded-md"><span style="color: var(--input-placeholder-foreground);" class="material-symbols-rounded">send</span></div>
      </a>
  </li>
  <li>
  ${raccoonConfig.t("Or, select prompt without leaving the editor by pressing hotkey (default: <code>{{hotkey}}</code>)", { hotkey: isMac ? "⌥/" : "Alt+/" })}:
        <div class="flex flex-col m-2 text-xs" style="border: 1px solid var(--vscode-editorSuggestWidget-border);background-color: var(--vscode-editorSuggestWidget-background);">
        <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground);" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 70%;"></span></div>
        <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground);" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 50%;" class="animate-pulse"></span></div>
        <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground);" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 60%;"></span></div>
  </li>
  </ol>
  ${raccoonManager.isClientLoggedin() ? "" : buildLoginHint()}
  ${buildDocumentLinkHint()}
  `;
}

export async function buildLoginPage(context: ExtensionContext, _webview: Webview): Promise<string> {
  let isEnterprise = (raccoonConfig.type === "Enterprise");
  let methods = raccoonManager.getAuthMethods();
  if (methods.length === 0) {
    return "";
  }
  let tabs = '';
  let views = '';
  if (methods.includes(AuthMethod.browser)) {
    let callback = Uri.parse(`${env.uriScheme}://${context.extension.id}/login`).toString();
    let loginUrl = raccoonManager.getAnthUrl({
      type: AuthMethod.browser,
      callback,
      appName: extensionDisplayName
    });
    if (loginUrl) {
      tabs += `<vscode-panel-tab id="tab-browser" class="login-panel-tab">${raccoonConfig.t("Browser")}</vscode-panel-tab>`;
      views += `<vscode-panel-view id="view-browser" class="login-view flex-col gap-2">
                  <div></div>
                  <span class="material-symbols-rounded" style="text-align: center;font-size: 80px;opacity: 0.4;font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48;">cloud_sync</span>
                  <a title="${raccoonConfig.t("Login")}" class="sso-btn" href="${loginUrl}">
                    <vscode-button style="width: 100%">${raccoonConfig.t("Login")}</vscode-button>
                  </a>
                  <div></div>
                </vscode-panel-view>`;
    }
  }
  if (methods.includes(AuthMethod.wechat)) {
    tabs += `<vscode-panel-tab id="tab-qrcode" class="login-panel-tab">${raccoonConfig.t("WeChat")}</vscode-panel-tab>`;
    views += `<vscode-panel-view id="view-qrcode" class="login-view flex-col gap-2">
                  <div></div>
                  <div id="qrcode" class="mx-auto h-40 border-8 border-white empty"></div>
                  <div></div>
                </vscode-panel-view>`;
  }
  if (methods.includes(AuthMethod.email)) {
    tabs += `<vscode-panel-tab id="tab-email" class="login-panel-tab">${raccoonConfig.t("Email")}</vscode-panel-tab>`;
    let forgetPwdLink = raccoonManager.getUrl(UrlType.forgetPassword);
    let forgetPwd = '';
    if (forgetPwdLink) {
      forgetPwd = `<vscode-link tabindex="-1" title="${raccoonConfig.t("Forgot Password")}?" class="text-xs" href="${forgetPwdLink}">
                ${raccoonConfig.t("Forgot Password")}?
              </vscode-link>`;
    } else {
      forgetPwd = `<vscode-link tabindex="-1" title="${raccoonConfig.t("Forgot Password")}? ${raccoonConfig.t("Contact Administrator")}" class="text-xs" href="#">
                ${raccoonConfig.t("Forgot Password")}?
              </vscode-link>`;
    }
    views += `<vscode-panel-view id="view-email" class="login-view flex-col gap-2">
                <div class="flex flex-col gap-2">
                <div class="flex flex-row">
                  <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">mail</span>
                  <vscode-text-field class="grow" type="email" autofocus id="login-email-account" required="required">
                  </vscode-text-field>
                </div>
                <div class="flex flex-row">
                  <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">lock</span>
                  <vscode-text-field type="password" pattern=".{8,32}" maxlength=32 id="login-email-password" onkeydown="((e) => {if(event.key !== 'Enter') {return;} var account = document.getElementById('login-email-account');var pwd = document.getElementById('login-email-password');if(account.validity.valid && pwd.validity.valid){document.getElementById('login-email-btn').click();};})(this)" class="grow" required="required">
                    <div slot="end" onclick="((e) => {e.children[0].classList.toggle('hidden');e.children[1].classList.toggle('hidden');var pwd = document.getElementById('login-email-password');if (pwd.type === 'password') {pwd.type = 'text';} else {pwd.type = 'password';}})(this)">
                      <span class="material-symbols-rounded opacity-50 cursor-pointer">visibility_off</span>
                      <span class="material-symbols-rounded opacity-50 cursor-pointer hidden">visibility</span>
                    </div>
                  </vscode-text-field>
                </div>
                <div class="flex flex-col">
                  <div class="grow text-right">
                    ${forgetPwd}
                  </div>
                </div>
                </div>
                <vscode-button id="login-email-btn" class="login-btn" disabled tabindex="0">${raccoonConfig.t("Login")}</vscode-button>
              </vscode-panel-view>`;
  }
  if (!isEnterprise && methods.includes(AuthMethod.phone)) {
    tabs += `<vscode-panel-tab id="tab-pwd" class="login-panel-tab">${raccoonConfig.t("Phone")}</vscode-panel-tab>`;
    let forgetPwdLink = raccoonManager.getUrl(UrlType.forgetPassword);
    let forgetPwd = '';
    if (forgetPwdLink) {
      forgetPwd = `<vscode-link tabindex="-1" title="${raccoonConfig.t("Forgot Password")}?" class="text-xs" href="${forgetPwdLink}">
                ${raccoonConfig.t("Forgot Password")}?
              </vscode-link>`;
    } else {
      forgetPwd = `<vscode-link tabindex="-1" title="${raccoonConfig.t("Forgot Password")}? ${raccoonConfig.t("Contact Administrator")}" class="text-xs" href="#">
                ${raccoonConfig.t("Forgot Password")}?
              </vscode-link>`;
    }

    let phoneAccount = `<div class="flex flex-row">
                            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);">public</span>
                            <vscode-dropdown class="grow" id="login-phone-code" value="86">
                              ${Object.keys(phoneZoneCode).map((v, _idx, _arr) => `<vscode-option value="${phoneZoneCode[v]}" style="padding: 0 calc(var(--design-unit) * 2px);">${v} (${phoneZoneCode[v]})</vscode-option>`).join('')}
                            </vscode-dropdown>
                          </div>
                          <div class="flex flex-row">
                            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">smartphone</span>
                            <vscode-text-field class="grow" type="tel" autofocus pattern="[0-9]{7,11}" maxlength=11 id="login-phone-account" required="required">
                            </vscode-text-field>
                          </div>`;
    let passwordForm = `
          <div class="flex flex-row">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--input-background);">lock</span>
            <vscode-text-field type="password" pattern=".{8,32}" maxlength=32 id="login-phone-password" onkeydown="((e) => {if(event.key !== 'Enter') {return;} var account = document.getElementById('login-phone-account');var pwd = document.getElementById('login-phone-password');if(account.validity.valid && pwd.validity.valid){document.getElementById('login-phone-btn').click();};})(this)" class="grow" required="required">
              <div slot="end" onclick="((e) => {e.children[0].classList.toggle('hidden');e.children[1].classList.toggle('hidden');var pwd = document.getElementById('login-phone-password');if (pwd.type === 'password') {pwd.type = 'text';} else {pwd.type = 'password';}})(this)">
                <span class="material-symbols-rounded opacity-50 cursor-pointer">visibility_off</span>
                <span class="material-symbols-rounded opacity-50 cursor-pointer hidden">visibility</span>
              </div>
            </vscode-text-field>
          </div>
          <div class="flex flex-col">
            <div class="grow text-right">
              ${forgetPwd}
            </div>
          </div>`;
    views += `<vscode-panel-view id="view-pwd" class="login-view flex-col gap-2">
              <div class="flex flex-col gap-2">
                ${phoneAccount}
                ${passwordForm}
              </div>
              <vscode-button id="login-phone-btn" class="login-btn" disabled tabindex="0">${raccoonConfig.t("Login")}</vscode-button>
            </vscode-panel-view>`;
  }

  let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${raccoonManager.getActiveClientRobotName()}">`;
  let es = raccoonManager.robotNames;
  for (let label of es) {
    esList += `<vscode-option value="${label}">${label}</vscode-option>`;
  }
  esList += "</vscode-dropdown>";

  let signupUrl = raccoonManager.getUrl(UrlType.signup);
  let signupLink = ``;
  if (!isEnterprise && signupUrl) {
    signupLink = `<span class="self-center grow">
      ${raccoonConfig.t("Do not have an account?")}
      <vscode-link title="${raccoonConfig.t("Sign Up")}" class="text-xs mx-1 self-center" href="${signupUrl}">
        ${raccoonConfig.t("Sign Up")}
      </vscode-link>
    </span>`;
  }
  let feedbackBtn = `<div class="flex grow self-center cursor-pointer items-end opacity-50">
                                  <span class="material-symbols-rounded">bug_report</span><span id="report-issue">${raccoonConfig.t("Report Issue")}</span>
                                </div>`;

  let settingPage = `
  <style>
      .login-view  {
        height: 220px;
        justify-content: space-between;
      }
      .sso-btn {
        max-width: 100%;
        width: 300px;
        align-self: center;
      }
      .login-btn {
        width: 300px;
        max-width: 100%;
        margin: 0 auto;
      }
      vscode-text-field:invalid {
        --focus-border: var(--vscode-inputValidation-warningBorder);
      }
  </style>
  <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 pt-0 max-w-md">
    <div class="immutable flex gap-2 py-2 px-2 justify-between -mx-2 mb-2 rounded-xl" style="border-bottom: 1px solid var(--panel-view-border);">
      <vscode-link href="#" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">
        <span class="material-symbols-rounded">undo</span>
      </vscode-link>
      <span class="flex gap-2">
        <vscode-link href="command:${extensionNameKebab}.displayLanguage" title="${raccoonConfig.t("Switch Display Language")}">
          <span class="material-symbols-rounded">translate</span>
        </vscode-link>
        <vscode-link href="#" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">
          <span class="material-symbols-rounded">close</span>
        </vscode-link>
      </span>
    </div>
    <vscode-divider class="${es.length === 1 ? "hidden" : ""}" style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <b class="${es.length === 1 ? "hidden" : ""}">${raccoonConfig.t("Service")}</b>
    <div class="flex flex-col ml-4 my-2 px-2 gap-2 ${es.length === 1 ? "hidden" : ""}">
      <span class="-ml-2">${raccoonConfig.t("Code Engine")}</span>
      <div class="flex flex-row">
        <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);" title="${raccoonConfig.t("Code Engine")}">assistant</span>
        ${esList}
      </div>
    </div>
    <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <vscode-panels style="overflow: visible" class="px-4">
      ${tabs}
      ${views}
    </vscode-panels>
    <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    ${signupLink}
    ${feedbackBtn}`;

  return settingPage;
}

export async function buildSettingPage(): Promise<string> {
  let completionPreference = raccoonManager.completionPreference;
  let streamResponse = raccoonManager.streamResponse;
  let completionDelay = raccoonManager.completionDelay;
  let candidates = raccoonManager.candidates;

  let userinfo = await raccoonManager.userInfo();
  let userId = userinfo?.userId;
  let username = userinfo?.username;
  let avatar = userinfo?.avatar;
  let pro = userinfo?.pro || false;
  let avatarEle = `<span class="material-symbols-rounded" style="font-size: 40px;">person_pin</span>`;
  if (avatar) {
    avatarEle = `<img class="w-10 h-10 rounded-full" src="${avatar}" />`;
  }
  let logout = `<vscode-link title="${raccoonConfig.t("Logout")}">
                    <span id="logoutConfirm" class="material-symbols-rounded" style="font-size: 24px;">logout</span>
                  </vscode-link>`;
  let trigger = (completionDelay === 3500) ? "opacity-60" : "";
  let activeOrg = raccoonManager.activeOrganization();
  let knowledgeBaseEnable = pro || activeOrg;
  let isEnterprise = (raccoonConfig.type === "Enterprise");
  let disableSwitch = raccoonManager.organizationList().length === 0 || (isEnterprise && (raccoonManager.organizationList().length === 1));

  let knowledgeBaseSetting = ``;
  if (raccoonManager.capabilities.includes(Capability.fileSearch)) {
    knowledgeBaseSetting = `<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <div class="flex gap-2 items-center ${knowledgeBaseEnable ? "" : "opacity-50"}">
      <b>${raccoonConfig.t("Retrieval Argumention")}</b>
      <vscode-badge class="${activeOrg ? "hidden" : "opacity-50"}">Pro</vscode-badge>
    </div>
    <div class="ml-4 my-1">
      <label class="my-1 ${knowledgeBaseEnable ? "" : "opacity-50"}" slot="label">${raccoonConfig.t("Reference Source")}</label>
      <div class="flex flex-wrap ml-2 my-1">
        <vscode-checkbox ${knowledgeBaseEnable ? "" : "disabled"} title="${await raccoonManager.listKnowledgeBase().then(kbs => kbs.map((v, _idx, _arr) => v.name).join("\n"))}" class="w-40" id="knowledgeBaseRef" ${knowledgeBaseEnable && raccoonManager.knowledgeBaseRef ? "checked" : ""}>${raccoonConfig.t("Knowledge Base")}</vscode-checkbox>
        <vscode-checkbox ${knowledgeBaseEnable ? "" : "disabled"} class="w-40" id="workspaceRef" ${knowledgeBaseEnable && raccoonManager.workspaceRef ? "checked" : ""}>${raccoonConfig.t("Workspace Files")}</vscode-checkbox>
        <vscode-checkbox ${knowledgeBaseEnable ? "" : "disabled"} class="w-40 hidden" id="webRef" ${knowledgeBaseEnable && raccoonManager.webRef ? "checked" : ""}>${raccoonConfig.t("Internet")}</vscode-checkbox>
      </div>
    </div>`;
  }

  let accountInfo = `
  <div class="flex gap-2 items-center w-full">
    ${avatarEle}
    ${(activeOrg) ? `<div class="grow flex flex-col">
    <span class="font-bold text-base" ${userId ? `title="${activeOrg.username || username} @${userId}"` : ""}>${activeOrg.username || username || "User"}</span>
    <div class="flex w-fit rounded-sm gap-1 leading-relaxed items-center px-1 py-px" style="color: var(--button-primary-foreground);background: var(--button-primary-background);">
      <span class="switch-org material-symbols-rounded ${disableSwitch ? "hidden" : "cursor-pointer"} text-[15px]" title="${raccoonConfig.t("Switch Organization")}">sync_alt</span>
      <div  class="text-[10px] ${disableSwitch ? "org-tag" : "cursor-pointer switch-org"}" title="${raccoonConfig.t("Managed by {{org}}", { org: activeOrg.name })}">
        ${activeOrg.name}
      </div>
    </div>
  </div>` : `<div class="grow flex flex-col">
    <div class="flex">
      <span class="font-bold text-base" ${userId ? `title="${username} @${userId}"` : ""}>${username || "User"}</span>
    </div>
    <div class="${username ? "flex" : "hidden"} w-fit rounded-sm gap-1 leading-relaxed items-center px-1 py-px" style="color: var(--button-primary-foreground);background: var(--button-primary-background);">
      <span class="switch-org material-symbols-rounded ${disableSwitch ? "hidden" : "cursor-pointer"} text-[15px]" title="${raccoonConfig.t("Switch Organization")}">sync_alt</span>
      <div class="text-[10px] ${disableSwitch ? "org-tag" : "cursor-pointer switch-org"}" title="${raccoonConfig.t("Individual")}${pro ? " Pro" : ""}">
        ${raccoonConfig.t("Individual")}${pro ? " Pro" : ""}
      </div>
    </div>
  </div>`}
    ${logout}
  </div>
  `;
  let settingOptions = `<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
  <div class="flex gap-2 items-center">
    <b>${raccoonConfig.t("Inline Completion")}</b>
    <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify(`${extensionNameKebab}.inlineSuggest.`))}`)}" title="${raccoonConfig.t("Set Keyboard Shortcuts")}">
      <span class="material-symbols-rounded">keyboard</span>
    </vscode-link>
  </div>
  <div class="ml-4 mb-4">
    <div class="container px-2 min-w-max">
      <label slot="label" class="-ml-2">${raccoonConfig.t("Trigger Delay")}</label>
      <div class="sliderLabels">
        <span class="cursor-pointer ${trigger} ${completionDelay === 0 ? "active" : ""} material-symbols-rounded" onclick="vscode.postMessage({ type: 'completionDelay', value: 0 })" title="${raccoonConfig.t("Instant")}">timer</span>
        <span class="cursor-pointer ${trigger} ${completionDelay === 500 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 500 })" title="${raccoonConfig.t("Delay {{delay}}s", { delay: "0.5" })}">0.5</span>
        <span class="cursor-pointer ${trigger} ${completionDelay === 1000 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 1000 })" title="${raccoonConfig.t("Delay {{delay}}s", { delay: "1" })}">1.0</span>
        <span class="cursor-pointer ${trigger} ${completionDelay === 1500 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 1500 })" title="${raccoonConfig.t("Delay {{delay}}s", { delay: "1.5" })}">1.5</span>
        <span class="cursor-pointer ${trigger} ${completionDelay === 2000 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 2000 })" title="${raccoonConfig.t("Delay {{delay}}s", { delay: "2" })}">2.0</span>
        <span class="cursor-pointer ${trigger} ${completionDelay === 2500 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 2500 })" title="${raccoonConfig.t("Delay {{delay}}s", { delay: "2.5" })}">2.5</span>
        <span class="cursor-pointer ${trigger} ${completionDelay === 3000 ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionDelay', value: 3000 })" title="${raccoonConfig.t("Delay {{delay}}s", { delay: "3" })}">3.0</span>
        <span class="cursor-pointer ${completionDelay === 3500 ? "active" : ""} material-symbols-rounded" onclick="vscode.postMessage({ type: 'completionDelay', value: 3500 })" title="${raccoonConfig.t("Manual")}">block</span>
      </div>
      <input type="range" min="0" max="3500" value="${completionDelay}" step="500" class="slider" id="triggerDelay">
    </div>
  </div>
  <div class="ml-4 mb-4">
    <div class="container px-2 min-w-max">
      <label slot="label" class="-ml-2">${raccoonConfig.t("Completion Preference")}</label>
      <div class="sliderLabels">
        <span class="cursor-pointer material-symbols-rounded ${completionPreference === CompletionPreferenceType.singleLine ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionPreference', value: 0 })" title="${raccoonConfig.t("Single Line")}">text_select_jump_to_end</span>
        <span class="cursor-pointer material-symbols-rounded ${completionPreference === CompletionPreferenceType.balanced ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionPreference', value: 1 })" title="${raccoonConfig.t("Balanced")}">notes</span>
        <span class="cursor-pointer material-symbols-rounded ${completionPreference === CompletionPreferenceType.bestEffort ? "active" : ""}" onclick="vscode.postMessage({ type: 'completionPreference', value: 2 })" title="${raccoonConfig.t("Best Effort")}">all_inclusive</span>
      </div>
      <input type="range" min="0" max="2" value="${completionPreference === CompletionPreferenceType.singleLine ? 0 : completionPreference === CompletionPreferenceType.balanced ? 1 : 2}" class="slider" id="completionPreference">
    </div>
  </div>
  <div class="ml-4 mb-4">
    <div class="container px-2 min-w-max">
      <label slot="label" class="-ml-2">${raccoonConfig.t("Max Candidate Number")}</label>
      <div class="sliderLabels">
        <span class="cursor-pointer material-symbols-rounded ${candidates === 1 ? "active" : ""}" onclick="vscode.postMessage({ type: 'candidates', value: 1 })" title="${raccoonConfig.t("1 Candidate")}">looks_one</span>
        <span class="cursor-pointer material-symbols-rounded ${candidates === 2 ? "active" : ""}" onclick="vscode.postMessage({ type: 'candidates', value: 2 })" title="${raccoonConfig.t("{{candidateNum}} Candidates", { candidateNum: 2 })}">filter_2</span>
        <span class="cursor-pointer material-symbols-rounded ${candidates === 3 ? "active" : ""}" onclick="vscode.postMessage({ type: 'candidates', value: 3 })" title="${raccoonConfig.t("{{candidateNum}} Candidates", { candidateNum: 3 })}">filter_3</span>
      </div>
      <input type="range" min="1" max="3" value="${candidates}" class="slider" class="slider" id="candidateNumber">
    </div>
  </div>
  <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
  <div class="flex gap-2 items-center">
  <b>${raccoonConfig.t("Code Assistant")}</b>
  <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify(`${extensionNameKebab}.chat.`))}`)}" title="${raccoonConfig.t("Set Keyboard Shortcuts")}">
    <span class="material-symbols-rounded">keyboard</span>
  </vscode-link>
  </div>
  <div class="ml-4">
    <vscode-radio-group id="responseModeRadio" class="flex flex-wrap px-2">
      <label slot="label" class="-ml-2">${raccoonConfig.t("Show Response")}</label>
      <vscode-radio ${streamResponse ? "checked" : ""} class="w-40" value="Streaming" title="${raccoonConfig.t("Display the response streamingly, you can stop it at any time")}">
        ${raccoonConfig.t("Streaming")}
      </vscode-radio>
      <vscode-radio ${streamResponse ? "" : "checked"} class="w-40" value="Monolithic" title="${raccoonConfig.t("Wait entire result returned, and display at once")}">
        ${raccoonConfig.t("Monolithic")}
      </vscode-radio>
    </vscode-radio-group>
  </div>
  ${knowledgeBaseSetting}
  <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
  <div class="flex flex-col">
    <vscode-checkbox id="privacy" ${raccoonManager.privacy ? "checked" : ""}>${raccoonConfig.t("Join the User Experience Improvement Program")}</vscode-checkbox>
    <div style="display: flex; align-items: center; gap: 10px; margin: 4px 0;">
      <span class="material-symbols-rounded text-2xl" style="font-size: 18px;margin: 0 -1px;">bug_report</span><span id="report-issue" style="cursor: pointer">${raccoonConfig.t("Report Issue")}</span>
    </div>
  </div>
  <div class="flex grow place-content-center py-8">
  <vscode-button id="clearAll" class="mx-2 self-end w-60" appearance="secondary">
    ${raccoonConfig.t("Clear all settings")}
    <span slot="start" class="material-symbols-rounded">settings_power</span>
  </vscode-button>
  </div>
</div>
`;

  let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${raccoonManager.getActiveClientRobotName()}">`;
  let es = raccoonManager.robotNames;
  for (let label of es) {
    esList += `<vscode-option value="${label}">${label}</vscode-option>`;
  }
  esList += "</vscode-dropdown>";

  let settingPage = `
  <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 pt-0 max-w-md">
    <div class="immutable flex gap-2 py-2 px-2 justify-between -mx-2 mb-2 rounded-xl" style="border-bottom: 1px solid var(--panel-view-border);">
      <vscode-link href="#" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">
        <span class="material-symbols-rounded">undo</span>
      </vscode-link>
      <span class="flex gap-2">
        <vscode-link href="command:${extensionNameKebab}.displayLanguage" title="${raccoonConfig.t("Switch Display Language")}">
          <span class="material-symbols-rounded">translate</span>
        </vscode-link>
        <vscode-link href="#" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">
          <span class="material-symbols-rounded">close</span>
        </vscode-link>
      </span>
    </div>
    <div class="immutable flex flex-col px-2 gap-2">
      <div class="flex flex-row gap-2 items-center justify-between">
        ${accountInfo}
      </div>
    </div>
    <vscode-divider class="${es.length === 1 ? "hidden" : ""}" style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
    <b class="${es.length === 1 ? "hidden" : ""}">${raccoonConfig.t("Service")}</b>
    <div class="flex flex-col ml-4 my-2 px-2 gap-2 ${es.length === 1 ? "hidden" : ""}">
      <span class="-ml-2">${raccoonConfig.t("Code Engine")}</span>
      <div class="flex flex-row">
        <span class="material-symbols-rounded attach-btn-left" style="padding: 3px; background-color: var(--dropdown-background);" title="${raccoonConfig.t("Code Engine")}">assistant</span>
        ${esList}
      </div>
    </div>
    ${settingOptions}`;

  return settingPage;
}

export async function buildChatHtml(context: ExtensionContext, webview: Webview) {
  const scriptUri = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'main.js'));
  const stylesMainUri = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'main.css'));

  const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
  const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
  const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'vendor', 'marked.min.js'));
  const mermaidJs = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'vendor', 'mermaid.min.js'));
  const vendorTailwindJs = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
  const toolkitUri = webview.asWebviewUri(Uri.joinPath(context.extensionUri, "media", "vendor", "toolkit.js"));
  const vendorQRCodeJs = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'vendor', 'qrcode.min.js'));
  const iconUri = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));
  const avatarDarkUri = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'raccoon-dark.svg'));
  const avatarLightUri = webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'raccoon-light.svg'));

  return `<!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link href="${stylesMainUri}" rel="stylesheet">
              <link href="${vendorHighlightCss}" rel="stylesheet">
              <link href="${iconUri}" rel="stylesheet" />
              <script src="${vendorHighlightJs}"></script>
              <script src="${vendorMarkedJs}"></script>
              <script src="${mermaidJs}"></script>
              <script src="${vendorTailwindJs}"></script>
              <script src="${vendorQRCodeJs}"></script>
              <script type="module" src="${toolkitUri}"></script>
              <style>
              .vscode-high-contrast .robot-avatar,
              .vscode-dark .robot-avatar {
                -webkit-mask-image: url("${avatarDarkUri}");
                mask-image: url("${avatarDarkUri}");
              }
              .vscode-high-contrast-light .robot-avatar,
              .vscode-light .robot-avatar {
                -webkit-mask-image: url("${avatarLightUri}");
                mask-image: url("${avatarLightUri}");
              }
              </style>
          </head>
          <body class="overflow-hidden">
            <div class="modal absolute flex w-full h-full select-none bg-gray-900/50 items-center hidden"></div>
            <div id="setting-page"></div>
            <div class="flex flex-col h-screen" id="qa-list-wrapper">
              <vscode-panel-view id="view-1" class="grow overflow-y-auto p-0 m-0">
                <div class="flex flex-col flex-1 overflow-y-auto" id="qa-list">
                  <vscode-progress-ring class="progress-ring w-full content-center mt-32"></vscode-progress-ring>
                </div>
              </vscode-panel-view>
              <div id="msg-wrapper">
              </div>
              <div id="chat-input-box" class="chat-box w-full flex flex-col justify-center items-center px-1">
                <div id="search-list" class="flex flex-col w-full py-2 hidden">
                  <vscode-checkbox class="px-2 py-1 m-0" checked title='Search in StackOverflow' data-query='${extensionNameKebab}://${extensionNameKebab}.search/stackoverflow.search?\${query}'>
                    StackOverflow
                  </vscode-checkbox>
                  <vscode-checkbox class="px-2 py-1 m-0" title='Search in StackOverflow w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Astackoverflow.com+\${query}'>
                    StackOverflow [DuckDuckGo]
                  </vscode-checkbox>
                  <vscode-checkbox class="px-2 py-1 m-0" title='Search in Quora' data-query='https://www.quora.com/search?q=\${query}'>
                    Quora [Web]
                  </vscode-checkbox>
                  <vscode-checkbox class="px-2 py-1 m-0" title='Search in Zhihu' data-query='https://www.zhihu.com/search?q=\${query}'>
                    Zhihu [Web]
                  </vscode-checkbox>
                  <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Adocs.python.org+\${query}'>
                    Python Reference [DuckDuckGo]
                  </vscode-checkbox>
                  <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Acppreference.com+\${query}'>
                    C++ Reference [DuckDuckGo]
                  </vscode-checkbox>
                  <vscode-checkbox class="px-2 py-1 m-0" title='Search in MDN Web Docs' data-query='https://developer.mozilla.org/zh-CN/search?q=\${query}'>
                    MDN Web Docs [Web]
                  </vscode-checkbox>
                </div>
                <div id="agent-list" class="flex flex-col hidden">
                </div>
                <div id="ask-list" class="flex flex-col hidden">
                </div>
                <div id="file-list" class="flex flex-col w-full hidden">
                </div>
                <div id="question" class="w-full flex justify-center items-center">
                  <span class="material-symbols-rounded opacity-60 history-icon">
                    history
                  </span>
                  <div id="agent-indicator" class="flex hidden">
                    <button id="agent-tab-btn" title="${raccoonConfig.t("Switch")}"></button>
                    <button id="agent-delete-btn" title="${raccoonConfig.t("Delete")}"></button>
                  </div>
                  <label id="question-sizer" data-value
                        data-placeholder="${raccoonConfig.t("Ask {{robotname}} a question", { robotname: extensionDisplayName })}"
                        data-action-hint="${raccoonConfig.t("Pick one prompt to send")} [Enter]"
                        data-agent-hint="${raccoonConfig.t("Pick one agent")} [Enter]"
                        data-search-hint="${raccoonConfig.t("Type anything to search")} [Enter]"
                        data-file-hint="${raccoonConfig.t("Select file to attach")} [Enter]"
                        data-tip="${raccoonConfig.t("Ask {{robotname}} a question", { robotname: extensionDisplayName })}"
                        data-tip1="${raccoonConfig.t("Double-pressing {{hotkey}} to summon me at any time.", { hotkey: "[Ctrl]" })}"
                        data-tip2="${raccoonConfig.t("Type [Shift + Enter] to start a new line")}"
                        data-tip3="${raccoonConfig.t("Press [Esc] to stop responding")}"
                  >
                    <textarea id="question-input" oninput="this.parentNode.dataset.value = this.value" rows="1"></textarea>
                  </label>
                  <button id="attach-button" class="${!raccoonConfig.beta.includes("fileAttach") ? "hidden" : ""}">
                    <span class="material-symbols-rounded open" title="${raccoonConfig.t("Attach File")}">attach_file_add</span>
                    <span class="material-symbols-rounded close" title="${raccoonConfig.t("Close")}">keyboard_arrow_down</span>
                  </button>
                  <button id="send-button" title="${raccoonConfig.t("Send")} [Enter]">
                    <span class="material-symbols-rounded">send</span>
                  </button>
                  <button id="cancel-button" title="${raccoonConfig.t("Cancel")} [Esc]">
                    <span class="material-symbols-rounded">undo</span>
                  </button>
                  <button id="stop-button" title="${raccoonConfig.t("Stop")} [Esc]">
                    <span class="material-symbols-rounded">stop</span>
                  </button>
                  <button id="search-button" title="${raccoonConfig.t("Search")} [Enter]">
                    <span class="material-symbols-rounded">search</span>
                  </button>
                </div>
                <div id="attach-code-container" class="flex hidden"></div>
                <div id="attach-file-container" class="flex hidden"></div>
                  <div class="op-hint">
                    <div id="switch-org-btn" class="switch-org prompt-hint hidden cursor-pointer items-end flex">
                      <span class="flex material-symbols-rounded">deployed_code</span>
                      <div id="switch-org-btn-label" class="text-ellipsis whitespace-nowrap overflow-hidden max-w-[10ch]">${raccoonConfig.t("Individual")}</div>
                    </div>
                    <vscode-badge class="prompt-ready-hint items-center">
                      <span class="key">Shift+<span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("New Line")}
                    </vscode-badge>
                    <vscode-badge class="prompt-ready-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("Send")}
                    </vscode-badge>
                    <vscode-badge class="stop-hint items-center">
                      <span class="key">Esc</span>${raccoonConfig.t("Stop")}
                    </vscode-badge>
                    <vscode-badge class="prompt-hint items-center">
                      <span class="key">/</span>${raccoonConfig.t("Prompt")}
                    </vscode-badge>
                    <vscode-badge class="prompt-hint items-center ${!raccoonConfig.beta.includes("agent") ? "hidden" : ""}">
                      <span class="key">@</span>${raccoonConfig.t("Agent")}
                    </vscode-badge>
                    <vscode-badge class="prompt-hint items-center">
                      <span class="key">↑↓</span>${raccoonConfig.t("History")}
                    </vscode-badge>
                    <vscode-badge class="prompt-hint items-center">
                      <span class="key">?</span>${raccoonConfig.t("Search")}
                    </vscode-badge>
                    <vscode-badge class="agent-hint items-center">
                      <span class="key">↑↓</span>${raccoonConfig.t("Switch")}
                    </vscode-badge>
                    <vscode-badge class="agent-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("Select")}
                    </vscode-badge>
                    <vscode-badge class="action-hint items-center">
                      <span class="key">↑↓</span>${raccoonConfig.t("Switch")}
                    </vscode-badge>
                    <vscode-badge class="action-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("Select")}
                    </vscode-badge>
                    <vscode-badge class="file-hint items-center">
                      <span class="key">↑↓</span>${raccoonConfig.t("Switch")}
                    </vscode-badge>
                    <vscode-badge class="file-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("Select")}
                    </vscode-badge>
                    <vscode-badge class="search-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("Search")}
                    </vscode-badge>
                    <vscode-badge class="history-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_return</span></span>${raccoonConfig.t("Send")}
                    </vscode-badge>
                    <vscode-badge class="history-hint items-center">
                      <span class="key"><span class="material-symbols-rounded">keyboard_tab</span></span>${raccoonConfig.t("Revise")}
                    </vscode-badge>
                    <vscode-badge class="history-hint items-center">
                      <span class="key">Esc</span>${raccoonConfig.t("Clear")}
                    </vscode-badge>
                  </div>
              </div>
            </div>
            <script>
              const l10nForUI = {
                "Cancel": "${raccoonConfig.t("Cancel")}",
                "Delete": "${raccoonConfig.t("Delete")}",
                "Edit": "${raccoonConfig.t("Edit")}",
                "DeleteQA": "${raccoonConfig.t("Delete this chat entity")}",
                "Send": "${raccoonConfig.t("Send")}",
                "Others": "${raccoonConfig.t("Others")}",
                "Workspace Files": "${raccoonConfig.t("Workspace Files")}",
                "Knowledge Base": "${raccoonConfig.t("Knowledge Base")}",
                "ToggleWrap": "${raccoonConfig.t("Toggle line wrap")}",
                "Show graph": "${raccoonConfig.t("Show graph")}",
                "Hide graph": "${raccoonConfig.t("Hide graph")}",
                "Favorite": "${raccoonConfig.t("Add to favorites")}",
                "Diff": "${raccoonConfig.t("Diff with selected code")}",
                "Copy": "${raccoonConfig.t("Copy to clipboard")}",
                "Insert": "${raccoonConfig.t("Insert the below code at cursor")}",
                "Thinking...": "${raccoonConfig.t("Thinking...")}",
                "Connecting...": "${raccoonConfig.t("Connecting...")}",
                "Typing...": "${raccoonConfig.t("Typing...")}",
                "Continue": "${raccoonConfig.t("Continue")}",
                "Stop responding": "${raccoonConfig.t("Stop responding")}",
                "Regenerate": "${raccoonConfig.t("Regenerate")}",
                "Empty prompt": "${raccoonConfig.t("Empty prompt")}"
              };
              mermaid.initialize({ startOnLoad: true });
            </script>
            <script src="${scriptUri}"></script>
          </body>
          </html>`;
}