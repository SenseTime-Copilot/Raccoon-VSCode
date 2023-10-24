const vscode = acquireVsCodeApi();

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

  const aiIcon = `<div class="sensecode-avatar w-8 h-8"></div>`;
  const questionIcon = `<span class="material-symbols-rounded">live_help</span>`;
  const clipboardIcon = `<span class="material-symbols-rounded">content_paste</span>`;
  const checkIcon = `<span class="material-symbols-rounded">inventory</span>`;
  const cancelIcon = `<span class="material-symbols-rounded">close</span>`;
  const sendIcon = `<span class="material-symbols-rounded">send</span>`;
  const favIcon = `<span class="material-symbols-rounded">heart_plus</span>`;
  const diffIcon = `<span class="material-symbols-rounded">difference</span>`;
  const insertIcon = `<span class="material-symbols-rounded">keyboard_return</span>`;
  const wrapIcon = `<span class="material-symbols-rounded">wrap_text</span>`;
  const unfoldIcon = '<span class="material-symbols-rounded">expand</span>';
  const foldIcon = '<span class="material-symbols-rounded">compress</span>';

  var isComposing = false;
  var prompts = undefined;
  var history = [];
  var tipN = 0;

  document.getElementById("question-input").disabled = true;

  setTimeout(showTips, 8000);

  function scrollPositionAtBottom() {
    var a = document.getElementById('qa-list-wrapper').children[0].offsetHeight;
    var b = document.getElementById('qa-list-wrapper').children[0].scrollTop;
    var c = document.getElementById('qa-list-wrapper').children[0].children[0].offsetHeight;

    return a + b + 100 >= c;
  }

  function showTips() {
    var qs = document.getElementById(`question-sizer`);
    if (qs && qs.dataset[`tip${tipN}`]) {
      qs.dataset['tip'] = qs.dataset[`tip${tipN}`];
    } else {
      tipN = 0;
    }
    if (tipN === 0) {
      var al = document.getElementById("ask-list");
      if (al.classList?.contains("pin")) {
        qs.dataset['tip'] = qs.dataset[`placeholderShort`];
      } else {
        qs.dataset['tip'] = qs.dataset[`placeholder`];
      }
    }
    tipN++;
    setTimeout(showTips, 8000);
  }

  collectInfo = function (id, action) {
    var promptNode = document.getElementById(`prompt-${id}`);
    var valuesNode = document.getElementById(`values-${id}`);
    var responseNode = document.getElementById(`response-${id}`);
    var response = responseNode?.dataset?.response;
    var error = responseNode?.dataset?.error;
    var languageid;
    var code;
    if (valuesNode) {
      var v1 = valuesNode.getElementsByClassName("languageid-value");
      if (v1[0]) {
        languageid = v1[0].textContent;
      }
      var v2 = valuesNode.getElementsByClassName("code-value");
      if (v2[0]) {
        code = v2[0].textContent;
      }
    }
    return {
      request: {
        languageid,
        code,
        ...promptNode?.dataset
      },
      response: [response],
      error,
      action,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      generate_at: parseInt(id),
      // eslint-disable-next-line @typescript-eslint/naming-convention
      report_at: new Date().valueOf()
    };
  };

  function buildQuestion(username, avatar, timestamp, id, innerHTML, status) {
    let questionTitle = `<h2 class="avatar place-content-between mb-4 -mx-2 flex flex-row-reverse">
                              <span class="flex gap-2 flex flex-row-reverse text-xl">
                                ${avatar ? `<img src="${avatar}" class="w-8 h-8 rounded-full">` : questionIcon}
                                <span class="text-xs text-right" style="font-family: var(--vscode-editor-font-family);">
                                  <b class="text-sm">${username}</b>
                                  <div class="opacity-30 leading-3">
                                    ${timestamp}
                                  </div>
                                </span>
                              </span>
                              <div class="-mt-6 ml-1">
                                <button title="${l10nForUI["Delete"]}" class="delete-element-gnc border-none bg-transparent opacity-30 hover:opacity-100" data-id=${id}>${cancelIcon}</button>
                                <button title="${l10nForUI["Cancel"]} [Esc]" class="cancel-element-gnc  border-none bg-transparent opacity-30 hover:opacity-100">${cancelIcon}</button>
                              </div>
                            </h2>`;
    return `<div id="question-${id}" class="p-4 question-element-gnc w-full ${status}">
             ${questionTitle}
             ${innerHTML}
             <div class="send-btns flex justify-end mt-4" style="color: var(--panel-tab-foreground);"><vscode-button tabindex="0" class="send-element-gnc text-base rounded" title="${l10nForUI["Send"]} [Enter]">${sendIcon}</vscode-button></div>
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

  function wrapCode(cont) {
    if (cont.split("```").length % 2 !== 1) {
      cont = cont + "\n```";
    }
    return cont;
  }

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    const list = document.getElementById("qa-list");

    switch (message.type) {
      case 'focus': {
        document.getElementById('settings')?.remove();
        document.getElementById("question-input").focus();
        document.getElementById('question').classList.remove('flash');
        void document.getElementById('question').offsetHeight;
        document.getElementById('question').classList.add('flash');
        break;
      }
      case 'clear': {
        document.getElementById("chat-button-wrapper")?.classList?.remove("responsing");
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        vscode.postMessage({ type: 'flushLog', action: "delete" });
        list.innerHTML = "";
        break;
      }
      case 'restoreFromCache': {
        for (let item of message.value) {
          if (item.type === 'question') {
            const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(item.value)), "text/html");
            const preCodeList = markedResponse.querySelectorAll("pre > code");

            preCodeList.forEach((preCode, index) => {
              preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col", "fold", "mt-4");
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

              // Create fold button
              const foldButton = document.createElement("button");
              foldButton.dataset.id = item.id;
              foldButton.innerHTML = foldIcon;
              foldButton.classList.add("fold-btn", "expend-code", "rounded", "hidden");

              // Create unfold button
              const unfoldButton = document.createElement("button");
              unfoldButton.dataset.id = item.id;
              unfoldButton.innerHTML = unfoldIcon;
              unfoldButton.classList.add("unfold-btn", "expend-code", "rounded");

              buttonWrapper.append(wrapButton, unfoldButton, foldButton);

              preCode.parentElement.prepend(buttonWrapper);
            });
            let labelInstruction = '';
            if (item.instruction) {
              labelInstruction = `<p class="instruction-label">${item.instruction.replace("...", "")}</p>`;
            }
            let html = `<div id="prompt-${item.id}" class="prompt markdown-body pb-2 leading-loose w-full">${labelInstruction} ${markedResponse.documentElement.innerHTML}</div>`;
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
              fav.title = l10nForUI["Favorite"];
              fav.innerHTML = favIcon;

              fav.classList.add("fav-element-gnc", "rounded");

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
            list.innerHTML += `<div id="${item.id}" data-name="${item.name}" class="p-4 answer-element-gnc w-full">
                            <h2 class="avatar mt-1 mb-4 -mx-2 flex gap-1">
                              <span class="flex gap-2 flex text-xl">
                                ${aiIcon}
                                <span class="text-xs" style="font-family: var(--vscode-editor-font-family);">
                                  <b class="text-sm">${item.name}</b>
                                  <div class="response-ts opacity-30 leading-3">
                                    ${item.timestamp}
                                  </div>
                                </span>
                              </span>
                            </h2>
                            <div id="response-${item.id}" class="response flex flex-col gap-1 markdown-body">
                              ${markedResponse.documentElement.innerHTML}
                            </div>
                          </div>`;
          }
        }
        list.innerHTML += `<div class='history-seperator' data-text='↓ ${new Date().toLocaleString()} ↓'></div>`;
        list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        break;
      }
      case 'showInfoTip': {
        showInfoTip(message);
        break;
      }
      case 'codeReady': {
        var hint = document.getElementById("code-hint");
        if (message.value) {
          var hasTag = document.getElementById("question").classList.contains("code-ready");
          var sameFile = (message.file === hint.dataset['file']);
          var needAnimate = (hasTag && !sameFile);
          hint.dataset['file'] = message.file;
          if (needAnimate) {
            document.getElementById("question").classList.remove("code-ready");
            void document.getElementById("question").offsetHeight;
            setTimeout(() => {
              var btn = hint.getElementsByClassName("material-symbols-rounded")[0];
              btn.onclick = (_event) => {
                vscode.postMessage({ type: "openDoc", file: message.file, range: message.range });
              };
              document.getElementById("question").classList.add("code-ready");
            }, 300);
          } else {
            var btn = hint.getElementsByClassName("material-symbols-rounded")[0];
            btn.onclick = (_event) => {
              vscode.postMessage({ type: "openDoc", file: message.file, range: message.range });
            };
            document.getElementById("question").classList.add("code-ready");
          }
        } else {
          document.getElementById("question").classList.remove("code-ready");
          hint.dataset['file'] = undefined;
          var btn1 = hint.getElementsByClassName("material-symbols-rounded")[0];
          btn1.onclick = undefined;
        }
        break;
      }
      case "updateSettingPage": {
        var settings = document.getElementById('settings');
        if (message.action === "close" || (message.action === "toogle" && settings)) {
          settings?.remove();
          document.getElementById("question-input").focus();
          break;
        }
        if (message.action === "open" || message.action === "toogle" || settings) {
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
            } else {
              console.log(message.value);
            }
          }
        }
        break;
      }
      case "promptList": {
        prompts = message.value;
        var shortcuts = '<div class="toolbar w-full text-end p-1"><vscode-link href="command:workbench.action.openGlobalSettings?%7B%22query%22%3A%22SenseCode.Prompt%22%7D"><span class="material-symbols-rounded">add</span></vscode-link><vscode-link id="pin-ask-list-btn"><span class="material-symbols-rounded" id="pin-ask-list">push_pin</span></vscode-link></div>';
        for (var p of prompts) {
          let icon = p.icon || "smart_button";
          shortcuts += `  <button class="flex gap-2 items-center"
                                 ${p.shortcut ? `data-shortcut='/${p.shortcut}'` : ""}
                                        onclick='vscode.postMessage({
                                            type: "sendQuestion",
                                            prompt: ${JSON.stringify(p)}
                                        });
                          '>
                            <span class="material-symbols-rounded">${icon}</span>
                            ${p.label}
                            ${p.shortcut ? `<span class="shortcut grow text-right" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.shortcut}></span>` : ""}
                          </button>
                      `;
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

        if (promptInfo.status === "editRequired") {
          document.getElementById("chat-button-wrapper")?.classList?.add("editing");
          document.getElementById("question-input").disabled = true;
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
          break;
        } else {
          updateHistory(promptInfo.prompt);
          document.getElementById("chat-button-wrapper")?.classList?.add("responsing");
          document.getElementById("question-input").disabled = true;
          var chat = document.getElementById(`${id}`);
          if (!chat) {
            chat = document.createElement("div");
            chat.id = `${id}`;
            chat.dataset['name'] = message.robot;
            chat.classList.add("p-4", "answer-element-gnc", "w-full", "responsing");
            let progress = `<div id="progress-${id}" class="progress pt-6 flex justify-between items-center">
                      <span class="flex gap-1 opacity-30 items-center">
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
                      <button class="stopGenerate flex" data-id=${id}>
                        <span class="material-symbols-rounded">
                          stop_circle
                        </span>
                        <p class="mx-1">${l10nForUI["Stop responding"]}</p>
                      </button>
                    </div>`;
            if (message.streaming === true) {
              progress = `
            <div id="progress-${id}" class="progress pt-6 flex justify-between items-center">
              <span class="flex gap-1 opacity-30 items-center">
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
              <button class="stopGenerate flex items-stretch" data-id=${id}>
                <span class="material-symbols-rounded">
                  stop_circle
                </span>
                <p class="mx-1">${l10nForUI["Stop responding"]}</p>
              </button>
            </div>`;
            }
            chat.innerHTML = `  <h2 class="avatar mt-1 mb-4 -mx-2 flex gap-1">
                                    <span class="flex gap-2 flex text-xl">
                                      ${aiIcon}
                                      <span class="text-xs" style="font-family: var(--vscode-editor-font-family);">
                                        <b class="text-sm">${message.robot}</b>
                                        <div class="response-ts opacity-30 leading-3">
                                          <span class="material-symbols-rounded">
                                            more_horiz
                                          </span>
                                        </div>
                                      </span>
                                    </span>
                                  </h2>
                                  <div id="response-${id}" class="response empty flex flex-col gap-1 markdown-body"></div>
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
                                          sentiment_dissatisfied
                                        </span>
                                      </button>
                                    </span>
                                    <span class="flex items-center gap-2">
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
        if (chatText.classList.contains("empty")) {
          document.getElementById(`feedback-${message.id}`)?.classList?.add("empty");
        }
        if (!chatText.dataset.response || chatText.dataset.error) {
          break;
        }
        const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(chatText.dataset.response)), "text/html");
        // chatText.dataset.response = undefined;
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

          const fav = document.createElement("button");
          fav.dataset.id = message.id;
          fav.title = l10nForUI["Favorite"];
          fav.innerHTML = favIcon;

          fav.classList.add("fav-element-gnc", "rounded");

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

          preCode.parentElement.prepend(buttonWrapper);
        });
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        //chatText.classList.add("markdown-body");
        if (scrollPositionAtBottom()) {
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        }
        if (message.byUser === true) {
          vscode.postMessage({ type: 'telemetry', info: collectInfo(message.id, "stopped-by-user") });
        } else {
          var info = collectInfo(message.id, "");
          let r = document.getElementById(`${message.id}`);
          let name = r.dataset['name'];
          let rts = r?.getElementsByClassName("response-ts");
          let ts = '';
          if (rts && rts[0]) {
            ts = rts[0].textContent;
          }
          if (info.response[0]) {
            vscode.postMessage({ type: 'flushLog', action: "answer", id: message.id, name, ts, value: info.response[0] });
          } else if (info.error) {
            vscode.postMessage({ type: 'flushLog', action: "error", id: message.id, name, ts, value: info.error });
          }
        }
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

        list.innerHTML += `<div class="p-4 w-full message-element-gnc ${message.category || ""}">
                            <h2 class="avatar mt-1 mb-4 -mx-2 flex gap-1">
                              <span class="flex gap-2 flex text-xl">
                                ${aiIcon}
                                <span class="text-xs" style="font-family: var(--vscode-editor-font-family);">
                                  <b class="text-sm">${message.robot}</b>
                                  <div class="opacity-30 leading-3">
                                    ${message.timestamp}
                                  </div>
                                </span>
                              </span>
                            </h2>
                            <div class="markdown-body">
                              ${message.value}
                            </div>
                          </div>`;
        if (scrollPositionAtBottom()) {
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        }
        break;
      }
      case "addResponse": {
        const chatText = document.getElementById(`response-${message.id}`);
        if (!chatText) {
          break;
        }
        if (chatText.classList.contains("empty")) {
          if (message.timestamp) {
            let r = document.getElementById(`${message.id}`);
            let rts = r?.getElementsByClassName("response-ts");
            if (rts && rts[0]) {
              rts[0].textContent = message.timestamp;
            }
          }
          chatText.classList.remove("empty");
        }
        const progText = document.getElementById(`progress-${message.id}`);
        progText?.classList.add("started");
        chatText.dataset.response = (chatText.dataset.response || "") + message.value;
        const markedResponse = new DOMParser().parseFromString(marked.parse(wrapCode(chatText.dataset.response)), "text/html");
        const preCodeList = markedResponse.querySelectorAll("pre > code");
        preCodeList.forEach((preCode, _index) => {
          preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");
        });
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        if (scrollPositionAtBottom()) {
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        }
        break;
      }
      case "addError":
        if (!list.innerHTML) {
          return;
        }
        const chatText = document.getElementById(`response-${message.id}`);
        if (chatText?.classList.contains("empty")) {
          if (message.timestamp) {
            let r = document.getElementById(`${message.id}`);
            let rts = r?.getElementsByClassName("response-ts");
            if (rts && rts[0]) {
              rts[0].textContent = message.timestamp;
            }
          }
        }
        updateChatBoxStatus("stop", message.id);
        document.getElementById(`feedback-${message.id}`)?.classList.add("error");
        if (!chatText) {
          break;
        }
        chatText.dataset.error = message.error;
        chatText.innerHTML = chatText.innerHTML + `<div class="errorMsg rounded flex items-center">
                                        <span class="material-symbols-rounded text-3xl p-2">report</span>
                                        <div class="grow py-4">
                                            <div>An error occurred</div>
                                            <div>${message.error}</div>
                                        </div>
                                        <button class="bug rounded border-0 mx-4 opacity-80 focus:outline-none" data-id=${message.id}>
                                          <span class="material-symbols-rounded">
                                            bug_report
                                          </span>
                                        </button>
                                    </div>`;
        if ((window.innerHeight + Math.round(window.scrollY)) >= document.body.offsetHeight) {
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        }
        break;
      default:
        break;
    }
  });

  vscode.postMessage({ type: "welcome" });
  vscode.postMessage({ type: "listPrompt" });

  const sendQuestion = (question, replace) => {
    const prompt = question.getElementsByClassName("prompt");
    if (prompt && prompt[0]) {
      var values = {};
      var promptTemp = { ...prompt[0].dataset };
      promptTemp.message = { role: 'user', content: prompt[0].dataset['prompt'] };
      const valuesEle = prompt[0].getElementsByClassName("values");
      if (valuesEle && valuesEle[0]) {
        promptTemp.languageid = valuesEle[0].getElementsByClassName("languageid-value")[0].textContent;
        promptTemp.code = valuesEle[0].getElementsByClassName("code-value")[0].textContent;
        values = { ...valuesEle[0].dataset };
      }

      if (replace) {
        document.getElementById(`question-${replace}`)?.remove();
        document.getElementById(replace)?.remove();
      }

      vscode.postMessage({
        type: "sendQuestion",
        history: collectHistory(),
        prompt: promptTemp,
        values
      });
    } else {
      showInfoTip({ style: "error", category: "no-prompt", id: new Date().valueOf(), value: l10nForUI["Empty prompt"] });
    }
  };

  function updateHistory(prompt) {
    if (prompt.type === 'free chat') {
      let item = prompt.message.content;
      item = item.replace("{code}", "");
      history = [item.trim(), ...history];
    }
  }

  function collectHistory() {
    let historyList = [];
    const list = document.getElementById("qa-list");
    let qlist = list.querySelectorAll(".question-element-gnc");
    qlist.forEach((q, _idx, _arr) => {
      let p = undefined;
      let r = undefined;

      const prompt = q.getElementsByClassName("prompt");
      const values = prompt[0].getElementsByClassName("values");
      const languageid = values[0]?.getElementsByClassName("languageid-value")[0]?.textContent || "";
      const code = values[0]?.getElementsByClassName("code-value")[0]?.textContent || "";
      p = prompt[0].dataset.prompt;
      if (p) {
        p = p.replace("{code}", `\n\`\`\`${languageid}\n${code}\n\`\`\``);
      }
      const answer = q.nextElementSibling;
      if (answer && answer.classList?.contains("answer-element-gnc")) {
        const rs = answer.getElementsByClassName("response");
        if (rs && rs[0] && rs[0].dataset.response) {
          r = `${rs[0].dataset.response.trim()}`;
        }
      }
      if (p && r) {
        historyList.push({
          question: p,
          answer: r
        });
      }
    });
    return historyList;
  }

  function updateChatBoxStatus(status, id) {
    if (status === "stop") {
      document.getElementById(`question-${id}`)?.classList.remove("responsing");
      document.getElementById(id)?.classList.remove("responsing");
      document.getElementById(`progress-${id}`)?.classList?.add("hidden");
      document.getElementById(`feedback-${id}`)?.classList?.remove("hidden");
      document.getElementById("chat-button-wrapper")?.classList?.remove("responsing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
    }
    if (status === "start") {
      document.getElementById('settings')?.remove();
      document.getElementById("ask-list").classList.add("hidden");
      document.getElementById("search-list").classList.add("hidden");
      document.getElementById("question-input").value = "";
      document.getElementById("question-sizer").dataset.value = "";
      document.getElementById("question").classList.remove("history");
    }
  }

  function _toggleAskList() {
    var q = document.getElementById('question-input');
    if (q.value) {
      document.getElementById("question").classList.add("prompt-ready");
    } else {
      document.getElementById("question").classList.remove("prompt-ready");
    }
    var list = document.getElementById("ask-list");
    if (q.value.startsWith('/')) {
      let allAction = list.querySelectorAll("button");
      allAction.forEach((btn, _index) => {
        btn.classList.add('hidden');
      });
      var btns = Array.from(list.querySelectorAll("button")).filter((sc, _i, _arr) => {
        return q.value === '/' || sc.dataset.shortcut?.startsWith(q.value);
      });
      if (btns.length > 0) {
        list.classList.remove("hidden");
        btns.forEach((btn, _index) => {
          var sc = btn.querySelector('.shortcut');
          if (sc) {
            sc.textContent = q.value.slice(1);
            sc.dataset.suffix = btn.dataset.shortcut.slice(q.value.length);
          }
          btn.classList.remove('hidden');
          btn.classList.remove('selected');
        });
        btns[0].classList.add('selected');
      } else {
        list.classList.add("hidden");
      }
    } else {
      list.classList.add("hidden");
    }
  }

  function _toggleSearchList() {
    var q = document.getElementById('question-input');
    var list = document.getElementById("search-list");
    if (q.value.startsWith('?') || q.value.startsWith('？')) {
      document.getElementById("question").classList.add("search");
      //list.classList.remove("hidden");
    } else {
      document.getElementById("question").classList.remove("search");
      var urls = list.querySelectorAll("vscode-checkbox");
      for (let i = 0; i < urls.length; i++) {
        urls[i].classList.remove("selected");
      }
      list.classList.add("hidden");
    }
  }

  function toggleSubMenuList() {
    _toggleAskList();
    _toggleSearchList();
  }

  document.addEventListener("change", (e) => {
    if (e.target.id === "question-input") {
      toggleSubMenuList();
    } else if (e.target.id === "triggerModeRadio") {
      vscode.postMessage({ type: "triggerMode", value: e.target._value });
    } else if (e.target.id === "candidateNumberRadio") {
      vscode.postMessage({ type: "candidates", value: parseInt(e.target._value) });
    } else if (e.target.id === "completionPreferenceRadio") {
      vscode.postMessage({ type: "completionPreference", value: e.target._value });
    } else if (e.target.id === "responseModeRadio") {
      vscode.postMessage({ type: "responseMode", value: e.target._value });
    } else if (e.target.id === "engineDropdown") {
      vscode.postMessage({ type: "activeEngine", value: e.target._value });
    } else if (e.target.id === "privacy") {
      vscode.postMessage({ type: "privacy", value: e.target._checked });
    } else {
    }
  });

  document.getElementById("question").addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  document.getElementById("question").addEventListener("drop", (event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    document.getElementById("question-input").value = data;
    document.getElementById("question-sizer").dataset.value = data;
    toggleSubMenuList();
  });

  document.getElementById("question-input").addEventListener("input", () => {
    toggleSubMenuList();
  });

  var historyIdx = -1;
  document.getElementById("question-input").addEventListener("blur", () => {
    historyIdx = -1;
  });

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
    var list = document.getElementById("ask-list");
    var search = document.getElementById("search-list");
    if (!list.classList.contains("hidden") && !document.getElementById("question").classList.contains("history")) {
      var btns = Array.from(list.querySelectorAll("button")).filter((b, _i, _a) => {
        return !b.classList.contains('hidden');
      });
      if (e.key === "Enter") {
        e.preventDefault();
        for (let i = 0; i < btns.length; i++) {
          if (!list.classList.contains("pin") && btns[i].classList.contains('selected')) {
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
      }
      return;
    } else if (!search.classList.contains("hidden") && !document.getElementById("question").classList.contains("history")) {
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
    }
    if (e.target.id === "question-input") {
      if (e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        return;
      }
      var composing = e.isComposing || isComposing;
      if (!composing && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (!e.target.value.trim()) {
          return;
        }
        if (document.getElementById("question").classList.contains("search")) {
          sendSearchQuery(e.target.value.slice(1).trim());
        } else {
          vscode.postMessage({
            type: "sendQuestion",
            prompt: {
              label: "",
              type: "free chat",
              message: { role: 'user', content: e.target.value }
            },
            history: collectHistory()
          });
        }
      } else if (e.key === "ArrowDown" && document.getElementById("question").classList.contains("history")) {
        e.preventDefault();
        if (historyIdx > 0) {
          historyIdx--;
          e.target.value = history[historyIdx];
          document.getElementById("question").classList.add("history");
          if (e.target.value.startsWith('?') || e.target.value.startsWith('？')) {
            document.getElementById("question").classList.add("search");
          } else {
            document.getElementById("question").classList.remove("search");
          }
        } else {
          historyIdx = -1;
          e.target.value = "";
          document.getElementById("question").classList.remove("prompt-ready");
          document.getElementById("question").classList.remove("history");
          document.getElementById("question").classList.remove("search");
        }
        document.getElementById("question-sizer").dataset.value = e.target.value;
        toggleSubMenuList();
      } else if (e.key === "ArrowUp" && (historyIdx >= 0 || !document.getElementById("question-sizer").dataset.value)) {
        e.preventDefault();
        if (historyIdx < history.length - 1) {
          historyIdx++;
          e.target.value = history[historyIdx];
          document.getElementById("question").classList.add("history");
          document.getElementById("question-sizer").dataset.value = e.target.value;
          if (e.target.value.startsWith('?') || e.target.value.startsWith('？')) {
            document.getElementById("question").classList.add("search");
          } else {
            document.getElementById("question").classList.remove("search");
          }
          toggleSubMenuList();
        }
      } else {
        if (document.getElementById("question").classList.contains("history")) {
          if (e.key !== "Tab") {
            e.target.value = "";
            document.getElementById("question-sizer").dataset.value = "";
            document.getElementById("question").classList.remove("search");
          } else {
            e.preventDefault();
            document.getElementById("question").classList.add("prompt-ready");
          }
          historyIdx = -1;
          document.getElementById("question").classList.remove("history");
          document.getElementById("question-input").focus();
        }
        toggleSubMenuList();
      }
      return;
    }

    const promptBox = e.target.closest('.prompt');
    if (promptBox && e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
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
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      var readyQuestion = document.getElementsByClassName("editRequired");
      if (readyQuestion.length > 0) {
        document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
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
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing", "responsing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // return;
    }
    document.getElementById("question-input").focus();
  });

  document.addEventListener("click", (e) => {
    const targetButton = e.target.closest('button') || e.target.closest('vscode-button');

    if (targetButton?.id === "search-button") {
      sendSearchQuery(document.getElementById("question-input").value.slice(1).trim());
      return;
    }

    if (targetButton?.id === "send-button") {
      var list = document.getElementById("ask-list");
      if (list.classList.contains("hidden")) {
        var prompt = document.getElementById("question-input").value.trim();
        if (prompt) {
          vscode.postMessage({
            type: "sendQuestion",
            prompt: {
              label: "",
              type: "free chat",
              message: { role: 'user', content: prompt }
            },
            history: collectHistory()
          });
        } else {
          var readyQuestion = document.getElementsByClassName("editRequired");
          if (readyQuestion.length > 0) {
            document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
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
    if (e.target.id === "pin-ask-list") {
      document.getElementById("ask-list").classList.toggle("pin");
      document.getElementById("question-input").focus();
    }

    if (e.target.id === "logout") {
      vscode.postMessage({ type: "logout" });
      return;
    }

    if (e.target.id === "triggerDelayShort") {
      document.getElementById("triggerDelayShortBtn").classList.add("hidden");
      document.getElementById("triggerDelayLongBtn").classList.remove("hidden");
      vscode.postMessage({ type: "delay", value: 3 });
      return;
    }

    if (e.target.id === "triggerDelayLong") {
      document.getElementById("triggerDelayShortBtn").classList.remove("hidden");
      document.getElementById("triggerDelayLongBtn").classList.add("hidden");
      vscode.postMessage({ type: "delay", value: 1 });
      return;
    }

    if (e.target.id === 'candidates') {
      vscode.postMessage({ type: "candidates", value: (parseInt(e.target.dataset.value) + 1) % 4 });
      return;
    }

    if (e.target.id === 'tokenPropensity') {
      vscode.postMessage({ type: "tokenPropensity", value: (parseInt(e.target.dataset.value) + 20) % 100 });
      return;
    }

    if (e.target.id === "clearCacheFiles") {
      vscode.postMessage({ type: "clearCacheFiles" });
      return;
    }

    if (e.target.id === "manageFavorites") {
      vscode.postMessage({ type: "manageFavorites" });
      return;
    }    

    if (targetButton?.id === "clearAll") {
      vscode.postMessage({ type: "clearAll" });
      document.getElementById("chat-button-wrapper")?.classList?.remove("responsing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (targetButton?.classList?.contains('delete-element-gnc')) {
      const id = targetButton.dataset.id;
      document.getElementById(`question-${id}`)?.remove();
      document.getElementById(id)?.remove();
      vscode.postMessage({ type: 'flushLog', action: "delete", id: parseInt(id) });
      return;
    }

    if (targetButton?.classList?.contains('stopGenerate')) {
      vscode.postMessage({ type: 'stopGenerate', id: targetButton.dataset.id });
      return;
    }

    if (targetButton?.classList?.contains('like')) {
      const feedbackActions = targetButton.closest('.feedback');
      var dislike = feedbackActions.querySelectorAll(".dislike")[0];
      if (targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.remove("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "like-cancelled") });
      } else {
        dislike?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "like") });
      }
      return;
    }

    if (targetButton?.classList?.contains('dislike')) {
      const feedbackActions = targetButton.closest('.feedback');
      var like = feedbackActions.querySelectorAll(".like")[0];
      if (targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.remove("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "dislike-cancelled") });
      } else {
        like?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "dislike") });
      }
      return;
    }

    if (targetButton?.classList?.contains('correct')) {
      vscode.postMessage({ type: 'correct', info: collectInfo(targetButton?.dataset.id) });
      return;
    }

    if (targetButton?.classList?.contains('bug') || e.target.id === "report-issue") {
      vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "bug-report") });
      return;
    }

    if (targetButton?.classList?.contains('regenerate')) {
      let id = targetButton?.dataset.id;
      e.preventDefault();
      // targetButton?.classList?.add("pointer-events-none");
      const question = document.getElementById(`question-${id}`);
      sendQuestion(question, id);
      vscode.postMessage({ type: 'telemetry', info: collectInfo(id, "regenerate") });
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
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      const question = targetButton.closest(".question-element-gnc");
      sendQuestion(question);
      return;
    }

    if (targetButton?.classList?.contains("cancel-element-gnc")) {
      e.preventDefault();
      const question = targetButton.closest(".question-element-gnc");
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
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

    if (targetButton?.classList?.contains("code-element-gnc")) {
      e.preventDefault();
      vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "copy-snippet") });
      navigator.clipboard.writeText(targetButton.parentElement?.parentElement?.lastChild?.textContent).then(() => {
        targetButton.innerHTML = checkIcon;

        setTimeout(() => {
          targetButton.innerHTML = clipboardIcon;
        }, 1500);
      });

      return;
    }

    if (targetButton?.classList?.contains("diff-element-gnc")) {
      e.preventDefault();
      let id = targetButton?.dataset.id;
      vscode.postMessage({ type: 'telemetry', info: collectInfo(id, "diff-code") });
      var valuesNode = document.getElementById(`values-${id}`);
      var lang;
      var origin;
      if (valuesNode) {
        var v1 = valuesNode.getElementsByClassName("languageid-value");
        if (v1[0]) {
          lang = v1[0].textContent;
        }
        var v2 = valuesNode.getElementsByClassName("code-value");
        if (v2[0]) {
          origin = v2[0].textContent;
        }
      }
      vscode.postMessage({
        type: "diff",
        languageid: lang,
        origin,
        value: targetButton.parentElement?.parentElement?.lastChild?.textContent,
      });

      return;
    }

    if (targetButton?.classList?.contains("edit-element-gnc")) {
      e.preventDefault();
      vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "insert-snippet") });
      vscode.postMessage({
        type: "editCode",
        value: targetButton.parentElement?.parentElement?.lastChild?.textContent,
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

