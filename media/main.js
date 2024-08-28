/* eslint-disable no-redeclare */
const vscode = acquireVsCodeApi();

const sendAction = (shortcut) => {
  var acc = document.getElementById("attach-code-container");
  let attachCode = [];
  for (let c of acc.children) {
    if (c.dataset['file']) {
      let range;
      if (c.dataset['range']) {
        range = JSON.parse(c.dataset['range']);
      }
      attachCode.push({
        file: c.dataset['file'],
        range
      });
    }
  }
  var afc = document.getElementById("attach-file-container");
  let attachFile = [];
  for (let f of afc.children) {
    if (f.dataset['file']) {
      attachFile.push({
        file: f.dataset['file']
      });
    }
  }
  vscode.postMessage({
    type: "sendQuestion",
    attachCode,
    attachFile,
    shortcut
  });
  document.getElementById("agent-indicator").classList.add("hidden");
  document.getElementById("agent-tab-btn").dataset.agent = ``;
};

(function () {
  marked.setOptions({
    renderer: new marked.Renderer(),
    highlight: function (code, lang) {
      if (!hljs.getLanguage(lang)) {
        return hljs.highlightAuto(code).value;
      } else {
        return hljs.highlight(lang, code).value;
      }
    },
    langPrefix: 'hljs language-',
    pedantic: false,
    gfm: true,
    breaks: false,
    sanitize: false,
    smartypants: false,
    xhtml: false
  });

  const aiIcon = `<div class="robot-avatar w-8 h-8"></div>`;
  const questionIcon = `<span class="material-symbols-rounded w-8 h-8 text-center">live_help</span>`;
  const clipboardIcon = `<span class="material-symbols-rounded">content_paste</span>`;
  const checkIcon = `<span class="material-symbols-rounded">inventory</span>`;
  const requestIdIcon = `<span class="material-symbols-rounded">tag</span>`;
  const cancelIcon = `<span class="material-symbols-rounded">close</span>`;
  const sendSlotIcon = `<span slot="start" class="material-symbols-rounded">send</span>`;
  const deleteSlotIcon = `<span slot="start" class="material-symbols-rounded">undo</span>`;
  const continueIcon = `<span class="material-symbols-rounded">rotate_right</span>`;
  const favIcon = `<span class="material-symbols-rounded">heart_plus</span>`;
  const viewIcon = `<span class="material-symbols-rounded">visibility</span>`;
  const viewOffIcon = `<span class="material-symbols-rounded">visibility_off</span>`;
  const diffIcon = `<span class="material-symbols-rounded">difference</span>`;
  const insertIcon = `<span class="material-symbols-rounded">keyboard_return</span>`;
  const wrapIcon = `<span class="material-symbols-rounded">wrap_text</span>`;
  const unfoldIcon = '<span class="material-symbols-rounded">expand</span>';
  const foldIcon = '<span class="material-symbols-rounded">compress</span>';

  var isComposing = false;
  var agents = undefined;
  var prompts = undefined;
  var history = [];
  var contents = new Map();
  var lasttimestamps = new Map();
  var timestamps = new Map();
  var renderers = new Map();
  var editCache = new Map();
  var tipN = 0;

  document.oncontextmenu = () => {
    return false;
  };
  document.getElementById("question-input").disabled = true;

  setTimeout(showTips, 1000);

  function scrollPositionAtBottom() {
    var lastChild = document.getElementById('qa-list').lastChild;
    var btm = lastChild.getBoundingClientRect().top + lastChild.offsetHeight;
    var hgt = document.getElementById('qa-list').offsetHeight;

    return btm - hgt < 100;
  }

  function showTips() {
    var qs = document.getElementById(`question-sizer`);
    if (qs && qs.dataset[`tip${tipN}`]) {
      qs.dataset['tip'] = qs.dataset[`tip${tipN}`];
    } else {
      tipN = 0;
    }
    if (tipN === 0) {
      qs.dataset['tip'] = qs.dataset[`placeholder`];
    }
    tipN++;
    setTimeout(showTips, 8000);
  }

  function buildQuestion(username, avatar, timestamp, id, innerHTML, status) {
    let questionTitle = `<h2 class="avatar mb-2 -ml-1 flex gap-1 justify-between">
                              <span class="flex gap-2 flex text-xl items-center">
                                ${avatar ? `<img src="${avatar}" class="w-8 h-8 rounded-full">` : questionIcon}
                                <span class="flex flex-col gap-1 text-xs">
                                  <b>${username}</b>
                                  <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                    ${new Date(timestamp).toLocaleString()}
                                  </div>
                                </span>
                              </span>
                              <div class="flex self-start">
                                <button title="${l10nForUI["DeleteQA"]}" class="delete-element-gnc border-none bg-transparent opacity-60 hover:opacity-100" data-id=${id}>${cancelIcon}</button>
                                <button title="${l10nForUI["Cancel"]} [Esc]" class="cancel-element-gnc  border-none bg-transparent opacity-60 hover:opacity-100">${cancelIcon}</button>
                              </div>
                            </h2>`;
    return `<div id="question-${id}" class="p-4 question-element-gnc ${status}">
             ${questionTitle}
             ${innerHTML}
             <div class="send-btns flex justify-end mt-4 gap-2" style="color: var(--panel-tab-foreground);">
               <vscode-button tabindex="0" class="cancel-element-gnc text-base rounded" title="${l10nForUI["Cancel"]} [Esc]" appearance="secondary">
                ${deleteSlotIcon}
                ${l10nForUI["Cancel"]}
              </vscode-button>
              <vscode-button tabindex="0" class="send-element-gnc text-base rounded" title="${l10nForUI["Send"]} [Ctrl+Enter]">
                ${sendSlotIcon}
                ${l10nForUI["Send"]}
              </vscode-button>
            </div>
           </div>`;
  }

  showInfoTip = function (message) {
    var ew = document.getElementById('msg-wrapper');
    if (ew.querySelector(`.${message.category}`)) {
      return;
    }
    var eleId = `msg-${message.id}`;
    if (message.style === 'message') {
      ew.innerHTML += `<div class="msg ${message.category}" id="${eleId}">${message.value}</div>`;
    } else if (message.style === 'error') {
      eleId = `error-${message.id}`;
      ew.innerHTML += `<div class="error ${message.category}" id="${eleId}">${message.value}</div>`;
    }
    setTimeout(() => {
      var err = document.getElementById(eleId);
      err.remove();
    }, 3000);
  };

  function render(id, scroll) {
    const responseElem = document.getElementById(`response-${id}`);
    const content = contents.get(id);
    if (!responseElem || !content) {
      return;
    }
    const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(content)), "text/html");
    const preCodeList = markedResponse.querySelectorAll("pre > code");
    preCodeList.forEach((preCode, _index) => {
      preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");
      const buttonWrapper = document.createElement("div");
      buttonWrapper.classList.add("code-actions-wrapper");
      preCode.parentElement.prepend(buttonWrapper);
      preCode.classList.forEach((cls, _idx, _arr) => {
        if (cls.startsWith('language-')) {
          langTag = cls.slice(9);
          preCode.parentElement.dataset.lang = langTag;
        }
      });
    });
    responseElem.innerHTML = markedResponse.documentElement.innerHTML;
    if (scroll) {
      const list = document.getElementById("qa-list");
      list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
    }
  }

  function createReponseRender(id) {
    renderers.set(
      id,
      setInterval(
        function () {
          let lastts = lasttimestamps.get(id);
          let ts = timestamps.get(id);
          if (lastts !== ts) {
            lasttimestamps.set(id, ts);
            const scroll = scrollPositionAtBottom();
            render(id, scroll);
          }
        },
        30
      )
    );
  }

  function clearReponseRender(id) {
    clearInterval(renderers.get(id));
    delete renderers.delete(id);
  }

  function wrapCode(cont) {
    if (cont.split("```").length % 2 !== 1) {
      if (!cont.trim().endsWith("```")) {
        cont = cont + "\n```";
      }
    }
    return cont;
  }

  function attachFileItem(message) {
    var afc = document.getElementById("attach-file-container");
    if (afc && message.file) {
      for (let item of afc.children) {
        if (item.dataset['file'] === message.file) {
          _toggleFileList([], false);
          return;
        }
      }
      let ct = document.createElement('div');
      ct.classList.add("attach-file", "flex", "items-end", "px-1");
      ct.dataset['file'] = message.file;
      let icon = document.createElement('span');
      icon.classList.add("material-symbols-rounded");
      icon.innerText = "file_present";
      let link = document.createElement('vscode-link');
      link.classList.add("grow", "whitespace-pre", "text-ellipsis", "overflow-hidden", "text-xs");
      link.title = message.file;
      link.onclick = (_event) => {
        vscode.postMessage({ type: "openDoc", file: message.file });
      };
      link.innerHTML = message.label;
      let rmBtn = document.createElement('span');
      rmBtn.classList.add('material-symbols-rounded', 'cursor-pointer', 'float-right', 'hover:scale-105');
      rmBtn.title = l10nForUI["Delete"];
      rmBtn.innerText = 'cancel';
      rmBtn.onclick = (_event) => {
        ct.remove();
        if (afc.children.length === 0) {
          afc.classList.add("hidden");
        }
      };
      ct.appendChild(icon);
      ct.appendChild(link);
      ct.appendChild(rmBtn);
      afc.appendChild(ct);
      afc.classList.remove("hidden");
    }
    _toggleFileList([], false);
  }

  document.getElementById('question-input').addEventListener("focus", (_e) => {
    var acc = document.getElementById("attach-code-container");
    if (acc && acc.classList.contains('with-code')) {
      acc.classList.remove('hidden');
    }
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", async (event) => {
    const message = event.data;
    const list = document.getElementById("qa-list");
    const modalShow = !document.getElementsByClassName("modal")[0].classList.contains("hidden");
    switch (message.type) {
      case 'focus': {
        if (modalShow) {
          break;
        }
        document.getElementById('settings')?.remove();
        document.getElementById("question-input").focus();
        document.getElementById('chat-input-box').classList.remove('flash');
        void document.getElementById('chat-input-box').offsetHeight;
        document.getElementById('chat-input-box').classList.add('flash');
        break;
      }
      case 'clear': {
        if (modalShow) {
          let msgBox = document.getElementsByClassName("modal")[0];
          msgBox.classList.add('hidden');
          msgBox.innerHTML = "";
        }
        document.getElementById("chat-input-box")?.classList?.remove("responsing");
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        list.innerHTML = "";
        break;
      }
      case 'replay': {
        vscode.postMessage({ type: "welcome" });
        await new Promise(r => setTimeout(r, 5000));
        for (let item of message.value) {
          if (item.type === 'question') {
            let qinput = document.getElementById("question-input");
            let qsizer = document.getElementById("question-sizer");
            let qc = '';
            for (let i = 0; i < item.value.length; i++) {
              if (item.value[i] === ' ' || item.value[i] === '\t' || item.value[i] === '\n') {
                qc += item.value[i];
                continue;
              }
              if ((i + 2) < item.value.length && item.value[i] === "`" && item.value[i + 1] === "`" && item.value[i + 2] === "`") {
                break;
              }
              qc += item.value[i];
              qinput.value = qc;
              qsizer.dataset.value = qc;
              let jitter = Math.floor(Math.random() * 100);
              await new Promise(r => setTimeout(r, 20 + jitter));
            }
            await new Promise(r => setTimeout(r, 1000));
            qinput.value = "";
            qsizer.dataset.value = "";
            await new Promise(r => setTimeout(r, 200));
            const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(item.value)), "text/html");
            const preCodeList = markedResponse.querySelectorAll("pre > code");
            var langTag = '';
            preCodeList.forEach((preCode, index) => {
              preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col", "mt-4");
              preCode.classList.forEach((cls, _idx, _arr) => {
                if (cls.startsWith('language-')) {
                  langTag = cls.slice(9);
                  code = JSON.stringify(preCode.textContent);
                  preCode.parentElement.dataset.lang = langTag;
                }
              });

              if (index !== preCodeList.length - 1) {
                preCode.parentElement.classList.add("mb-8");
              }

              const buttonWrapper = document.createElement("div");
              buttonWrapper.classList.add("code-actions-wrapper");

              // Create wrap button
              const wrapButton = document.createElement("button");
              wrapButton.dataset.id = item.id;
              wrapButton.title = l10nForUI["ToggleWrap"];
              wrapButton.innerHTML = wrapIcon;
              wrapButton.classList.add("wrap-element-gnc", "rounded");

              buttonWrapper.append(wrapButton);

              if (preCode.parentElement.dataset.lang === 'mermaid') {
                const view = document.createElement("button");
                view.dataset.id = item.id;
                view.title = l10nForUI["Show graph"];
                view.innerHTML = viewIcon;
                view.classList.add("mermaid-element-gnc", "rounded");
                buttonWrapper.append(view);
              }

              var lineNum = preCode.innerText.split("\n").length;
              if (lineNum > 10) {
                preCode.parentElement.classList.add("fold");

                // Create fold button
                const foldButton = document.createElement("button");
                foldButton.dataset.id = item.id;
                foldButton.innerHTML = foldIcon;
                foldButton.classList.add("fold-btn", "expend-code", "rounded");

                // Create unfold button
                const unfoldButton = document.createElement("button");
                unfoldButton.dataset.id = item.id;
                unfoldButton.innerHTML = unfoldIcon;
                unfoldButton.classList.add("unfold-btn", "expend-code", "rounded", "hidden");

                buttonWrapper.append(unfoldButton, foldButton);
              }

              preCode.parentElement.prepend(buttonWrapper);
            });
            let labelInstruction = '';
            if (item.instruction) {
              labelInstruction = `<p class="instruction-label font-bold pl-1 pr-2"><span class="material-symbols-rounded align-text-bottom">auto_fix_normal</span>${item.instruction.replace("...", "")}</p>`;
            }
            let html = `<div id="prompt-${item.id}" class="prompt markdown-body pb-2">${labelInstruction}${markedResponse.documentElement.innerHTML}</div>`;
            item.timestamp = new Date().valueOf();
            list.innerHTML += buildQuestion(item.name, undefined, item.timestamp, item.id, html, 'resolved');
          } else if (item.type === "answer") {
            const ac = `<div id="${item.id}" data-name="${item.name}" class="p-4 answer-element-gnc">
                          <h2 class="avatar mb-2 -ml-1 flex gap-1">
                            <span class="flex gap-2 flex text-xl items-center">
                              ${aiIcon}
                              <span class="flex flex-col gap-1 text-xs">
                                <b>${item.name}</b>
                                <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                  --/--/----, --:--:--
                                </div>
                              </span>
                            </span>
                          </h2>
                          <div id="response-${item.id}" class="response flex flex-col gap-1 markdown-body">
                          </div>
                        </div>`;
            list.innerHTML += ac;
            let content = '';
            let t = document.getElementById(`${item.id}`).getElementsByClassName("message-ts")[0];
            let c = document.getElementById(`response-${item.id}`);
            document.getElementById("chat-input-box")?.classList?.add("responsing");
            await new Promise(r => setTimeout(r, 2000));
            t.innerHTML = new Date().toLocaleString();
            for (let i = 0; i < item.value.length; i++) {
              content += item.value[i];
              const md = new DOMParser().parseFromString(marked.parse(wrapCode(content)), "text/html");
              c.innerHTML = md.documentElement.innerHTML;
              list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
              let jitter = Math.floor(Math.random() * 40);
              await new Promise(r => setTimeout(r, 10 + jitter));
            }
            document.getElementById("chat-input-box")?.classList?.remove("responsing");
            const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(item.value)), "text/html");
            const preCodeList = markedResponse.querySelectorAll("pre > code");

            preCodeList.forEach((preCode, index) => {
              preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");
              preCode.classList.forEach((cls, _idx, _arr) => {
                if (cls.startsWith('language-')) {
                  preCode.parentElement.dataset.lang = cls.slice(9);
                }
              });

              if (index !== preCodeList.length - 1) {
                preCode.parentElement.classList.add("mb-8");
              }

              const buttonWrapper = document.createElement("div");
              buttonWrapper.classList.add("code-actions-wrapper");

              // Create wrap button
              const wrapButton = document.createElement("button");
              wrapButton.dataset.id = item.id;
              wrapButton.title = l10nForUI["ToggleWrap"];
              wrapButton.innerHTML = wrapIcon;

              wrapButton.classList.add("wrap-element-gnc", "rounded");

              const fav = document.createElement("button");
              fav.dataset.id = item.id;
              if (preCode.parentElement.dataset.lang !== 'mermaid') {
                fav.title = l10nForUI["Favorite"];
                fav.innerHTML = favIcon;
                fav.classList.add("fav-element-gnc", "rounded");
              } else {
                fav.title = l10nForUI["Show graph"];
                fav.innerHTML = viewIcon;
                fav.classList.add("mermaid-element-gnc", "rounded");
              }

              const diff = document.createElement("button");
              diff.dataset.id = item.id;
              diff.title = l10nForUI["Diff"];
              diff.innerHTML = diffIcon;

              diff.classList.add("diff-element-gnc", "rounded");

              // Create copy to clipboard button
              const copyButton = document.createElement("button");
              copyButton.dataset.id = item.id;
              copyButton.title = l10nForUI["Copy"];
              copyButton.innerHTML = clipboardIcon;

              copyButton.classList.add("code-element-gnc", "rounded");

              const insert = document.createElement("button");
              insert.dataset.id = item.id;
              insert.title = l10nForUI["Insert"];
              insert.innerHTML = insertIcon;

              insert.classList.add("edit-element-gnc", "rounded");

              buttonWrapper.append(wrapButton, fav, diff, copyButton, insert);

              preCode.parentElement.prepend(buttonWrapper);
            });
            c.innerHTML = markedResponse.documentElement.innerHTML;
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        break;
      }
      case 'showOrganizationSwitchBtn': {
        let b = document.getElementById('switch-org-btn');
        let bi = document.getElementById('switch-org-btn-icon');
        let bl = document.getElementById('switch-org-btn-label');
        if (message.organization) {
          bi.innerText = "corporate_fare";
          bl.innerText = message.organization.name;
        } else {
          bi.innerText = "account_box";
          bl.innerText = message.name;
        }
        if (!message.switchEnable) {
          b.classList.remove("switch-org");
          b.classList.add("org-label");
        } else {
          b.classList.add("switch-org");
          b.classList.remove("org-label");
        }
        b.classList.remove("hidden");
        break;
      }
      case 'hideOrganizationSwitchBtn': {
        let b = document.getElementById('switch-org-btn');
        let bi = document.getElementById('switch-org-btn-icon');
        let bl = document.getElementById('switch-org-btn-label');
        bi.innerText = "";
        bl.innerText = "";
        bl.title = "";
        b.classList.add("hidden");
        break;
      }
      case 'restoreFromCache': {
        if (modalShow) {
          let msgBox = document.getElementsByClassName("modal")[0];
          msgBox.classList.add('hidden');
          msgBox.innerHTML = "";
        }
        for (let item of message.value) {
          if (item.type === 'question') {
            const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(item.value)), "text/html");
            const preCodeList = markedResponse.querySelectorAll("pre > code");
            var lang = '';
            preCodeList.forEach((preCode, index) => {
              preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col", "mt-4");
              preCode.classList.forEach((cls, _idx, _arr) => {
                if (cls.startsWith('language-')) {
                  lang = cls.slice(9);
                  code = JSON.stringify(preCode.textContent);
                  preCode.parentElement.dataset.lang = lang;
                }
              });

              if (index !== preCodeList.length - 1) {
                preCode.parentElement.classList.add("mb-8");
              }

              const buttonWrapper = document.createElement("div");
              buttonWrapper.classList.add("code-actions-wrapper");

              // Create wrap button
              const wrapButton = document.createElement("button");
              wrapButton.dataset.id = item.id;
              wrapButton.title = l10nForUI["ToggleWrap"];
              wrapButton.innerHTML = wrapIcon;
              wrapButton.classList.add("wrap-element-gnc", "rounded");

              buttonWrapper.append(wrapButton);

              if (preCode.parentElement.dataset.lang === 'mermaid') {
                const view = document.createElement("button");
                view.dataset.id = item.id;
                view.title = l10nForUI["Show graph"];
                view.innerHTML = viewIcon;
                view.classList.add("mermaid-element-gnc", "rounded");
                buttonWrapper.append(view);
              }

              var lineNum = preCode.innerText.split("\n").length;
              if (lineNum > 10) {
                preCode.parentElement.classList.add("fold");

                // Create fold button
                const foldButton = document.createElement("button");
                foldButton.dataset.id = item.id;
                foldButton.innerHTML = foldIcon;
                foldButton.classList.add("fold-btn", "expend-code", "rounded");

                // Create unfold button
                const unfoldButton = document.createElement("button");
                unfoldButton.dataset.id = item.id;
                unfoldButton.innerHTML = unfoldIcon;
                unfoldButton.classList.add("unfold-btn", "expend-code", "rounded", "hidden");

                buttonWrapper.append(unfoldButton, foldButton);
              }

              preCode.parentElement.prepend(buttonWrapper);
            });
            let labelAgent = '';
            if (item.agent) {
              labelAgent = `<p class="instruction-label font-bold pl-1 pr-2"><span class="material-symbols-rounded align-text-bottom">auto_fix_normal</span>${item.agent}</p>`;
            }
            let labelInstruction = '';
            if (item.instruction) {
              labelInstruction = `<p class="instruction-label font-bold pl-1 pr-2"><span class="material-symbols-rounded align-text-bottom">auto_fix_normal</span>${item.instruction.replace("...", "")}</p>`;
            }
            let files = `<div id="attachment-${item.id}" class="attachment flex flex-col gap-1 items-center">`;
            if (item.attachFile && item.attachFile[0]) {
              files += item.attachFile.map((v) => {
                return `<span class="flex opacity-50 max-w-full self-start items-center overflow-hidden"><span class="material-symbols-rounded">file_present</span><span class="grow whitespace-pre text-ellipsis overflow-hidden text-xs">${decodeURIComponent(v.file)}</span></span>`;
              }).join("");
            }
            files += "</div>";
            let html = `<div id="prompt-${item.id}" class="prompt markdown-body pb-2">${labelAgent}${labelInstruction}${markedResponse.documentElement.innerHTML}${files}</div>`;
            list.innerHTML += buildQuestion(item.name, undefined, item.timestamp, item.id, html, 'resolved');
          } else if (item.type === "answer") {
            const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(item.value)), "text/html");
            const preCodeList = markedResponse.querySelectorAll("pre > code");

            preCodeList.forEach((preCode, index) => {
              preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");
              preCode.classList.forEach((cls, _idx, _arr) => {
                if (cls.startsWith('language-')) {
                  preCode.parentElement.dataset.lang = cls.slice(9);
                }
              });

              if (index !== preCodeList.length - 1) {
                preCode.parentElement.classList.add("mb-8");
              }

              const buttonWrapper = document.createElement("div");
              buttonWrapper.classList.add("code-actions-wrapper");

              // Create wrap button
              const wrapButton = document.createElement("button");
              wrapButton.dataset.id = item.id;
              wrapButton.title = l10nForUI["ToggleWrap"];
              wrapButton.innerHTML = wrapIcon;

              wrapButton.classList.add("wrap-element-gnc", "rounded");

              const fav = document.createElement("button");
              fav.dataset.id = item.id;
              if (preCode.parentElement.dataset.lang !== 'mermaid') {
                fav.title = l10nForUI["Favorite"];
                fav.innerHTML = favIcon;
                fav.classList.add("fav-element-gnc", "rounded");
              } else {
                fav.title = l10nForUI["Show graph"];
                fav.innerHTML = viewIcon;
                fav.classList.add("mermaid-element-gnc", "rounded");
              }

              const diff = document.createElement("button");
              diff.dataset.id = item.id;
              diff.title = l10nForUI["Diff"];
              diff.innerHTML = diffIcon;

              diff.classList.add("diff-element-gnc", "rounded");

              // Create copy to clipboard button
              const copyButton = document.createElement("button");
              copyButton.dataset.id = item.id;
              copyButton.title = l10nForUI["Copy"];
              copyButton.innerHTML = clipboardIcon;

              copyButton.classList.add("code-element-gnc", "rounded");

              const insert = document.createElement("button");
              insert.dataset.id = item.id;
              insert.title = l10nForUI["Insert"];
              insert.innerHTML = insertIcon;

              insert.classList.add("edit-element-gnc", "rounded");

              buttonWrapper.append(wrapButton, fav, diff, copyButton, insert);

              preCode.parentElement.prepend(buttonWrapper);
            });
            let reqIdIcon = ``;
            if (item.requestId) {
              reqIdIcon = `<button id="request-id-${item.id}" class="request-id-element-gnc flex self-start opacity-50 text-transparent" title="request-id: ${item.requestId}" data-request-id="${item.requestId}">
                            ${requestIdIcon}
                          </button>`;
            }
            list.innerHTML += `<div id="${item.id}" data-name="${item.name}" class="p-4 answer-element-gnc">
                            <h2 class="avatar mb-2 -ml-1 flex justify-between gap-1">
                              <span class="flex gap-2 flex text-xl items-center">
                                ${aiIcon}
                                <span class="flex flex-col gap-1 text-xs">
                                  <b>${item.name}</b>
                                  <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                    ${new Date(item.timestamp).toLocaleString() || `--/--/----, --:--:--`}
                                  </div>
                                </span>
                              </span>
                              ${reqIdIcon}
                            </h2>
                            <div id="response-${item.id}" class="response flex flex-col gap-1 markdown-body">
                              ${markedResponse.documentElement.innerHTML}
                            </div>
                          </div>`;
          }
        }
        list.innerHTML += `<span class="empty-history material-symbols-rounded">pets</span>`;
        list.innerHTML += `<div class='history-seperator' data-text='↓ ${new Date().toLocaleString()} ↓'></div>`;
        list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        break;
      }
      case 'showInfoTip': {
        showInfoTip(message);
        break;
      }
      case "listFile": {
        _toggleFileList(message.value, true);
        break;
      }
      case "attachFile": {
        attachFileItem(message);
        break;
      }
      case 'codeReady': {
        if (modalShow) {
          break;
        }
        if (document.getElementById("question-input").disabled) {
          break;
        }
        var acc = document.getElementById("attach-code-container");
        if (message.file) {
          acc.innerHTML = "";
          let ct = document.createElement('div');
          ct.dataset['file'] = message.file;
          if (message.range) {
            ct.dataset['range'] = JSON.stringify(message.range);
          }
          ct.classList.add("attach-code", "flex", "items-end", "px-1");
          let rangetag = ``;
          if (!message.range) {
            rangetag = ``;
          } else if (message.range.start.line === message.range.end.line) {
            rangetag = `#L${message.range.start.line + 1}C${message.range.start.character + 1}-${message.range.end.character + 1}`;
          } else {
            rangetag = `#L${message.range.start.line + 1}C${message.range.start.character + 1}-L${message.range.end.line + 1}C${message.range.end.character + 1}`;
          }
          let icon = document.createElement('span');
          icon.classList.add("material-symbols-rounded");
          icon.innerText = "segment";
          let link = document.createElement('vscode-link');
          link.classList.add("grow", "whitespace-pre", "text-ellipsis", "overflow-hidden", "text-xs");
          link.title = message.file + rangetag;
          link.onclick = (_event) => {
            vscode.postMessage({ type: "openDoc", file: message.file, range: message.range });
          };
          link.innerHTML = message.label + '<span class="opacity-75">' + rangetag + '</span>';
          let rmBtn = document.createElement('span');
          rmBtn.classList.add('material-symbols-rounded', 'cursor-pointer', 'float-right', 'hover:scale-105');
          rmBtn.title = l10nForUI["Delete"];
          rmBtn.innerText = 'cancel';
          rmBtn.onclick = (_event) => {
            acc.classList.remove("with-code");
            acc.classList.add('hidden');
            acc.innerHTML = "";
          };
          ct.appendChild(icon);
          ct.appendChild(link);
          ct.appendChild(rmBtn);
          acc.appendChild(ct);
          acc.classList.add("with-code");
          acc.classList.remove('hidden');
        } else {
          if (acc) {
            acc.classList.remove("with-code");
            acc.classList.add('hidden');
            acc.innerHTML = "";
          }
        }
        break;
      }
      case "updateSettingPage": {
        if (modalShow) {
          break;
        }
        var settings = document.getElementById('settings');
        if (message.action === "close" || (message.action === "toggle" && settings)) {
          settings?.remove();
          document.getElementById("question-input").focus();
          break;
        }
        if (message.action === "open" || message.action === "toggle" || settings) {
          if (!settings || message.action === "full") {
            const sp = document.getElementById("setting-page");
            sp.innerHTML = message.value;
          } else {
            var sn = new DOMParser().parseFromString(message.value, "text/html").getElementById("settings");
            if (sn) {
              for (let i = sn.childNodes.length - 1; i >= 0; i--) {
                if (sn.childNodes[i].classList?.contains("immutable")) {
                  sn.removeChild(sn.childNodes[i]);
                }
              }
              for (let i = settings.childNodes.length - 1; i >= 0; i--) {
                if (!settings.childNodes[i].classList?.contains("immutable")) {
                  settings.removeChild(settings.childNodes[i]);
                }
              }
              settings.append(...sn.childNodes);
            }
          }
        }
        break;
      }
      case "generateQRCode": {
        let qrc = document.getElementById("qrcode");
        if (qrc) {
          qrc.innerHTML = "";
          qrc.classList.remove("empty", "used", "masked");
          new QRCode(qrc, {
            text: message.value,
            width: 160,
            height: 160,
            correctLevel: QRCode.CorrectLevel.L
          });
          qrc.title = "";
        }
        break;
      }
      case "usedQRCode": {
        let qrc = document.getElementById("qrcode");
        if (qrc) {
          qrc.classList.add("used");
        } else {
          vscode.postMessage({ type: 'revokeQRCode' });
        }
        break;
      }
      case "maskQRCode": {
        let qrcview = document.getElementById("view-qrcode");
        let qrc = document.getElementById("qrcode");
        if (!qrcview || qrcview.hidden || !qrc) {
          vscode.postMessage({ type: 'revokeQRCode' });
          if (qrc) {
            qrc.classList.add("empty");
            qrc.classList.remove("used");
          }
        }
        if (qrc && qrc.classList.contains("used")) {
          qrc.classList.add("masked");
          qrc.classList.add("empty");
          qrc.classList.remove("used");
          vscode.postMessage({ type: 'revokeQRCode' });
        }
        break;
      }
      case "agentList": {
        agents = message.value;
        var agentnames = `<div class="toolbar w-full text-end px-1">
                            <vscode-link title="${l10nForUI["Edit"]}"><span id="agent-manage" class="material-symbols-rounded">tune</span></vscode-link>
                          </div>`;
        agents.forEach((p, idx, _m) => {
          agentnames += `<button class="flex flex-row gap-2 items-center ${idx === 1 ? "selected" : ""}" data-shortcut='@${p.id}'
                                  onclick='vscode.postMessage({type: "addAgent", id: "${p.id}"});'
                          >
                            <span class="shortcut grow" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.id}></span>
                            <span style="text-overflow: ellipsis; overflow: hidden;">${p.label}</span>
                            <span class="material-symbols-rounded">${p.icon || "badge"}</span>
                          </button>
                      `;
        });
        document.getElementById("agent-list").innerHTML = agentnames;
        _toggleAgentList();
        break;
      }
      case "addAgent": {
        var inputText = document.getElementById("question-input").value;
        var cursorPos = document.getElementById("question-input").selectionStart;
        var preVa = inputText.slice(0, cursorPos);
        var postVa = inputText.slice(cursorPos);
        var va = preVa.replace(/@\S*$/, "");
        var newPos = va.length;
        if (postVa) {
          va = va + postVa;
        }
        document.getElementById("question-input").value = va;
        document.getElementById("question-input").selectionStart = newPos;
        document.getElementById("question-input").selectionEnd = newPos;
        document.getElementById("question-sizer").dataset.value = va;
        document.getElementById("agent-tab-btn").dataset.agent = `${message.value}`;
        document.getElementById("agent-indicator").classList.remove("hidden");
        _toggleAgentList();
        document.getElementById("question-input").focus();
        break;
      }
      case "promptList": {
        prompts = message.value;
        var shortcuts = `<div class="toolbar w-full text-end px-1"><vscode-link title="${l10nForUI["Edit"]}"><span id="prompt-manage" class="material-symbols-rounded">tune</span></vscode-link></div>`;
        var first = true;
        for (var p of prompts) {
          let icon = p.icon || "smart_button";
          p.origin = p.origin?.replaceAll("'", "\\'");
          p.message.content = p.message.content.replaceAll("'", "\\'");
          shortcuts += `  <button class="flex flex-row gap-2 items-center ${first ? "selected" : ""}"
                                  ${p.shortcut ? `data-shortcut='/${p.shortcut}'` : ""}
                                  onclick='sendAction("${p.shortcut}");'
                          '>
                            <span class="shortcut grow" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.shortcut}></span>
                            <span style="text-overflow: ellipsis; overflow: hidden;">${p.label}${p.inputRequired ? "..." : ""}</span>
                            <span class="material-symbols-rounded">${icon}</span>
                          </button>
                      `;
          first = false;
        }
        document.getElementById("ask-list").innerHTML = shortcuts;
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        break;
      }
      case "addSearch": {
        updateChatBoxStatus("start");
        toggleSubMenuList();
        history = [message.value, ...history];
        break;
      }
      case "addQuestion": {
        if (modalShow) {
          break;
        }
        updateChatBoxStatus("start");
        toggleSubMenuList();
        let id = message.id;
        var replaceElems = document.getElementsByClassName("editRequired");
        for (var e of replaceElems) {
          e.remove();
        }

        let promptInfo = message.value;
        list.innerHTML += buildQuestion(message.username, message.avatar, message.timestamp, id, promptInfo.html, promptInfo.status);

        document.getElementById(`question-${id}`).querySelectorAll('pre code').forEach((el) => {
          hljs.highlightElement(el);
        });
        document.getElementById('question-input').blur();
        var c = document.getElementById("attach-code-container");
        if (c) {
          c.innerHTML = "";
          c.classList.remove("with-code");
          c.classList.add("hidden");
        }
        var f = document.getElementById("attach-file-container");
        if (f) {
          f.innerHTML = "";
          f.classList.add("hidden");
        }

        editCache.set(`${id}`, promptInfo.prompt);
        if (promptInfo.status === "editRequired") {
          document.getElementById("question-input").disabled = true;
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
          break;
        } else {
          updateHistory(promptInfo.prompt);
          document.getElementById("chat-input-box")?.classList?.add("responsing");
          document.getElementById("question-input").disabled = true;
          contents.set(id, "");
          var chat = document.getElementById(`${id}`);
          if (!chat) {
            chat = document.createElement("div");
            chat.id = `${id}`;
            chat.classList.add("p-4", "answer-element-gnc", "responsing");
            let progress = `<div id="progress-${id}" class="progress pt-6 flex justify-between items-center">
                      <span class="flex gap-1 opacity-60 items-center">
                        <div class="spinner thinking">
                          <div class='sk-cube-grid'>
                            <div class='sk-cube sk-cube-1'></div>
                            <div class='sk-cube sk-cube-2'></div>
                            <div class='sk-cube sk-cube-3'></div>
                            <div class='sk-cube sk-cube-4'></div>
                            <div class='sk-cube sk-cube-5'></div>
                            <div class='sk-cube sk-cube-6'></div>
                            <div class='sk-cube sk-cube-7'></div>
                            <div class='sk-cube sk-cube-8'></div>
                            <div class='sk-cube sk-cube-9'></div>
                          </div>
                        </div>
                        <div class="thinking-text">${l10nForUI["Thinking..."]}</div>
                      </span>
                      <button class="stopGenerate flex" data-id=${id} title="${l10nForUI["Stop responding"]} [Esc]">
                        <span class="material-symbols-rounded">
                          stop_circle
                        </span>
                        <p class="mx-1">${l10nForUI["Stop responding"]}</p>
                      </button>
                    </div>`;
            if (message.streaming === true) {
              progress = `
            <div id="progress-${id}" class="progress pt-6 flex justify-between items-center">
              <span class="flex gap-1 opacity-60 items-center">
                <div class="spinner connecting">
                  <span class="material-symbols-rounded">autorenew</span>
                </div>
                <div class="connecting-text">${l10nForUI["Connecting..."]}</div>
                <div class="spinner typing">
                  <div class='sk-cube-grid'>
                    <div class='sk-cube sk-cube-1'></div>
                    <div class='sk-cube sk-cube-2'></div>
                    <div class='sk-cube sk-cube-3'></div>
                    <div class='sk-cube sk-cube-4'></div>
                    <div class='sk-cube sk-cube-5'></div>
                    <div class='sk-cube sk-cube-6'></div>
                    <div class='sk-cube sk-cube-7'></div>
                    <div class='sk-cube sk-cube-8'></div>
                    <div class='sk-cube sk-cube-9'></div>
                  </div>
                </div>
                <div class="typing-text">${l10nForUI["Typing..."]}</div>
              </span>
              <button class="stopGenerate flex items-stretch" data-id=${id} title="${l10nForUI["Stop responding"]} [Esc]">
                <span class="material-symbols-rounded">
                  stop_circle
                </span>
                <p class="mx-1">${l10nForUI["Stop responding"]}</p>
              </button>
            </div>`;
            }
            chat.innerHTML = `  <h2 class="avatar mb-2 -ml-1 flex justify-between gap-1">
                                    <span class="flex gap-2 flex text-xl items-center">
                                      ${aiIcon}
                                      <span class="flex flex-col gap-1 text-xs">
                                        <b>${message.robot}</b>
                                        <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                          --/--/----, --:--:--
                                        </div>
                                      </span>
                                    </span>
                                    <button id="request-id-${id}" class="hidden request-id-element-gnc flex self-start opacity-50 text-transparent">
                                      ${requestIdIcon}
                                    </button>
                                  </h2>
                                  <div id="reference-${id}" class="reference flex flex-col gap-1 items-center"></div>
                                  <div id="response-${id}" class="response ${promptInfo.prompt?.code ? 'with-code' : ''} empty flex flex-col gap-1 markdown-body"></div>
                                  ${progress}
                                  <div id="feedback-${id}" class="feedback pt-6 flex justify-between items-center hidden">
                                    <span class="flex items-center gap-2">
                                      <button class="like flex" data-id=${id}>
                                        <span class="material-symbols-rounded">
                                          thumb_up
                                        </span>
                                      </button>
                                      <button class="dislike flex" data-id=${id}>
                                        <span class="material-symbols-rounded">
                                          thumb_down
                                        </span>
                                      </button>
                                      <button class="correct flex" title="" data-id=${id}>
                                        <span class="material-symbols-rounded">
                                          rate_review
                                        </span>
                                      </button>
                                    </span>
                                    <span class="flex items-center gap-2">
                                      <button class="continue-element-gnc hidden flex items-stretch" data-id=${id}>
                                        ${continueIcon}
                                        <p class="mx-1">${l10nForUI["Continue"]}</p>
                                      </button>
                                      <button class="regenerate flex items-stretch" data-id=${id}>
                                        <span class="material-symbols-rounded">refresh</span>
                                        <p class="mx-1">${l10nForUI["Regenerate"]}</p>
                                      </button>
                                    </span>
                                  </div>`;
            list.appendChild(chat);
          }
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        }
        break;
      }
      case "stopResponse": {
        updateChatBoxStatus("stop", message.id);
        const chatText = document.getElementById(`response-${message.id}`);
        if (!chatText) {
          break;
        }
        const scroll = scrollPositionAtBottom();
        render(message.id, scroll);
        let r = document.getElementById(`${message.id}`);
        if (chatText.classList.contains("empty")) {
          document.getElementById(`feedback-${message.id}`)?.classList?.add("empty");
        } else {
          let rts = r?.getElementsByClassName("message-ts");
          if (rts && rts[0] && !rts[0].classList.contains("material-symbols-rounded")) {
            ts = rts[0].textContent;
          }
        }
        if (!chatText.classList.contains("error")) {
          const preCodeList = chatText.querySelectorAll("pre > code");

          preCodeList.forEach((preCode, index) => {
            preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");
            preCode.classList.forEach((cls, _idx, _arr) => {
              if (cls.startsWith('language-')) {
                preCode.parentElement.dataset.lang = cls.slice(9);
              }
            });
            
            let codeLines = preCode.textContent.split("\n").length;

            vscode.postMessage({ type: 'telemetry', id: parseInt(message.id), ts: new Date().valueOf(), action: "code-generated", args: { languageid: preCode.parentElement.dataset.lang, codeLines } });

            if (index !== preCodeList.length - 1) {
              preCode.parentElement.classList.add("mb-8");
            }

            var buttonWrapper = preCode.parentElement.querySelector(".code-actions-wrapper");
            if (!buttonWrapper) {
              buttonWrapper = document.createElement("div");
              buttonWrapper.classList.add("code-actions-wrapper");
              preCode.parentElement.prepend(buttonWrapper);
            }

            const fav = document.createElement("button");
            fav.dataset.id = message.id;
            if (preCode.parentElement.dataset.lang !== 'mermaid') {
              fav.title = l10nForUI["Favorite"];
              fav.innerHTML = favIcon;
              fav.classList.add("fav-element-gnc", "rounded");
            } else {
              fav.title = l10nForUI["Show graph"];
              fav.innerHTML = viewIcon;
              fav.classList.add("mermaid-element-gnc", "rounded");
            }

            const diff = document.createElement("button");
            diff.dataset.id = message.id;
            diff.title = l10nForUI["Diff"];
            diff.innerHTML = diffIcon;

            diff.classList.add("diff-element-gnc", "rounded");

            // Create wrap to clipboard button
            const wrapButton = document.createElement("button");
            wrapButton.dataset.id = message.id;
            wrapButton.title = l10nForUI["ToggleWrap"];
            wrapButton.innerHTML = wrapIcon;

            wrapButton.classList.add("wrap-element-gnc", "rounded");

            // Create copy to clipboard button
            const copyButton = document.createElement("button");
            copyButton.dataset.id = message.id;
            copyButton.title = l10nForUI["Copy"];
            copyButton.innerHTML = clipboardIcon;

            copyButton.classList.add("code-element-gnc", "rounded");

            const insert = document.createElement("button");
            insert.dataset.id = message.id;
            insert.title = l10nForUI["Insert"];
            insert.innerHTML = insertIcon;

            insert.classList.add("edit-element-gnc", "rounded");

            buttonWrapper.append(wrapButton, fav, diff, copyButton, insert);
          });
          if (scroll) {
            list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
          }
        }
        clearReponseRender(message.id);
        timestamps.delete(message.id);
        lasttimestamps.delete(message.id);
        renderers.delete(message.id);
        contents.delete(message.id);
        break;
      }
      case "needContinue": {
        const respElem = document.getElementById(`${message.id}`);
        if (!respElem) {
          break;
        }
        respElem.classList.add("need-continue");
        break;
      }
      case "showModal": {
        document.getElementById('question-input').blur();
        let modal = document.getElementsByClassName('modal')[0];
        modal.innerHTML = `<div id="modal-body" class="body p-4 rounded-lg h-fit grow mx-auto shadow-md shadow-black/80">${message.value}</div>`;
        modal.classList.remove('hidden');
        break;
      }
      case "addMessage": {
        list.querySelectorAll(".progress-ring").forEach(elem => elem.remove());
        let lastElem = list.lastElementChild;
        if (lastElem && lastElem.classList.contains("message-element-gnc")) {
          if (lastElem.classList.contains(message.category)) {
            lastElem.remove();
          }
        } else {
        }

        if (message.category === "welcome") {
          if (modalShow) {
            let msgBox = document.getElementsByClassName("modal")[0];
            msgBox.classList.add('hidden');
            msgBox.innerHTML = "";
          }
        }

        list.innerHTML += `<div class="p-4 message-element-gnc ${message.category || ""}">
                            <h2 class="avatar mb-2 -ml-1 flex gap-1">
                              <span class="flex gap-2 flex text-xl items-center">
                                ${aiIcon}
                                <span class="flex flex-col gap-1 text-xs">
                                  <b>${message.robot}</b>
                                  <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                    ${new Date(message.timestamp).toLocaleString()}
                                  </div>
                                </span>
                              </span>
                            </h2>
                            <div class="markdown-body">
                              ${message.value}
                            </div>
                          </div>`;
        list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        break;
      }
      case "updateResponse": {
        const chatText = document.getElementById(`response-${message.id}`);
        if (!chatText) {
          break;
        }
        if (chatText.classList.contains("empty")) {
          createReponseRender(message.id);
          if (message.timestamp) {
            let r = document.getElementById(`${message.id}`);
            let rts = r?.getElementsByClassName("message-ts");
            if (rts && rts[0]) {
              rts[0].textContent = new Date(message.timestamp).toLocaleString();
            }
          }
          chatText.classList.remove("empty");
        }
        const progText = document.getElementById(`progress-${message.id}`);
        progText?.classList.add("started");
        contents.set(message.id, message.value);
        timestamps.set(message.id, message.timestamp);
        break;
      }
      case "addRequestId": {
        if (!list.innerHTML) {
          return;
        }
        const ridElem = document.getElementById(`request-id-${message.id}`);
        if (ridElem) {
          ridElem.title = `request-id: ${message.requestId}`;
          ridElem.dataset["requestId"] = message.requestId;
          ridElem.classList.remove("hidden");
        }
        break;
      }
      case "addReference": {
        if (!list.innerHTML) {
          return;
        }
        const reference = document.getElementById(`reference-${message.id}`);
        if (reference) {
          reference.innerHTML = message.files.map((v) => {
            return `<span class="flex opacity-50 max-w-full self-start items-center overflow-hidden"><span class="material-symbols-rounded">quick_reference_all</span><span class="grow whitespace-pre text-ellipsis overflow-hidden text-xs">${decodeURIComponent(v)}</span></span>`;
          }).join("");
        }
        break;
      }
      case "addError": {
        if (!list.innerHTML) {
          return;
        }
        const chatText = document.getElementById(`response-${message.id}`);
        if (chatText?.classList.contains("empty")) {
          if (message.timestamp) {
            let r = document.getElementById(`${message.id}`);
            let rts = r?.getElementsByClassName("message-ts");
            if (rts && rts[0]) {
              rts[0].textContent = new Date(message.timestamp).toLocaleString();
            }
          }
        }
        updateChatBoxStatus("stop", message.id);
        document.getElementById(`feedback-${message.id}`)?.classList.add("error");
        if (!chatText) {
          break;
        }
        const scroll = scrollPositionAtBottom();
        chatText.classList.add("error");
        let error = `<div class="errorMsg rounded flex items-center">
                        <span class="material-symbols-rounded text-3xl p-2">report</span>
                        <div class="grow py-4 overflow-auto">
                            <div>${message.error}</div>
                        </div>
                        <button class="bug rounded border-0 mx-4 opacity-80 focus:outline-none" data-id=${message.id}>
                          <span class="material-symbols-rounded">
                            bug_report
                          </span>
                        </button>
                    </div>`;
        contents.set(message.id, contents.get(message.id) + error);
        chatText.innerHTML = chatText.innerHTML + error;
        if (scroll) {
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        }
        break;
      }
      default:
        break;
    }
  });

  vscode.postMessage({ type: "welcome" });
  vscode.postMessage({ type: "listAgent" });
  vscode.postMessage({ type: "listPrompt" });

  const sendQuestion = (question, replace) => {
    const prompt = question.getElementsByClassName("prompt");
    if (prompt && prompt[0]) {
      var id = prompt[0].dataset['id'];
      var valuesElems = prompt[0].getElementsByClassName(`values`);
      var values = {};
      if (valuesElems && valuesElems[0]) {
        values = { ...valuesElems[0].dataset };
      }
      var acc = document.getElementById("attach-code-container");
      var afc = document.getElementById("attach-file-container");

      var promptTemp = editCache.get(id);
      promptTemp.args = undefined;
      if (replace) {
        acc = undefined;
        afc = document.getElementById(`attachment-${replace}`);
      }

      let attachCode = [];
      if (acc) {
        for (let c of acc.children) {
          if (c.dataset['file']) {
            let range;
            if (c.dataset['range']) {
              range = JSON.parse(c.dataset['range']);
            }
            attachCode.push({
              file: c.dataset['file'],
              range
            });
          }
        }
      }
      let attachFile = [];
      if (afc) {
        for (let f of afc.children) {
          if (f.dataset['file']) {
            attachFile.push({
              file: f.dataset['file']
            });
          }
        }
      }

      if (replace) {
        document.getElementById(`question-${replace}`)?.remove();
        document.getElementById(replace)?.remove();
        editCache.delete(id);
      }

      var agent = document.getElementById("agent-tab-btn").dataset.agent;
      vscode.postMessage({
        type: "sendQuestion",
        replace: replace && parseInt(replace),
        agent,
        attachCode,
        attachFile,
        prompt: promptTemp,
        values
      });
      document.getElementById("agent-indicator").classList.add("hidden");
      document.getElementById("agent-tab-btn").dataset.agent = ``;
    } else {
      showInfoTip({ style: "error", category: "no-prompt", id: new Date().valueOf(), value: l10nForUI["Empty prompt"] });
    }
  };

  const sendPrompt = (content) => {
    var acc = document.getElementById("attach-code-container");
    let attachCode = [];
    for (let c of acc.children) {
      if (c.dataset['file']) {
        let range;
        if (c.dataset['range']) {
          range = JSON.parse(c.dataset['range']);
        }
        attachCode.push({
          file: c.dataset['file'],
          range
        });
      }
    }
    var afc = document.getElementById("attach-file-container");
    let attachFile = [];
    for (let f of afc.children) {
      if (f.dataset['file']) {
        attachFile.push({
          file: f.dataset['file']
        });
      }
    }
    var agent = document.getElementById("agent-tab-btn").dataset.agent;
    vscode.postMessage({
      type: "sendQuestion",
      attachCode,
      attachFile,
      agent,
      prompt: {
        label: "",
        type: "free chat",
        message: { role: 'user', content }
      }
    });
    document.getElementById("agent-indicator").classList.add("hidden");
    document.getElementById("agent-tab-btn").dataset.agent = ``;
  };

  function updateHistory(prompt) {
    if (prompt.type === 'free chat') {
      let item = prompt.message.content;
      item = item.replaceAll("{{code}}", "");
      history = [item.trim(), ...history];
    }
  }

  function updateChatBoxStatus(status, id) {
    if (status === "stop") {
      document.getElementById(`question-${id}`)?.classList.remove("responsing");
      document.getElementById(id)?.classList.remove("responsing");
      document.getElementById(`progress-${id}`)?.classList?.add("hidden");
      document.getElementById(`feedback-${id}`)?.classList?.remove("hidden");
      document.getElementById("chat-input-box")?.classList?.remove("responsing");
      document.getElementById("question-input").disabled = false;
      //document.getElementById("question-input").focus();
    }
    if (status === "start") {
      document.getElementById('settings')?.remove();
      document.getElementById("agent-list").classList.add("hidden");
      document.getElementById("ask-list").classList.add("hidden");
      document.getElementById("search-list").classList.add("hidden");
      document.getElementById("question-input").value = "";
      document.getElementById("question-sizer").dataset.value = "";
      document.getElementById("chat-input-box").classList.remove("history");
    }
  }

  function checkCommandToken(target, token) {
    if (target.value && target.selectionStart > 0 && target.selectionStart === target.selectionEnd && String.fromCodePoint(target.value.codePointAt(target.selectionStart - 1))) {
      let pieces = target.value.slice(0, target.selectionStart).split(" ");
      let tail = pieces[pieces.length - 1];
      return tail.startsWith(token) ? tail : undefined;
    }
  }

  function _toggleFileList(files, show) {
    var list = document.getElementById("file-list");
    if (show && files && files[0] && list.classList.contains("hidden")) {
      document.getElementById("chat-input-box").classList.add("file");
      var afc = document.getElementById("attach-file-container");
      let attachedFile = [];
      for (let f of afc.children) {
        if (f.dataset['file']) {
          attachedFile.push(f.dataset['file']);
        }
      }

      var firstSelected = false;
      files.forEach((item, _index) => {
        var f = document.createElement("button");
        if (item.kind < 0) {
          f.classList.add("disabled", "flex", "items-end", "w-full", "overflow-hidden", "whitespace-nowrap", "px-1", "text-xs");
          f.innerText = item.label;
          list.appendChild(f);
          return;
        }
        let icon = document.createElement('span');
        icon.classList.add('material-symbols-rounded');
        icon.innerText = item.binary ? "link" : "description";
        if (attachedFile.includes(item.file)) {
          f.classList.add("disabled");
          icon.innerText = "file_present";
        } else if (!firstSelected) {
          f.classList.add("selected");
          firstSelected = true;
        }
        f.classList.add("flex", "gap-1", "items-end", "w-full", "overflow-hidden", "whitespace-nowrap", "px-2", "py-1");
        f.innerText = item.label;
        f.title = item.file;
        f.prepend(icon);
        f.onclick = () => attachFileItem(item);
        list.appendChild(f);
      });
      var othersTag = document.createElement("button");
      othersTag.classList.add("disabled", "flex", "items-end", "w-full", "overflow-hidden", "whitespace-nowrap", "px-1", "text-xs");
      othersTag.innerText = l10nForUI["Others"];
      list.appendChild(othersTag);

      var browseFile = document.createElement("button");
      browseFile.classList.add("flex", "gap-1", "items-end", "w-full", "overflow-hidden", "whitespace-nowrap", "px-2", "py-1");
      if (!firstSelected) {
        browseFile.classList.add("selected");
        firstSelected = true;
      }
      browseFile.innerText = l10nForUI["Workspace Files"] + " ...";
      let browseFileIcon = document.createElement('span');
      browseFileIcon.classList.add('material-symbols-rounded');
      browseFileIcon.innerText = "folder_copy";
      browseFile.prepend(browseFileIcon);
      browseFile.onclick = () => {
        _toggleFileList([], false);
        vscode.postMessage({ type: "selectFile", scope: "workspace" });
      };
      list.appendChild(browseFile);

      var browseKB = document.createElement("button");
      browseKB.classList.add("flex", "gap-1", "items-end", "w-full", "overflow-hidden", "whitespace-nowrap", "px-2", "py-1");
      browseKB.innerText = l10nForUI["Knowledge Base"] + " ...";
      let browseKBIcon = document.createElement('span');
      browseKBIcon.classList.add('material-symbols-rounded');
      browseKBIcon.innerText = "smb_share";
      browseKB.prepend(browseKBIcon);
      browseKB.onclick = () => {
        _toggleFileList([], false);
        vscode.postMessage({ type: "selectFile", scope: "knowledgebase" });
      };
      list.appendChild(browseKB);

      list.classList.remove("hidden");
    } else {
      list.classList.add("hidden");
      list.innerHTML = "";
      document.getElementById("chat-input-box").classList.remove("file");
    }
  }

  function _toggleAgentList(force) {
    var q = document.getElementById('question-input');
    if (q.value) {
      document.getElementById("chat-input-box").classList.add("prompt-ready");
    } else {
      document.getElementById("chat-input-box").classList.remove("prompt-ready");
    }
    var list = document.getElementById("agent-list");
    var agentCmd = checkCommandToken(q, "@");
    if (force) {
      agentCmd = "@";
    }
    if (agentCmd) {
      let allAction = list.querySelectorAll("button");
      allAction.forEach((btn, _index) => {
        btn.classList.add('hidden');
      });
      var btns = Array.from(list.querySelectorAll("button")).filter((sc, _i, _arr) => {
        return sc.dataset.shortcut?.startsWith(agentCmd);
      });
      var emptyByFilter = (allAction.length === 0) || (allAction.length > 0 && btns.length === 0);
      if (!emptyByFilter) {
        document.getElementById("agent-indicator").classList.add("hidden");
        document.getElementById("agent-tab-btn").dataset.agent = ``;
        list.classList.remove("hidden");
        document.getElementById("chat-input-box").classList.add("agent");
        btns.forEach((btn, index) => {
          if (index === 0) {
            btn.classList.add('selected');
          } else {
            btn.classList.remove('selected');
          }
          var sc = btn.querySelector('.shortcut');
          if (sc) {
            sc.textContent = agentCmd.slice(1);
            sc.dataset.suffix = btn.dataset.shortcut.slice(agentCmd.length);
          }
          btn.classList.remove('hidden');
        });
        return;
      }
    }
    list.classList.add("hidden");
    document.getElementById("chat-input-box").classList.remove("agent");
  }

  function _toggleAskList() {
    var q = document.getElementById('question-input');
    if (q.value) {
      document.getElementById("chat-input-box").classList.add("prompt-ready");
    } else {
      document.getElementById("chat-input-box").classList.remove("prompt-ready");
    }
    var list = document.getElementById("ask-list");
    var promptCmd = checkCommandToken(q, "/");
    if (promptCmd) {
      let allAction = list.querySelectorAll("button");
      allAction.forEach((btn, _index) => {
        btn.classList.add('hidden');
      });
      var btns = Array.from(list.querySelectorAll("button")).filter((sc, _i, _arr) => {
        return sc.dataset.shortcut?.startsWith(promptCmd);
      });
      var emptyByFilter = (allAction.length === 0 && promptCmd !== '/') || (allAction.length > 0 && btns.length === 0);
      if (!emptyByFilter) {
        list.classList.remove("hidden");
        document.getElementById("chat-input-box").classList.add("action");
        btns.forEach((btn, index) => {
          if (index === 0) {
            btn.classList.add('selected');
          } else {
            btn.classList.remove('selected');
          }
          var sc = btn.querySelector('.shortcut');
          if (sc) {
            sc.textContent = promptCmd.slice(1);
            sc.dataset.suffix = btn.dataset.shortcut.slice(promptCmd.length);
          }
          btn.classList.remove('hidden');
        });
        return;
      }
    }
    list.classList.add("hidden");
    document.getElementById("chat-input-box").classList.remove("action");
  }

  function _toggleSearchList() {
    var q = document.getElementById('question-input');
    var list = document.getElementById("search-list");
    if (q.value.startsWith('?') || q.value.startsWith('？')) {
      document.getElementById("chat-input-box").classList.add("search");
      //list.classList.remove("hidden");
    } else {
      document.getElementById("chat-input-box").classList.remove("search");
      var urls = list.querySelectorAll("vscode-checkbox");
      for (let i = 0; i < urls.length; i++) {
        urls[i].classList.remove("selected");
      }
      list.classList.add("hidden");
    }
  }

  function toggleSubMenuList() {
    _toggleAgentList();
    _toggleAskList();
    _toggleSearchList();
    _toggleFileList([], false);
  }

  document.addEventListener("change", (e) => {
    if (e.target.id === "question-input") {
      toggleSubMenuList();
    } else if (e.target.id === "triggerDelay") {
      vscode.postMessage({ type: "completionDelay", value: e.target.valueAsNumber });
    } else if (e.target.id === "completionPreference") {
      vscode.postMessage({ type: "completionPreference", value: e.target.valueAsNumber });
    } else if (e.target.id === "candidateNumber") {
      vscode.postMessage({ type: "candidates", value: e.target.valueAsNumber });
    } else if (e.target.id === "responseModeRadio") {
      vscode.postMessage({ type: "responseMode", value: e.target._value });
    } else if (e.target.id === "engineDropdown") {
      vscode.postMessage({ type: "activeEngine", value: e.target._value });
    } else if (e.target.id === "knowledgeBaseRef") {
      vscode.postMessage({ type: "knowledgeBaseRef", value: e.target._checked });
    } else if (e.target.id === "workspaceRef") {
      vscode.postMessage({ type: "workspaceRef", value: e.target._checked });
    } else if (e.target.id === "webRef") {
      vscode.postMessage({ type: "webRef", value: e.target._checked });
    } else if (e.target.id === "privacy") {
      vscode.postMessage({ type: "privacy", value: e.target._checked });
    } else {
    }
  });

  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    document.getElementById("question-input").value = data;
    document.getElementById("question-sizer").dataset.value = data;
    toggleSubMenuList();
  });

  document.addEventListener("input", (e) => {
    if (
      e.target.id === "login-email-account" ||
      e.target.id === "login-email-password") {
      var account = document.getElementById("login-email-account");
      var pwd = document.getElementById("login-email-password");
      var loginEmailBtn = document.getElementById("login-email-btn");
      if (account.checkValidity() && pwd?.checkValidity()) {
        if (loginEmailBtn) {
          loginEmailBtn.disabled = false;
        }
      } else {
        if (loginEmailBtn) {
          loginEmailBtn.disabled = true;
        }
      }
    } else if (
      e.target.id === "login-phone-account" ||
      e.target.id === "login-phone-password") {
      var account = document.getElementById("login-phone-account");
      var pwd = document.getElementById("login-phone-password");
      var loginPwdBtn = document.getElementById("login-phone-btn");
      if (account.checkValidity() && pwd?.checkValidity()) {
        if (loginPwdBtn) {
          loginPwdBtn.disabled = false;
        }
      } else {
        if (loginPwdBtn) {
          loginPwdBtn.disabled = true;
        }
      }
    } else {
      toggleSubMenuList();
    }
  });

  var historyIdx = -1;
  document.getElementById("question-input").addEventListener("blur", () => {
    historyIdx = -1;
  });

  document.body.onblur = function () {
    _toggleFileList([], false);
  };

  document.addEventListener("compositionstart", (e) => {
    if (e.target.id === "question-input") {
      isComposing = true;
    }
  });

  document.addEventListener("compositionend", (e) => {
    if (e.target.id === "question-input") {
      isComposing = false;
    }
  });

  document.addEventListener("keydown", (e) => {
    var agentList = document.getElementById("agent-list");
    var fileList = document.getElementById("file-list");
    var list = document.getElementById("ask-list");
    var search = document.getElementById("search-list");
    var settings = document.getElementById("settings");
    if (!document.getElementsByClassName("modal")[0].classList.contains("hidden")) {
      return;
    }
    if (settings) {
      return;
    }
    const targetButton = e.target.closest('button') || e.target.closest('vscode-button');
    if (targetButton && fileList.classList.contains("hidden")) {
      return;
    }
    if (!list.classList.contains("hidden") && !document.getElementById("chat-input-box").classList.contains("history")) {
      var btns = Array.from(list.querySelectorAll("button")).filter((b, _i, _a) => {
        return !b.classList.contains('hidden');
      });
      if (e.key === "Enter") {
        e.preventDefault();
        for (let i = 0; i < btns.length; i++) {
          if (btns[i].classList.contains('selected')) {
            btns[i].click();
            break;
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        for (let i = 0; i < btns.length; i++) {
          if (btns[i].classList.contains('selected')) {
            btns[i].classList.remove('selected');
            if (i < btns.length - 1) {
              btns[i + 1].classList.add('selected');
            } else {
              btns[0].classList.add('selected');
            }
            break;
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        for (let i = 0; i < btns.length; i++) {
          if (btns[i].classList.contains('selected')) {
            btns[i].classList.remove('selected');
            if (i > 0) {
              btns[i - 1].classList.add('selected');
            } else {
              btns[btns.length - 1].classList.add('selected');
            }
            break;
          }
        };
      } else {
        document.getElementById("question-input").focus();
      }
      return;
    } else if (!search.classList.contains("hidden") && !document.getElementById("chat-input-box").classList.contains("history")) {
      var urls = search.querySelectorAll("vscode-checkbox");
      var curIdx = -1;
      for (let i = 0; i < urls.length; i++) {
        if (urls[i].classList.contains("selected")) {
          curIdx = i;
          break;
        }
      }
      if (e.key === "Enter" || e.key === " ") {
        if (curIdx >= 0) {
          e.preventDefault();
          urls[curIdx].checked = !urls[curIdx].checked;
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (curIdx < 0) {
          curIdx = 0;
          urls[0].classList.add("selected");
        } else {
          urls[curIdx].classList.remove("selected");
          if (curIdx < urls.length - 1) {
            urls[curIdx + 1].classList.add("selected");
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (curIdx < 0) {
          curIdx = urls.length - 1;
          urls[urls.length - 1].classList.add("selected");
        } else {
          urls[curIdx].classList.remove("selected");
          if (curIdx > 0) {
            urls[curIdx - 1].classList.add("selected");
          }
        }
      } else {
        for (let i = 0; i < urls.length; i++) {
          urls[i].classList.remove("selected");
        }
        toggleSubMenuList();
      }
      if (curIdx >= 0) {
        return;
      }
    } else if (!agentList.classList.contains("hidden") && !document.getElementById("chat-input-box").classList.contains("history")) {
      var agentItems = Array.from(agentList.querySelectorAll("button")).filter((b, _i, _a) => {
        return !b.classList.contains('hidden');
      });
      if (e.key === "Enter") {
        e.preventDefault();
        for (let i = 0; i < agentItems.length; i++) {
          if (agentItems[i].classList.contains('selected')) {
            agentItems[i].click();
            break;
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        for (let i = 0; i < agentItems.length; i++) {
          if (agentItems[i].classList.contains('selected')) {
            agentItems[i].classList.remove('selected');
            if (i < agentItems.length - 1) {
              agentItems[i + 1].classList.add('selected');
            } else {
              agentItems[0].classList.add('selected');
            }
            break;
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        for (let i = 0; i < agentItems.length; i++) {
          if (agentItems[i].classList.contains('selected')) {
            agentItems[i].classList.remove('selected');
            if (i > 0) {
              agentItems[i - 1].classList.add('selected');
            } else {
              agentItems[agentItems.length - 1].classList.add('selected');
            }
            break;
          }
        };
      } else {
        document.getElementById("question-input").focus();
      }
      return;
    } else if (!fileList.classList.contains("hidden") && !document.getElementById("chat-input-box").classList.contains("history")) {
      var fileItems = Array.from(fileList.querySelectorAll("button")).filter((b, _i, _a) => {
        return !b.classList.contains('disabled');
      });
      if (e.key === "Enter") {
        e.preventDefault();
        for (let i = 0; i < fileItems.length; i++) {
          if (fileItems[i].classList.contains('selected')) {
            fileItems[i].click();
            break;
          }
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        for (let i = 0; i < fileItems.length; i++) {
          if (fileItems[i].classList.contains('selected')) {
            fileItems[i].classList.remove('selected');
            if (i < fileItems.length - 1) {
              fileItems[i + 1].classList.add('selected');
            } else {
              fileItems[0].classList.add('selected');
            }
            break;
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        for (let i = 0; i < fileItems.length; i++) {
          if (fileItems[i].classList.contains('selected')) {
            fileItems[i].classList.remove('selected');
            if (i > 0) {
              fileItems[i - 1].classList.add('selected');
            } else {
              fileItems[fileItems.length - 1].classList.add('selected');
            }
            break;
          }
        };
      } else {
        document.getElementById("question-input").focus();
      }
      return;
    }
    if (e.target.id === "question-input") {
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        return;
      }
      if (e.key === 'Backspace') {
        let v = e.target.value;
        if (!v) {
          document.getElementById("agent-indicator").classList.add("hidden");
          document.getElementById("agent-tab-btn").dataset.agent = ``;
        }
      }
      var composing = e.isComposing || isComposing;
      if (!composing && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (!e.target.value.trim()) {
          return;
        }
        if (document.getElementById("chat-input-box").classList.contains("search")) {
          sendSearchQuery(e.target.value.slice(1).trim());
        } else {
          sendPrompt(e.target.value);
        }
      } else if (e.key === "ArrowDown" && document.getElementById("chat-input-box").classList.contains("history")) {
        e.preventDefault();
        if (historyIdx > 0) {
          historyIdx--;
          e.target.value = history[historyIdx];
          document.getElementById("chat-input-box").classList.add("history");
          if (e.target.value.startsWith('?') || e.target.value.startsWith('？')) {
            document.getElementById("chat-input-box").classList.add("search");
          } else {
            document.getElementById("chat-input-box").classList.remove("search");
          }
        } else {
          historyIdx = -1;
          e.target.value = "";
          document.getElementById("chat-input-box").classList.remove("prompt-ready");
          document.getElementById("chat-input-box").classList.remove("history");
          document.getElementById("chat-input-box").classList.remove("search");
        }
        document.getElementById("question-sizer").dataset.value = e.target.value;
        toggleSubMenuList();
      } else if (e.key === "ArrowUp" && (historyIdx >= 0 || !document.getElementById("question-sizer").dataset.value)) {
        e.preventDefault();
        if (historyIdx < history.length - 1) {
          historyIdx++;
          e.target.value = history[historyIdx];
          document.getElementById("chat-input-box").classList.add("history");
          document.getElementById("question-sizer").dataset.value = e.target.value;
          if (e.target.value.startsWith('?') || e.target.value.startsWith('？')) {
            document.getElementById("chat-input-box").classList.add("search");
          } else {
            document.getElementById("chat-input-box").classList.remove("search");
          }
          toggleSubMenuList();
        }
      } else {
        if (document.getElementById("chat-input-box").classList.contains("history")) {
          if (e.key !== "Tab") {
            e.target.value = "";
            document.getElementById("question-sizer").dataset.value = "";
            document.getElementById("chat-input-box").classList.remove("search");
          } else {
            e.preventDefault();
            document.getElementById("chat-input-box").classList.add("prompt-ready");
          }
          historyIdx = -1;
          document.getElementById("chat-input-box").classList.remove("history");
          document.getElementById("question-input").focus();
        }
        toggleSubMenuList();
      }
      return;
    }

    const promptBox = e.target.closest('.prompt');
    if (promptBox && e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      const question = e.target.closest('.question-element-gnc');
      sendQuestion(question);
      return;
    }

    if (promptBox && e.key === "Escape") {
      e.preventDefault();
      const question = e.target.closest('.question-element-gnc');
      question.remove();
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      var readyQuestion = document.getElementsByClassName("editRequired");
      if (readyQuestion.length > 0) {
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        const question = readyQuestion[readyQuestion.length - 1].closest(".question-element-gnc");
        sendQuestion(question);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      var replaceElems = document.getElementsByClassName("editRequired");
      for (var p of replaceElems) {
        p.remove();
      }
      vscode.postMessage({ type: 'stopGenerate' });
      document.getElementById("chat-input-box")?.classList?.remove("responsing");
      document.getElementById("question-input").disabled = false;
      return;
    }

    if (e.key === 'Control') {
      document.getElementById('qa-list').classList.add('ctrl-down');
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && e.key === "Process") || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // return;
    }
    document.getElementById("question-input").focus();
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      document.getElementById('qa-list').classList.remove('ctrl-down');
    }
    if (e.code === 'Slash') {
      if (document.getElementById("question-input").value === '、') {
        document.getElementById("question-sizer").dataset.value = '/';
        document.getElementById("question-input").value = '/';
      }
      if (document.getElementById("question-input").value === '？') {
        document.getElementById("question-sizer").dataset.value = '?';
        document.getElementById("question-input").value = '?';
      }
      toggleSubMenuList();
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add('hidden');
      e.target.innerHTML = "";
    }

    if (e.target.classList.contains("login-panel-tab")) {
      if (e.target.id === "tab-qrcode") {
        var qc = document.getElementById("qrcode");
        if (qc && qc.classList.contains("empty")) {
          vscode.postMessage({ type: "getQRCodeURL" });
        }
      } else {
        var qc = document.getElementById("qrcode");
        if (qc) {
          qc.classList.add("empty");
          qc.classList.remove("used");
        }
        vscode.postMessage({ type: 'revokeQRCode' });
      }
      return;
    }

    const qrCode = e.target.closest('#qrcode');
    if (qrCode && qrCode.classList.contains("empty")) {
      vscode.postMessage({ type: "getQRCodeURL" });
      return;
    }

    const targetButton = e.target.closest('button') || e.target.closest('vscode-button');
    let ts = new Date().valueOf();

    if (targetButton?.id !== "attach-button") {
      _toggleFileList([], false);
    }

    if (targetButton?.id === "login-phone-btn") {
      let nationCode = document.getElementById("login-phone-code")?.value;
      let phone = document.getElementById("login-phone-account").value;
      let password = document.getElementById("login-phone-password").value;
      vscode.postMessage({
        type: "login",
        value: {
          type: "phone",
          nationCode,
          phone,
          password
        }
      });
      return;
    }
    if (targetButton?.id === "login-email-btn") {
      let email = document.getElementById("login-email-account").value;
      let password = document.getElementById("login-email-password").value;
      vscode.postMessage({
        type: "login",
        value: {
          type: "email",
          email,
          password
        }
      });
      return;
    }

    if (targetButton?.id === "search-button") {
      sendSearchQuery(document.getElementById("question-input").value.slice(1).trim());
      return;
    }

    if (targetButton?.id === "attach-button") {
      vscode.postMessage({ type: 'selectFile', scope: "opened" });
      return;
    }

    if (targetButton?.id === "agent-tab-btn") {
      _toggleAgentList(true);
      document.getElementById("question-input").focus();
      return;
    }

    if (targetButton?.id === "agent-delete-btn") {
      document.getElementById("agent-indicator").classList.add("hidden");
      document.getElementById("agent-tab-btn").dataset.agent = ``;
      document.getElementById("question-input").focus();
      return;
    }

    if (targetButton?.id === "send-button") {
      var list = document.getElementById("ask-list");
      if (list.classList.contains("hidden")) {
        var prompt = document.getElementById("question-input").value.trim();
        if (prompt) {
          sendPrompt(prompt);
        } else {
          var readyQuestion = document.getElementsByClassName("editRequired");
          if (readyQuestion.length > 0) {
            document.getElementById("question-input").disabled = false;
            document.getElementById("question-input").focus();
            const question = readyQuestion[readyQuestion.length - 1].closest(".question-element-gnc");
            sendQuestion(question);
          }
        }
      } else {
        var activebtn = document.getElementById("ask-list").querySelectorAll("button.selected");
        activebtn[0].click();
      }
      return;
    }

    if (targetButton?.id === "stop-button") {
      vscode.postMessage({ type: 'stopGenerate' });
      return;
    }

    if (targetButton?.closest('#ask-list')) {
      var list1 = document.getElementById("ask-list");
      var btns = list1.querySelectorAll("button");
      btns.forEach((btn, _index) => {
        btn.classList.remove('selected');
      });
      targetButton.classList.add('selected');
      return;
    }

    if (e.target.id === "agent-manage") {
      vscode.postMessage({ type: "agentManage" });
      return;
    }

    if (e.target.id === "prompt-manage") {
      vscode.postMessage({ type: "promptManage" });
      return;
    }

    if (e.target.closest('.switch-org')) {
      vscode.postMessage({ type: "switchOrg" });
      return;
    }

    if (e.target.id === "logoutConfirm") {
      vscode.postMessage({ type: "logoutConfirm" });
      return;
    }

    if (e.target.id === "logout") {
      const modalShow = !document.getElementsByClassName("modal")[0].classList.contains("hidden");
      if (modalShow) {
        let msgBox = document.getElementsByClassName("modal")[0];
        msgBox.classList.add('hidden');
        msgBox.innerHTML = "";
      }
      vscode.postMessage({ type: "logout" });
      return;
    }

    if (e.target.id === 'candidates') {
      vscode.postMessage({ type: "candidates", value: (parseInt(e.target.dataset.value) + 1) % 4 });
      return;
    }

    if (targetButton?.id === "clearAll") {
      vscode.postMessage({ type: "clearAll" });
      document.getElementById("chat-input-box")?.classList?.remove("responsing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (targetButton?.classList?.contains("setOrgBtn")) {
      let msgBox = targetButton.closest(".modal");
      msgBox.classList.add('hidden');
      let orgCode = msgBox.querySelector(".orgnazitionSelectionRadio")?._value;
      msgBox.innerHTML = "";
      vscode.postMessage({ type: "setOrg", value: orgCode });
    }

    if (targetButton?.classList?.contains("closeModal")) {
      let msgBox = targetButton.closest(".modal");
      msgBox.classList.add('hidden');
      msgBox.innerHTML = "";
    }

    if (targetButton?.classList?.contains('delete-element-gnc')) {
      const id = targetButton.dataset.id;
      document.getElementById(`question-${id}`)?.remove();
      document.getElementById(id)?.remove();
      vscode.postMessage({ type: 'deleteQA', id: parseInt(id) });
      return;
    }

    if (targetButton?.classList?.contains('stopGenerate')) {
      vscode.postMessage({ type: 'stopGenerate', id: targetButton.dataset.id });
      return;
    }

    if (targetButton?.classList?.contains('continue-element-gnc')) {
      const id = targetButton.dataset.id;
      const respElem = document.getElementById(`${id}`);
      const chatText = document.getElementById(`response-${id}`);
      const progText = document.getElementById(`progress-${id}`);
      if (!respElem || !chatText) {
        return;
      }
      respElem.classList.remove("need-continue");
      chatText.classList.add("empty");
      progText?.classList.remove("started");
      vscode.postMessage({ type: "continueAnswer", id: parseInt(id) });
      return;
    }

    if (targetButton?.classList?.contains('like')) {
      const id = targetButton.dataset.id;
      const feedbackActions = targetButton.closest('.feedback');
      var dislike = feedbackActions.querySelectorAll(".dislike")[0];
      if (targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.remove("checked");
        vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "like-cancelled" });
      } else {
        dislike?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "like" });
      }
      return;
    }

    if (targetButton?.classList?.contains('dislike')) {
      const id = targetButton.dataset.id;
      const feedbackActions = targetButton.closest('.feedback');
      var like = feedbackActions.querySelectorAll(".like")[0];
      if (targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.remove("checked");
        vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "dislike-cancelled" });
      } else {
        like?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "dislike" });
      }
      return;
    }

    if (targetButton?.classList?.contains('bug') || targetButton?.classList?.contains('correct') || e.target.id === "report-issue") {
      const id = targetButton?.dataset?.id;
      vscode.postMessage({ type: 'bugReport', id: id ? parseInt(id) : undefined, ts });
      return;
    }

    if (targetButton?.classList?.contains('regenerate')) {
      let id = targetButton.dataset.id;
      e.preventDefault();
      // targetButton?.classList?.add("pointer-events-none");
      const question = document.getElementById(`question-${id}`);
      sendQuestion(question, id);
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "regenerate" });
      return;
    }

    if (targetButton?.classList?.contains("expend-code")) {
      e.preventDefault();
      const question = targetButton.closest(".question-element-gnc");
      const code = question.getElementsByClassName("pre-code-element");
      code[0].classList.toggle("fold");
      return;
    }

    if (targetButton?.classList?.contains("send-element-gnc")) {
      e.preventDefault();
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      const question = targetButton.closest(".question-element-gnc");
      let oldId = question.id.slice('question-'.length);
      sendQuestion(question, oldId);
      return;
    }

    if (targetButton?.id === "cancel-button") {
      e.preventDefault();
      const question = document.getElementsByClassName("editRequired");
      if (question && question[0]) {
        question[0].remove();
      }
      document.getElementById("question-input").disabled = false;
      return;
    }

    if (targetButton?.classList?.contains("cancel-element-gnc")) {
      e.preventDefault();
      const question = targetButton.closest(".question-element-gnc");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      question.remove();
      return;
    }

    if (targetButton?.classList?.contains("wrap-element-gnc")) {
      e.preventDefault();
      targetButton.parentElement?.parentElement?.lastElementChild.classList.toggle('whitespace-pre-wrap');
      return;
    }

    if (targetButton?.classList?.contains("fav-element-gnc")) {
      e.preventDefault();
      let id = targetButton?.dataset.id;
      var languageid = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({
        type: "addFavorite",
        id,
        languageid,
        code: targetButton.parentElement?.parentElement?.lastChild?.textContent,
      });
      return;
    }

    if (targetButton?.classList?.contains("mermaid-element-gnc")) {
      e.preventDefault();
      let id = targetButton.dataset.id;
      let preNode = targetButton.parentElement?.parentElement;
      let mermaidNode = preNode?.querySelector('.mermaid-ready');
      let codeNode = preNode?.lastChild;
      let code = codeNode?.textContent;
      if (mermaidNode) {
        mermaidNode.classList.toggle('hidden');
        if (!mermaidNode.classList.contains('hidden')) {
          targetButton.innerHTML = viewOffIcon;
          targetButton.title = l10nForUI["Hide graph"];
        } else {
          targetButton.innerHTML = viewIcon;
          targetButton.title = l10nForUI["Show graph"];
        }
        return;
      }
      if (code) {
        mermaid.render(`mermaid-${id}`, code)
          .then((graph) => {
            var graphContainer = document.createElement("div");
            graphContainer.classList.add('mermaid-ready');
            graphContainer.style.backgroundColor = '#FFF';
            graphContainer.style.padding = '1rem';
            graphContainer.style.lineHeight = 'initial';
            graphContainer.innerHTML = graph.svg;
            preNode.insertBefore(graphContainer, codeNode);
            targetButton.innerHTML = viewOffIcon;
            targetButton.title = l10nForUI["Hide graph"];
          }).catch(_err => {
            showInfoTip({ style: "error", category: "malformed-mermaid", id: new Date().valueOf(), value: "Malformed content" });
          });
      }
      return;
    }

    if (targetButton?.classList?.contains("code-element-gnc")) {
      e.preventDefault();
      let id = targetButton.dataset.id;
      let code = targetButton.parentElement?.parentElement?.lastChild?.textContent;
      var languageid = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "copy-snippet", args: { languageid, codeLines: code?.split("\n").length } });
      navigator.clipboard.writeText(targetButton.parentElement?.parentElement?.lastChild?.textContent).then(() => {
        targetButton.innerHTML = checkIcon;

        setTimeout(() => {
          targetButton.innerHTML = clipboardIcon;
        }, 1500);
      });

      return;
    }

    if (targetButton?.classList?.contains("request-id-element-gnc")) {
      e.preventDefault();
      let rid = targetButton.dataset["requestId"];
      navigator.clipboard.writeText(rid).then(() => {
        targetButton.innerHTML = checkIcon;

        setTimeout(() => {
          targetButton.innerHTML = requestIdIcon;
        }, 1500);
      });

      return;
    }

    if (targetButton?.classList?.contains("diff-element-gnc")) {
      e.preventDefault();
      let id = targetButton.dataset.id;
      var difflang = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "diff-code", args: { languageid: difflang } });
      vscode.postMessage({
        type: "diff",
        languageid: difflang,
        value: targetButton.parentElement?.parentElement?.lastChild?.textContent,
      });

      return;
    }

    if (targetButton?.classList?.contains("edit-element-gnc")) {
      e.preventDefault();
      let id = targetButton.dataset.id;
      let code= targetButton.parentElement?.parentElement?.lastChild?.textContent;
      var insertlang = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "insert-snippet", args: { languageid: insertlang, codeLines: code?.split("\n").length } });
      vscode.postMessage({
        type: "editCode",
        value: code,
      });

      // return;
    }

  });

  function sendSearchQuery(query) {
    var urls = document.getElementById("search-list").querySelectorAll('vscode-checkbox');
    var searchUrl = [];
    urls.forEach((ele, _idx, _arr) => {
      if (ele.checked) {
        searchUrl.push(ele.dataset.query);
      }
    });
    if (searchUrl.length > 0 && query) {
      vscode.postMessage({
        type: "searchQuery",
        query,
        searchUrl
      });
    }
  }
})();

