import axios from 'axios';
import { CustomReadonlyEditorProvider, CancellationToken, Uri, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, ExtensionContext } from 'vscode';

export class SenseCodeSearchEditorProvider implements CustomReadonlyEditorProvider {
  public static readonly viewType = "sensecode.search";

  constructor(private context: ExtensionContext) {
  }

  openCustomDocument(uri: Uri, _openContext: CustomDocumentOpenContext, _token: CancellationToken): CustomDocument | Thenable<CustomDocument> {
    return {
      uri,
      dispose: () => { }
    };
  }

  public async resolveCustomEditor(
    document: CustomDocument, webviewPanel: WebviewPanel, _token: CancellationToken
  ) {
    webviewPanel.webview.options = {
      enableScripts: true,
      enableCommandUris: true
    };
    webviewPanel.webview.onDidReceiveMessage(
      (e) => {
        switch (e.type) {
          case 'open': {
            commands.executeCommand('vscode.openWith', Uri.parse(e.uri), SenseCodeSearchEditorProvider.viewType);
            break;
          }
        }
      }
    );

    const toolkitUri = webviewPanel.webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
    const vendorMarkedJs = webviewPanel.webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
    const vendorHighlightCss = webviewPanel.webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
    const vendorHighlightJs = webviewPanel.webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
    const iconUri = webviewPanel.webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MaterialSymbols', 'materialSymbols.css'));

    if (document.uri.path === '/stackoverflow.question') {
      webviewPanel.webview.html = document.uri.query;
      let query = document.uri.query;
      if (query) {
        let q = JSON.parse(query);
        await axios.get(`https://api.stackexchange.com/2.3/questions/${q.id}?order=desc&sort=votes&site=stackoverflow&filter=!*Mg4PjfftzEyAIgG`)
          .then((resp) => {
            if (resp.status === 200 && resp.data.items) {
              let data = resp.data.items[0];
              let answerIds = Array.from(data.answers)
                .map((a: any, _idx, _arr) => {
                  return a.answer_id;
                }).join(';');
              axios.get(`https://api.stackexchange.com/2.3/answers/${answerIds}?order=desc&sort=votes&site=stackoverflow&filter=!T3AudpjY_(NGdBPHwj`)
                .then((ainfo) => {
                  if (ainfo.status === 200 && ainfo.data.items) {
                    for (let ai of ainfo.data.items) {
                      webviewPanel.webview.postMessage({ type: "answer", data: ai });
                    }
                  }
                });
              webviewPanel.webview.html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script type="module" src="${toolkitUri}"></script>
                <link href="${vendorHighlightCss}" rel="stylesheet">
                <link href="${iconUri}" rel="stylesheet" />
                <script src="${vendorHighlightJs}"></script>
                <script src="${vendorMarkedJs}"></script>
                <style>
                  body {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                  }
                  section {
                    line-height: 1.4;
                  }
                  span.material-symbols-rounded {
                    vertical-align: bottom;
                  }
                  .question, .answer {
                    margin: 0rem 0 0.5rem 0rem;
                    background-color: var(--list-hover-background);
                    padding: 1rem;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-button-border);
                  }
                  code {
                    font-family: var(--vscode-editor-font-family) !important;
                    overflow: auto;
                    padding: 2px 5px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 4px;
                  }
                  pre code {
                    display: block;
                    max-width: calc(100% - 2rem);
                    padding: 0.5rem 1rem;
                  }
                  #question pre code {
                    background-color: var(--list-hover-background);
                  }
                  .highlight {
                    padding: 0 2px;
                    background-color: var(--vscode-editor-findMatchHighlightBackground);
                  }
                </style>
                <script>
                marked.setOptions({
                  renderer: new marked.Renderer(),
                  highlight: function (code, _lang) {
                    return hljs.highlightAuto(code).value;
                  },
                  langPrefix: 'hljs language-',
                  pedantic: false,
                  gfm: true,
                  breaks: false,
                  sanitize: false,
                  smartypants: false,
                  xhtml: false
                });
                window.onload = (event) => {
                  var q = document.getElementById("question");
                  const content = new DOMParser().parseFromString(marked.parse(q.dataset.content), "text/html");
                  q.innerHTML = content.documentElement.innerHTML;
                };
                const vscode = acquireVsCodeApi();
                function openDocument(uri) {
                  vscode.postMessage({
                    type: "open",
                    uri
                  });
                }
                window.addEventListener("message", (event) => {
                  const message = event.data;
                  switch (message.type) {
                    case 'answer': {
                      var main = document.getElementById("main");
                      const a = document.createElement("section");
                      a.classList.add("answer");
                      const content = new DOMParser().parseFromString(marked.parse(message.data.body_markdown), "text/html");
                      var votes = \`<div style="display: flex;grid-gap: 1rem;">
                                        <vscode-tag class="up-vote"><span class="material-symbols-rounded">thumb_up</span> <span>\${message.data.up_vote_count}</span></vscode-tag>
                                        <vscode-tag class="down-vote"><span class="material-symbols-rounded">thumb_down</span> <span>\${message.data.down_vote_count}</span></vscode-tag>
                                        <div style="flex-grow: 1; text-align: end;"><span class="material-symbols-rounded">tag</span> <vscode-link href='\${message.data.link}'>\${message.data.answer_id}</vscode-link></div>
                                    </div>\`;
                      var meta = \` <div style="display: flex;grid-gap: 1rem;justify-content: flex-end;">
                                        <div><span class="material-symbols-rounded">person</span> <vscode-link href='\${message.data.owner.link}'>\${message.data.owner.display_name}</vscode-link></div>
                                        <div><span class="material-symbols-rounded">calendar_month</span> <vscode-link href="#" title="\${new Date(message.data.creation_date * 1000).toLocaleString()}">\${new Date(message.data.creation_date * 1000).toLocaleDateString()}</vscode-link></div>
                                    </div>\`;
                      a.innerHTML = votes + content.documentElement.innerHTML + meta;
                      main.append(a);
                      break;
                    }
                  }
                });
                </script>
            </head>
            <body>
            <div id="main" style="padding: 20px 0;width: 100%;max-width: 800px;">
            <h2>${data.title} <vscode-link href='${data.link}'><span class="material-symbols-rounded">open_in_new</span></vscode-link></h2>
            <section id="question" data-content="${data.body_markdown}">
            </section>
            <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
            <section id="meta" style="display: flex; grid-gap: 1rem; justify-content: flex-end; margin-right: 1rem;">
                <div><span class="material-symbols-rounded">person</span> <vscode-link href='${data.owner.link}'>${data.owner.display_name}</vscode-link></div>
                <div><span class="material-symbols-rounded">calendar_month</span> <vscode-link href="#" title="${new Date(data.creation_date * 1000).toLocaleString()}">${new Date(data.creation_date * 1000).toLocaleDateString()}</vscode-link></div>
            </section>
            <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
            <h3>Answers</h3>
            </div>
            </body>
            </html>`;
            }
          });
      }
    }
    if (document.uri.path === '/stackoverflow.search') {
      let query = document.uri.query;
      if (query) {
        let q = JSON.parse(query);
        await axios.get(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&site=stackoverflow&q=${encodeURIComponent(q.query)}`)
          .then((resp) => {
            if (resp.status === 200 && resp.data.items) {
              let page = `<h1>${q.query}</h1>`;
              for (let item of resp.data.items) {
                let section = `<section>`;
                section += `<vscode-link href='#' onclick='openDocument("sensecode://sensecode.search/stackoverflow.question?${encodeURIComponent(JSON.stringify({ "id": item.question_id, "query": item.title }))}")'><h4>${item.title}</h4></vscode-link>`;
                section += `<div class="${item.item_type}">`;
                let lines = item.excerpt.split('\n');
                for (let line of lines) {
                  section += `<div>${line}</div>`;
                }
                section += `</div>`;
                section += `</section>`;
                page += section;
              }
              if (resp.data.items.length === 0) {
                page += '<section><div class="question">No Result</div></section>';
              }
              webviewPanel.webview.html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script type="module" src="${toolkitUri}"></script>
                <link href="${iconUri}" rel="stylesheet" />
                <style>
                  body {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                  }
                  section {
                    line-height: 1.4;
                  }
                  span.material-symbols-rounded {
                    vertical-align: bottom;
                  }
                  .question, .answer {
                    margin: 0rem 0 0.5rem 0rem;
                    background-color: var(--list-hover-background);
                    padding: 1rem;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-button-border);
                  }
                  code {
                    font-family: var(--vscode-editor-font-family) !important;
                    overflow: auto;
                    padding: 2px 5px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 4px;
                  }
                  pre code {
                    display: block;
                    max-width: calc(100% - 2rem);
                    padding: 0.5rem 1rem;
                  }
                  #question pre code {
                    background-color: var(--list-hover-background);
                  }
                  .highlight {
                    padding: 0 2px;
                    background-color: var(--vscode-editor-findMatchHighlightBackground);
                  }
                </style>
                <script>
                const vscode = acquireVsCodeApi();
                function openDocument(uri) {
                  vscode.postMessage({
                    type: "open",
                    uri
                  });
                }
                </script>
            </head>
            <body>
            <div style="padding: 20px 0;width: 100%;max-width: 800px;">
            ${page}
            </div>
            </body>
            </html>`;
            }
          });
      }
    }
  }
}
