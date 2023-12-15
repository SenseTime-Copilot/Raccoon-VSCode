import axios from 'axios';
import { CustomReadonlyEditorProvider, CancellationToken, Uri, CustomDocument, CustomDocumentOpenContext, WebviewPanel, commands, ExtensionContext } from 'vscode';

const stackoverflowLogo = `<svg aria-hidden="true" class="native svg-icon iconLogoGlyphMd" width="12" height="12" viewBox="0 0 32 37"><path d="M26 33v-9h4v13H0V24h4v9h22Z" fill="#BCBBBB"></path><path d="m21.5 0-2.7 2 9.9 13.3 2.7-2L21.5 0ZM26 18.4 13.3 7.8l2.1-2.5 12.7 10.6-2.1 2.5ZM9.1 15.2l15 7 1.4-3-15-7-1.4 3Zm14 10.79.68-2.95-16.1-3.35L7 23l16.1 2.99ZM23 30H7v-3h16v3Z" fill="#F48024"></path></svg>`;
const poweredByStackoverflow = `
<div style="display: inline-block; float: right; text-align: right; font-size: 8px; opacity: 0.6;">
  POWERED BY ${stackoverflowLogo} STACK OVERFLOW
</div>
`;

export class RaccoonSearchEditorProvider implements CustomReadonlyEditorProvider {
  public static readonly viewType = "raccoon.search";

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
            commands.executeCommand('vscode.openWith', Uri.parse(e.uri), RaccoonSearchEditorProvider.viewType);
            break;
          }
          case 'more': {
            let page = e.value ?? 1;
            webviewPanel.webview.postMessage({ type: "loading" });
            axios.get(`https://api.stackexchange.com/2.3/search/excerpts?page=${page}&order=desc&sort=relevance&site=stackoverflow&q=${encodeURIComponent(e.query)}`)
              .then((resp) => {
                if (resp.status === 200 && resp.data.items) {
                  let items = ``;
                  for (let item of resp.data.items) {
                    let section = `<section>`;
                    section += `<vscode-link href='#' onclick='openDocument("raccoon://raccoon.search/stackoverflow.question?${encodeURIComponent(JSON.stringify({ "id": item.question_id, "query": item.title }))}")'><h3>${item.title}</h3></vscode-link>`;
                    section += `<div class="${item.item_type}">`;
                    let lines = item.excerpt.split('\n');
                    for (let line of lines) {
                      section += `<div>${line}</div>`;
                    }
                    section += `</div>`;
                    section += `</section>`;
                    items += section;
                  }
                  if (resp.data.items.length === 0) {
                    items += '<section><div class="question">No Result</div></section>';
                  }
                  if (resp.data.has_more) {
                    items += `<div id="more-btn" style="text-align: center;margin: 2rem auto;--button-padding-horizontal: 3rem;"><vscode-button onclick='vscode.postMessage({type:"more", query:"${e.query}", value:${page + 1}});'>MORE</vscode-button></div>`;
                  }
                  webviewPanel.webview.postMessage({ type: "result", value: items });
                }
              });
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
        await axios.get(`https://api.stackexchange.com/2.3/questions/${q.id}?order=desc&sort=votes&site=stackoverflow&filter=!nNPvSNP4(R`)
          .then((resp) => {
            if (resp.status === 200 && resp.data.items) {
              let data = resp.data.items[0];
              webviewPanel.webview.postMessage({ type: "question", data });
              axios.get(`https://api.stackexchange.com/2.3/questions/${q.id}/answers?pagesize=100&order=desc&sort=votes&site=stackoverflow&filter=!T3AudpjY_(NGdBPHwj`)
                .then((ainfo) => {
                  if (ainfo.status === 200 && ainfo.data.items) {
                    for (let ai of ainfo.data.items) {
                      webviewPanel.webview.postMessage({ type: "answer", data: ai });
                    }
                    if (ainfo.data.has_more) {
                      webviewPanel.webview.postMessage({ type: "more" });
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
                  blockquote {
                    padding: 1px 1em;
                    border-width: 0;
                    border-left-width: 0.5em;
                    border-style: solid;
                    border-radius: 0 4px 4px 0;
                  }
                  hr {
                    border-color: var(--panel-view-border);
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
                function toRegex(chars) {
                  var keys = Object.keys(chars).join('|');
                  var regex = new RegExp('(?=(' + keys + '))\\\\1', 'g');
                  return regex;
                }
                function unescape(str) {
                    var chars = {
                        '&quot;': '"',
                        '&#34;': '"',
                        '&apos;': '\\'',
                        '&#39;': '\\'',
                        '&amp;': '&',
                        '&#38;': '&',
                        '&gt;': '>',
                        '&#62;': '>',
                        '&lt;': '<',
                        '&#60;': '<'
                    }
                    var regex = toRegex(chars);
                    return str.replace(regex, function(m) {
                        return chars[m];
                    });
                }
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
                    case 'question': {
                      var question = document.getElementById("question");
                      const content = new DOMParser().parseFromString(marked.parse(unescape(message.data.body_markdown)), "text/html");
                      question.innerHTML = content.documentElement.innerHTML;
                      break;
                    }
                    case 'answer': {
                      var main = document.getElementById("main");
                      const a = document.createElement("section");
                      a.classList.add("answer");
                      const content = new DOMParser().parseFromString(marked.parse(unescape(message.data.body_markdown)), "text/html");
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
                    case 'more': {
                      var main = document.getElementById("main");
                      const a = document.createElement("section");
                      a.innerHTML = \`<vscode-link href='${data.link}'>more answers on ${stackoverflowLogo} stackoverflow</vscode-link>\`;
                      main.append(a);
                      break;
                    }
                  }
                });
                </script>
            </head>
            <body>
            <div id="main" style="padding: 20px 0;width: 100%;max-width: 800px;">
            ${poweredByStackoverflow}
            <h2>${data.title} <vscode-link href='${data.link}'><span class="material-symbols-rounded">open_in_new</span></vscode-link></h2>
            <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
            <section id="question">
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
        await axios.get(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&site=stackoverflow&q=${(q.query)}`)
          .then((resp) => {
            if (resp.status === 200 && resp.data.items) {
              let page = `<h1>${q.query}</h1>`;
              for (let item of resp.data.items) {
                let section = `<section>`;
                section += `<vscode-link href='#' onclick='openDocument("raccoon://raccoon.search/stackoverflow.question?${encodeURIComponent(JSON.stringify({ "id": item.question_id, "query": item.title }))}")'><h3>${item.title}</h3></vscode-link>`;
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
              if (resp.data.has_more) {
                page += `<div id="more-btn" style="text-align: center;margin: 2rem auto;--button-padding-horizontal: 3rem;"><vscode-button onclick='vscode.postMessage({type:"more", query:"${q.query}", value:2});'>MORE</vscode-button></div>`;
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
                window.addEventListener("message", (event) => {
                  const message = event.data;
                  switch (message.type) {
                    case 'result': {
                      var container = document.getElementById("container");
                      var morebtn = document.getElementById("more-btn");
                      morebtn.remove();
                      container.innerHTML += message.value;
                      break;
                    }
                    case 'loading': {
                      var morebtn = document.getElementById("more-btn");
                      morebtn.innerHTML='<vscode-progress-ring style="width:100%"></vscode-progress-ring>';
                      break;
                    }
                  }
                });
                </script>
            </head>
            <body>
            <div id="container" style="padding: 20px 0;width: 100%;max-width: 800px;">
            ${poweredByStackoverflow}
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
