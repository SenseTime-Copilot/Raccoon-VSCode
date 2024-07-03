import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, commands, Webview, Uri, env, TextEditor, Disposable, TextDocument, TextEditorEdit, Range } from 'vscode';
import { raccoonManager, outlog, telemetryReporter, extensionNameKebab, raccoonSearchEditorProviderViewType, favoriteCodeEditorViewType, raccoonConfig, registerCommand, extensionDisplayName } from "../globalEnv";
import { PromptInfo, PromptType, RenderStatus, RaccoonPrompt } from "./promptTemplates";
import { RaccoonEditorProvider } from './assitantEditorProvider';
import { CompletionPreferenceType } from './raccoonManager';
import { Choice, FinishReason, Message, MetricType, Role } from '../raccoonClient/CodeClient';
import { buildHeader } from '../utils/buildRequestHeader';
import { diffCode } from './diffContentProvider';
import { HistoryCache, CacheItem, CacheItemType } from '../utils/historyCache';
import { FavoriteCodeEditor } from './favoriteCode';
import { ModelCapacity } from './config';
import { buildChatHtml, buildLoginPage, buildSettingPage, buildWelcomeMessage, makeGuide } from './webviewTemplates';

interface TelemetryInfo {
  id: number;
  ts: number;
  action: string;
  languageid: string;
}

export class RaccoonEditor extends Disposable {
  private stopList: { [key: number]: AbortController };
  private lastTextEditor?: TextEditor;
  private cache: HistoryCache;

  private isSupportedScheme(d: TextDocument) {
    return (d.uri.scheme === "file" || d.uri.scheme === "git" || d.uri.scheme === "untitled" || d.uri.scheme === "vscode-notebook-cell" || d.uri.scheme === "vscode-userdata" || d.uri.scheme === "vscode-remote");
  }

  constructor(private readonly context: ExtensionContext, private webview: Webview) {
    super(() => { });
    this.cache = new HistoryCache(context, `${env.sessionId}-${new Date().valueOf()}`);
    this.stopList = {};
    this.lastTextEditor = window.activeTextEditor;
    raccoonManager.onDidChangeStatus(async (e) => {
      if (e.scope.includes("authorization") && !e.quiet) {
        this.showWelcome();
      } else if (e.scope.includes("agent")) {
        let value = Array.from(raccoonManager.agent.values());
        value = value.filter((v, _idx, _arr) => {
          return raccoonManager.checkAgentVisibility(v.id);
        });
        this.sendMessage({ type: 'agentList', value });
      } else if (e.scope.includes("prompt")) {
        let value = raccoonManager.prompt;
        value = value.filter((v, _idx, _arr) => {
          return raccoonManager.checkPromptVisibility(v.label);
        });
        this.sendMessage({ type: 'promptList', value });
      } else if (e.scope.includes("engines")) {
        this.updateSettingPage("full");
      } else if (e.scope.includes("active")) {
        this.updateSettingPage("full");
        this.showWelcome(true);
      } else if (e.scope.includes("config")) {
        this.updateSettingPage();
      }
    });
    context.subscriptions.push(
      window.onDidChangeActiveTextEditor((e) => {
        let doc: TextDocument | undefined = undefined;
        if (e) {
          doc = e.document;
        } else {
          let docs = workspace.textDocuments;
          for (let d of docs) {
            if (this.isSupportedScheme(d)) {
              return;
            }
          }
        }
        if (!doc) {
          this.lastTextEditor = undefined;
          this.sendMessage({ type: 'codeReady', value: false });
        } else if (this.isSupportedScheme(doc)) {
          this.lastTextEditor = e;
          if (e && this.checkCodeReady(e)) {
            this.sendMessage({ type: 'codeReady', value: true, label: workspace.asRelativePath(e.document.uri), file: e.document.uri.toString(), range: e.selections[0] });
          } else {
            this.sendMessage({ type: 'codeReady', value: false });
          }
        }
      })
    );
    context.subscriptions.push(
      workspace.onDidCloseTextDocument((e) => {
        if (this.lastTextEditor) {
          if (this.lastTextEditor.document.uri.path === e.uri.path) {
            this.lastTextEditor = undefined;
            this.sendMessage({ type: 'codeReady', value: false });
          }
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection(e => {
        if (this.isSupportedScheme(e.textEditor.document)) {
          if (e.selections[0]) {
            let doc = e.textEditor.document;
            let text = doc.getText(e.selections[0]);
            if (text.trim()) {
              this.sendMessage({ type: 'codeReady', value: true, label: workspace.asRelativePath(doc.uri), file: doc.uri.toString(), range: e.selections[0] });
              return;
            }
          }
          this.sendMessage({ type: 'codeReady', value: false });
        }
      })
    );
    this.showPage();

    // eslint-disable-next-line @typescript-eslint/naming-convention
    telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { new_session_num: 1 } });
  }

  private async showWelcome(quiet?: boolean) {
    raccoonManager.update();
    if (!quiet) {
      this.sendMessage({ type: 'updateSettingPage', action: "close" });
    }
    let category = "welcome";
    let org = raccoonManager.activeOrganization();
    let ts = new Date();
    let timestamp = ts.valueOf();
    let robot = extensionDisplayName || "Raccoon";
    if (org) {
      robot += ` (${org.name})`;
    }
    let welcomMsg = await buildWelcomeMessage(robot, org);
    this.sendMessage({ type: 'addMessage', category, quiet, robot, value: welcomMsg, timestamp });
  }

  async loadHistory(history: string, replay?: boolean) {
    if (replay) {
      return HistoryCache.getCacheItems(this.context, history).then((items?: Array<CacheItem>) => {
        this.clear();
        this.cache = new HistoryCache(this.context, history);
        if (items && items.length > 0) {
          this.sendMessage({ type: 'replay', value: items });
        }
      });
    }
    if (history === this.cache.cacheFileId) {
      return;
    }
    return HistoryCache.getCacheItems(this.context, history).then((items?: Array<CacheItem>) => {
      this.clear();
      this.cache = new HistoryCache(this.context, history);
      if (items && items.length > 0) {
        this.sendMessage({ type: 'restoreFromCache', value: items });
      }
    });
  }

  dispose() {
    for (let s in this.stopList) {
      this.stopList[s].abort();
    }
  }

  async updateSettingPage(action?: string): Promise<void> {
    if (!raccoonManager.isClientLoggedin()) {
      buildLoginPage(this.context, this.webview).then((value) => {
        this.sendMessage({ type: 'updateSettingPage', value, action });
      });
    } else {
      buildSettingPage().then((value) => {
        this.sendMessage({ type: 'updateSettingPage', value, action });
      });
    }
  }

  public async showPage(
  ) {
    this.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        this.context.extensionUri
      ]
    };

    this.webview.html = await buildChatHtml(this.context, this.webview);
    this.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'welcome': {
          await this.showWelcome();
          break;
        }
        case 'listAgent': {
          let value = Array.from(raccoonManager.agent.values());
          value = value.filter((v, _idx, _arr) => {
            return raccoonManager.checkAgentVisibility(v.id);
          });
          this.sendMessage({ type: 'agentList', value });
          break;
        }
        case 'listPrompt': {
          let value = raccoonManager.prompt;
          value = value.filter((v, _idx, _arr) => {
            return raccoonManager.checkPromptVisibility(v.label);
          });
          this.sendMessage({ type: 'promptList', value });
          break;
        }
        case 'agentManage': {
          commands.executeCommand(`${extensionNameKebab}.agent.manage`);
          break;
        }
        case 'promptManage': {
          commands.executeCommand(`${extensionNameKebab}.prompt.manage`);
          break;
        }
        case 'openDoc': {
          let allTabGroups = window.tabGroups.all;
          for (let tg of allTabGroups) {
            for (let tab of tg.tabs) {
              if (tab.input instanceof TabInputText && tab.input.uri.toString() === data.file) {
                window.showTextDocument(tab.input.uri, { viewColumn: tab.group.viewColumn, selection: data.range });
                break;
              }
            }
          }
          window.showTextDocument(Uri.parse(data.file), { preview: false, selection: data.range });
          break;
        }
        case 'login': {
          if (!data.value) {
            this.sendMessage({ type: 'showInfoTip', style: "error", category: 'login-invalid', value: raccoonConfig.t("Login failed") + ": Empty Login Info", id: new Date().valueOf() });
            break;
          }
          raccoonManager.login(data.value).then((res) => {
            if (res !== "ok") {
              this.sendMessage({ type: 'showInfoTip', style: "error", category: 'login-failed', value: raccoonConfig.t("Login failed") + ": " + res.message, id: new Date().valueOf() });
            }
          });
          break;
        }
        case 'searchQuery': {
          this.sendMessage({ type: 'addSearch', value: '?' + data.query });
          for (let url of data.searchUrl) {
            if (url.startsWith(`${extensionNameKebab}://raccoon.search/stackoverflow`)) {
              let q = url.replace('${query}', `${encodeURIComponent(JSON.stringify({ "query": data.query }))}`);
              commands.executeCommand('vscode.openWith', Uri.parse(q), raccoonSearchEditorProviderViewType);
            } else {
              let q = url.replace('${query}', encodeURIComponent(data.query));
              commands.executeCommand("vscode.open", q);
            }
          }
          break;
        }
        case 'deleteQA': {
          await this.cache.removeCacheItem(data.id);
          break;
        }
        case 'selectFile': {
          let files: Array<{ label: string, uri: Uri, languageId: string }> = [];
          let allTabGroups = window.tabGroups.all;
          for (let tg of allTabGroups) {
            for (let tab of tg.tabs) {
              if (tab.input instanceof TabInputText) {
                let label = workspace.asRelativePath(tab.input.uri);
                if (label !== tab.input.uri.fsPath) {
                  let languageId = (await workspace.openTextDocument(tab.input.uri)).languageId;
                  files.push({ label, uri: tab.input.uri, languageId });
                }
              }
            }
          }
          window.showQuickPick<{ label: string, uri: Uri, languageId: string }>(files).then((item) => {
            if (item) {
              this.sendMessage({ type: 'attachFile', label: item.label, file: item.uri.toString() });
            }
          });
          break;
        }
        case 'addAgent': {
          this.sendMessage({ type: 'addAgent', value: data.id });
          break;
        }
        case 'sendQuestion': {
          if (data.replace) {
            await this.cache.removeCacheItem(data.replace);
          }
          let prompt: RaccoonPrompt | undefined = data.prompt;
          if (!prompt && data.template) {
            let p = raccoonManager.prompt.filter((v, _idx, _arr) => {
              return v.shortcut === data.template;
            });
            if (p && p[0]) {
              prompt = p[0];
            }
          }
          if (!prompt) {
            break;
          }
          if (prompt.message.role === Role.function) {
            switch (prompt.type) {
              case PromptType.help: {
                let tm = new Date();
                let id = tm.valueOf();
                let isMac = data.userAgent.includes("Mac OS X");
                let timestamp = tm.valueOf();
                let robot = extensionDisplayName || "Raccoon";
                this.sendMessage({ type: 'addMessage', category: PromptType.help, robot, value: makeGuide(isMac), timestamp });
                this.sendMessage({ type: 'stopResponse', id });
                break;
              }
            }
            break;
          }
          if (data.attachCode && data.attachCode[0]) {
            let d = await workspace.openTextDocument(Uri.parse(data.attachCode[0].file));
            let r = data.attachCode[0].range;
            prompt.code = d.getText(new Range(r.start.line, r.start.character, r.end.line, r.end.character));
            if (d.languageId !== "plaintext") {
              prompt.languageid = d.languageId;
            }
          }
          if (prompt.type === PromptType.freeChat) {
            if (prompt.code && !prompt.message.content.includes("{{code}}")) {
              prompt.message.content += "\n{{code}}\n";
            }
          }
          let promptInfo = new PromptInfo(prompt);
          let history = await this.cache.getCacheItems();
          this.sendApiRequest(promptInfo, data.values, history, data.attachFile);
          break;
        }
        case 'stopGenerate': {
          if (data.id) {
            this.stopList[data.id]?.abort();
          } else {
            for (let id in this.stopList) {
              this.stopList[id]?.abort();
            }
          }
          break;
        }
        case 'diff': {
          const editor = window.activeTextEditor || this.lastTextEditor;
          let selection = editor?.document.getText(editor?.selection);
          if (data.languageid && selection && data.value) {
            diffCode(data.languageid, selection, data.value);
          } else {
            this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-diff-content', value: raccoonConfig.t("No diff content"), id: new Date().valueOf() });
          }
          break;
        }
        case 'editCode': {
          let found = false;
          const editor = window.activeTextEditor || this.lastTextEditor;
          let docUri = editor?.document.uri;
          if (editor && docUri) {
            let tgs = window.tabGroups.all;
            for (let tg of tgs) {
              for (let t of tg.tabs) {
                if (t.isActive && (t.input instanceof TabInputText || t.input instanceof TabInputNotebook) && t.input.uri.toString() === docUri.toString()) {
                  found = true;
                  let editAction = (edit: TextEditorEdit) => {
                    if (editor.selection) {
                      edit.delete(editor.selection);
                    }
                    edit.insert(editor.selection.anchor, data.value.trimEnd() + "\n");
                  };
                  editor.edit(editAction);
                }
              }
            }
          }
          if (!found) {
            this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-active-editor', value: raccoonConfig.t("No active editor found"), id: new Date().valueOf() });
          }
          break;
        }
        case 'activeEngine': {
          raccoonManager.setActiveClient(data.value);
          break;
        }
        case 'switchOrg': {
          raccoonManager.switchOrganization(raccoonConfig.type !== "Enterprise").then(() => {
            this.updateSettingPage();
          });
          break;
        }
        case 'logout': {
          window.showWarningMessage(
            raccoonConfig.t("Logout from {{robotname}}?", { robotname: extensionDisplayName }),
            { modal: true },
            raccoonConfig.t("OK"))
            .then((v) => {
              if (v === raccoonConfig.t("OK")) {
                raccoonManager.logout();
              }
            });
          break;
        }
        case 'completionPreference': {
          if (data.value === 0) {
            raccoonManager.completionPreference = CompletionPreferenceType.singleLine;
          } else if (data.value === 1) {
            raccoonManager.completionPreference = CompletionPreferenceType.balanced;
          } else if (data.value === 2) {
            raccoonManager.completionPreference = CompletionPreferenceType.bestEffort;
          }
          break;
        }
        case 'responseMode': {
          if (raccoonManager.streamResponse !== (data.value === "Streaming")) {
            raccoonManager.streamResponse = (data.value === "Streaming");
          }
          break;
        }
        case 'completionDelay': {
          if (data.value !== raccoonManager.completionDelay) {
            raccoonManager.completionDelay = data.value;
            raccoonManager.autoComplete = (data.value !== 3500);
          }
          break;
        }
        case 'candidates': {
          if (data.value <= 0) {
            data.value = 1;
          }
          raccoonManager.candidates = data.value;
          break;
        }
        case 'clearAll': {
          window.showWarningMessage(
            raccoonConfig.t("Clear all settings?"),
            { modal: true, detail: raccoonConfig.t("It will clear all your cached information, including:\n\n\t• Account authorization\n\t• Chace history\n\t• Code snippets in favorites\n\t• Custom prompts\n\n\tAnd reset all other settings to default.\n") },
            raccoonConfig.t("OK"))
            .then(v => {
              if (v === raccoonConfig.t("OK")) {
                commands.executeCommand("keybindings.editor.resetKeybinding", `${extensionNameKebab}.inlineSuggest.trigger`);
                HistoryCache.deleteAllCacheFiles(this.context, true);
                FavoriteCodeEditor.deleteSnippetFiles();
                raccoonManager.clear();
              }
            });
          break;
        }
        case 'knowledgeBaseRef': {
          if (!!data.value) {
            try {
              await raccoonManager.listKnowledgeBase(true);
              raccoonManager.knowledgeBaseRef = true;
            } catch (error) {
            }
          } else {
            raccoonManager.knowledgeBaseRef = false;
          }
          this.updateSettingPage();
          break;
        }
        case 'workspaceRef': {
          raccoonManager.workspaceRef = !!data.value;
          break;
        }
        case 'webRef': {
          raccoonManager.webRef = !!data.value;
          break;
        }
        case 'privacy': {
          raccoonManager.privacy = !!data.value;
          break;
        }
        case 'addFavorite': {
          commands.executeCommand("vscode.openWith", Uri.parse(`${extensionNameKebab}://raccoon.favorites/${data.id}.raccoon.favorites?${encodeURIComponent(JSON.stringify({ title: `${raccoonConfig.t("Favorite Snippet")} [${data.id}]` }))}#${encodeURIComponent(JSON.stringify(data))}`), favoriteCodeEditorViewType);
          break;
        }
        case 'bugReport': {
          let issueTitle;
          let issueBody;
          let hinfos = await this.cache.getCacheItemWithId(data.id);
          if (hinfos.length >= 2) {
            let qinfo = hinfos.filter((v, _idx, _arr) => {
              return v.type === CacheItemType.question;
            });
            let ainfo = hinfos.filter((v, _idx, _arr) => {
              return v.type === CacheItemType.answer;
            });
            let einfo = hinfos.filter((v, _idx, _arr) => {
              return v.type === CacheItemType.error;
            });
            issueTitle = '[Feedback]';
            let renderRequestBody = qinfo[0]?.value;
            if (renderRequestBody) {
              issueTitle = '[Need Improvement]';
              issueBody = `## Your question\n\n
${renderRequestBody}
${ainfo[0]?.value ? `\n\n## Raccoon's answer\n\n${ainfo[0].value}\n\n` : ""}
${einfo[0]?.value ? `\n\n## Raccoon's error\n\n${einfo[0].value}\n\n` : ""}
## Your expection
`;
            }
          }
          commands.executeCommand("workbench.action.openIssueReporter", { extensionId: this.context.extension.id, issueTitle, issueBody });
          break;
        }
        case 'telemetry': {
          let tinfo = data as TelemetryInfo;
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }

          /* eslint-disable  @typescript-eslint/naming-convention */
          let code_accept_usage: any;
          let dialog_window_usage: any;

          switch (tinfo.action) {
            case "like-cancelled": {
              dialog_window_usage = {
                // positive_feedback_num: -1
              };
              break;
            }
            case "like": {
              dialog_window_usage = {
                positive_feedback_num: 1
              };
              break;
            }
            case "dislike-cancelled": {
              dialog_window_usage = {
                // negative_feedback_num: -1
              };
              break;
            }
            case "dislike": {
              dialog_window_usage = {
                negative_feedback_num: 1
              };
              break;
            }
            case "regenerate": {
              dialog_window_usage = {
                // user_question_num: -1,
                regenerate_answer_num: 1
              };
              break;
            }
            case "code-generated": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_generate_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
            case "diff-code": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_compare_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
            case "copy-snippet": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_copy_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
            case "insert-snippet": {
              let metrics_by_language: any = {};
              metrics_by_language[tinfo.languageid || "Unknown"] = {
                code_insert_num: 1
              };
              code_accept_usage = { metrics_by_language };
              break;
            }
          }

          telemetryReporter.logUsage(MetricType.dialog, {
            code_accept_usage,
            dialog_window_usage
          });
          /* eslint-enable */
          break;
        }
        default:
          break;
      }
    });

    const editor = window.activeTextEditor || this.lastTextEditor;
    if (editor && this.checkCodeReady(editor)) {
      setTimeout(() => {
        this.sendMessage({ type: 'codeReady', value: true, label: workspace.asRelativePath(editor.document.uri), file: editor.document.uri.toString(), range: editor.selections[0] });
      }, 1000);
    }
  }

  private checkCodeReady(editor: TextEditor): boolean {
    let codeReady = editor.selection?.isEmpty === false;
    if (codeReady) {
      if (this.isSupportedScheme(editor.document)) {
        if (editor.selections[0]) {
          let doc = editor.document;
          let text = doc.getText(editor.selections[0]);
          if (text.trim()) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public async sendApiRequest(prompt: PromptInfo, values?: any, history?: CacheItem[], attachFile?: Array<{ file: string }>) {
    let ts = new Date();
    let id = ts.valueOf();
    let response = "";
    let reqTimestamp = ts.valueOf();

    let loggedin = raccoonManager.isClientLoggedin();
    let userinfo = await raccoonManager.userInfo();
    let org = raccoonManager.activeOrganization();
    let username = org?.username || userinfo?.username;
    if (!loggedin || !username) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'unauthorized', value: raccoonConfig.t("Unauthorized"), id });
      return;
    }

    let streaming = raccoonManager.streamResponse;
    let instruction = prompt.prompt;

    let promptHtml = prompt.generatePromptHtml(id, values);
    if (promptHtml.status === RenderStatus.codeMissing) {
      this.sendMessage({ type: 'showInfoTip', style: "error", category: 'no-code', value: raccoonConfig.t("No code selected"), id });
      return;
    }
    let el = (instruction.content.length * 2) + (promptHtml.prompt.code?.length ? promptHtml.prompt.code.length / 3 : 0);
    let maxTokens = raccoonManager.maxInputTokenNum(ModelCapacity.assistant);

    let avatar = userinfo?.avatar;
    let robot = extensionDisplayName + (org ? ` (${org.name})` : "");

    if (promptHtml.status === RenderStatus.editRequired) {
      this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp: reqTimestamp });
    } else {
      this.sendMessage({ type: 'addQuestion', username, avatar, robot, value: promptHtml, streaming, id, timestamp: reqTimestamp });
      try {
        if (promptHtml.prompt.code) {
          let codeBlock = `\n\`\`\`${promptHtml.prompt.languageid || ""}\n${promptHtml.prompt.code}\n\`\`\``;
          instruction.content = instruction.content.replace(/\{\{code\}\}/g,
            () => {
              return codeBlock;
            });
        } else {
          instruction.content = instruction.content.replace(/\{\{code\}\}/g, "");
        }
        let historyMsgs: Message[] = [];
        if (history) {
          let hs = Array.from(history).reverse();
          for (let h of hs) {
            let role = Role.user;
            if (h.type !== CacheItemType.question) {
              role = Role.assistant;
            }
            let aLen = (h.value.length) * 2 + 12;
            if ((el + aLen) > maxTokens) {
              break;
            }
            el += aLen;
            historyMsgs.push({
              role,
              content: h.value
            });
          }
        }
        this.cache.appendCacheItem({ id, name: username, timestamp: reqTimestamp, type: CacheItemType.question, instruction: prompt.label, value: instruction.content });

        historyMsgs = historyMsgs.reverse();

        // eslint-disable-next-line @typescript-eslint/naming-convention
        telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { user_question_num: 1 } });

        let errorFlag = false;
        let msgs = [...historyMsgs, instruction];
        if (streaming) {
          raccoonManager.chat(
            msgs,
            {
              stream: true,
              n: 1
            },
            {
              thisArg: this,
              onHeader: (headers: Headers) => {
                let fs = headers.get("x-raccoon-know-files");
                if (fs) {
                  this.sendMessage({ type: 'addReference', files: fs.split(","), id });
                }
              },
              onController(controller, thisArg) {
                let h = <RaccoonEditor>thisArg;
                h.stopList[id] = controller;
              },
              onError(err: Choice, thisArg) {
                let h = <RaccoonEditor>thisArg;
                outlog.error(JSON.stringify(err));
                let rts = new Date().valueOf();
                let errmsg = err.message?.content || "";
                switch (err.index) {
                  case -3008: {
                    errmsg = raccoonConfig.t("Connection error. Check your network settings.");
                    break;
                  } default: {
                    break;
                  }
                }
                h.cache.appendCacheItem({ id, name: extensionDisplayName || "Raccoon", timestamp: rts, type: CacheItemType.error, value: errmsg });
                h.sendMessage({ type: 'addError', error: errmsg, id, timestamp: rts });
                errorFlag = true;
              },
              onFinish(choices: Choice[], thisArg) {
                let h = <RaccoonEditor>thisArg;
                if (!errorFlag) {
                  let rts = new Date().valueOf();
                  if (response) {
                    h.cache.appendCacheItem({ id, name: extensionDisplayName || "Raccoon", timestamp: rts, type: CacheItemType.answer, value: response });
                  } else {
                    h.cache.appendCacheItem({ id, name: extensionDisplayName || "Raccoon", timestamp: rts, type: CacheItemType.error, value: "Empty Response" });
                  }
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { model_answer_num: 1 } });
                }
                delete h.stopList[id];
                h.sendMessage({ type: 'stopResponse', id });
              },
              onUpdate(choice: Choice, thisArg) {
                let rts = new Date().valueOf();
                if (choice.finishReason === FinishReason.sensitive) {
                  thisArg.sendMessage({ type: 'addError', error: raccoonConfig.t("Potentially Sensitive Content Encountered"), id, timestamp: rts });
                  return;
                } else if (choice.finishReason === FinishReason.length) {
                } else if (choice.finishReason === FinishReason.context) {
                  thisArg.sendMessage({ type: 'addError', error: raccoonConfig.t("Context Too long"), id, timestamp: rts });
                  return;
                }
                response += choice.message?.content || "";
                thisArg.sendMessage({ type: 'updateResponse', id, value: response, timestamp: rts });
              }
            },
            buildHeader(this.context.extension, prompt.type, `${id}`)
          ).catch((e) => {
            this.sendMessage({ type: 'addError', error: e.message, id, timestamp: new Date().valueOf() });
          });
        } else {
          await raccoonManager.chat(
            msgs,
            {
              n: 1
            },
            {
              thisArg: this,
              onHeader: (headers: Headers) => {
                let fs = headers.get("x-raccoon-know-files");
                if (fs) {
                  this.sendMessage({ type: 'addReference', files: fs.split(","), id });
                }
              },
              onController(controller, thisArg) {
                let h = <RaccoonEditor>thisArg;
                h.stopList[id] = controller;
              },
              onError(err, thisArg) {
                let h = <RaccoonEditor>thisArg;
                outlog.error(JSON.stringify(err));
                let rts = new Date().valueOf();
                h.sendMessage({ type: 'addError', error: err.message?.content || "", id, timestamp: rts });
                h.cache.appendCacheItem({ id, name: extensionDisplayName || "Raccoon", timestamp: rts, type: CacheItemType.error, value: err.message?.content || "" });
                errorFlag = true;
              },
              onFinish(choices, thisArg) {
                let h = <RaccoonEditor>thisArg;
                let rts = new Date().valueOf();
                if (!errorFlag) {
                  if (choices[0].message?.content) {
                    h.cache.appendCacheItem({ id, name: extensionDisplayName || "Raccoon", timestamp: rts, type: CacheItemType.answer, value: choices[0].message?.content });
                  } else {
                    h.cache.appendCacheItem({ id, name: extensionDisplayName || "Raccoon", timestamp: rts, type: CacheItemType.error, value: "Empty Response" });
                  }
                  // eslint-disable-next-line @typescript-eslint/naming-convention
                  telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { model_answer_num: 1 } });
                }
                h.sendMessage({ type: 'updateResponse', id, value: choices[0].message?.content, timestamp: rts });
                delete h.stopList[id];
                h.sendMessage({ type: 'stopResponse', id });
              }
            },
            buildHeader(this.context.extension, prompt.type, `${id}`));
        }
      } catch (err: any) {
        if (err.name === "CanceledError") {
          delete this.stopList[id];
          this.sendMessage({ type: 'stopResponse', id });
          return;
        }
        let error = err.response?.statusText || err.message;
        if (err.response?.data?.error) {
          error = err.response.data.error;
        }
        this.sendMessage({ type: 'addError', error, id });
      }
    }

    if (attachFile && attachFile[0]) {
      this.sendMessage({
        type: 'addReference',
        files: attachFile.map((f: any) => {
          let uri = Uri.parse(f.file);
          return workspace.asRelativePath(uri);
        }),
        id
      });
    }
  }

  public async sendMessage(message: any) {
    if (this.webview) {
      this.webview.postMessage(message);
    }
  }

  public async clear(showWelcome?: boolean) {
    for (let id in this.stopList) {
      this.stopList[id]?.abort();
    }
    this.cache = new HistoryCache(this.context, `${env.sessionId}-${new Date().valueOf()}`);
    this.sendMessage({ type: "clear" });
    if (showWelcome) {
      this.showWelcome();
    }
  }
}

export class RaccoonViewProvider implements WebviewViewProvider {
  private static editor?: RaccoonEditor;
  private static webviewView?: WebviewView;
  constructor(private context: ExtensionContext) {
    registerCommand(context, "settings", async () => {
      raccoonManager.update();
      commands.executeCommand(`${extensionNameKebab}.view.focus`).then(() => {
        return RaccoonViewProvider.editor?.updateSettingPage("toggle");
      });
    });
    registerCommand(context, "new-chat", async (uri) => {
      if (!uri) {
        RaccoonViewProvider.editor?.clear(true);
      } else {
        let editor = RaccoonEditorProvider.getEditor(uri);
        editor?.clear(true);
      }
      // eslint-disable-next-line @typescript-eslint/naming-convention
      telemetryReporter.logUsage(MetricType.dialog, { dialog_window_usage: { new_session_num: 1 } });
    });
  }

  public static showError(msg: string) {
    RaccoonViewProvider.editor?.sendMessage({ type: 'showInfoTip', style: 'error', category: 'custom', value: msg, id: new Date().valueOf() });
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    RaccoonViewProvider.editor = new RaccoonEditor(this.context, webviewView.webview);
    RaccoonViewProvider.webviewView = webviewView;
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        RaccoonViewProvider.editor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      }
    });
    webviewView.onDidDispose(() => {
      RaccoonViewProvider.editor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      RaccoonViewProvider.editor?.dispose();
      RaccoonViewProvider.webviewView = undefined;
    });
  }

  public static isVisible() {
    return RaccoonViewProvider.webviewView?.visible;
  }

  public static async loadHistory(id: string, replay?: boolean) {
    return RaccoonViewProvider.editor?.loadHistory(id, replay);
  }

  public static async ask(prompt?: PromptInfo) {
    commands.executeCommand(`${extensionNameKebab}.view.focus`);
    while (!RaccoonViewProvider.editor) {
      await new Promise((f) => setTimeout(f, 1000));
    }
    if (RaccoonViewProvider.editor) {
      if (prompt) {
        await new Promise((f) => setTimeout(f, 1000));
        return RaccoonViewProvider.editor.sendApiRequest(prompt);
      } else {
        await new Promise((f) => setTimeout(f, 300));
        RaccoonViewProvider.editor?.sendMessage({ type: 'focus' });
      }
    }
  }
}
