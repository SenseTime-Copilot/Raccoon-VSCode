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

  const aiIcon = `<div class="robot-avatar w-8 h-8"></div>`;
  const questionIcon = `<span class="material-symbols-rounded w-8 h-8 text-center">live_help</span>`;
  const clipboardIcon = `<span class="material-symbols-rounded">content_paste</span>`;
  const checkIcon = `<span class="material-symbols-rounded">inventory</span>`;
  const cancelIcon = `<span class="material-symbols-rounded">close</span>`;
  const sendIcon = `<span class="material-symbols-rounded">send</span>`;
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
                                    ${timestamp}
                                  </div>
                                </span>
                              </span>
                              <div class="-mt-6 ml-1">
                                <button title="${l10nForUI["Delete"]}" class="delete-element-gnc border-none bg-transparent opacity-60 hover:opacity-100" data-id=${id}>${cancelIcon}</button>
                                <button title="${l10nForUI["Cancel"]} [Esc]" class="cancel-element-gnc  border-none bg-transparent opacity-60 hover:opacity-100">${cancelIcon}</button>
                              </div>
                            </h2>`;
    return `<div id="question-${id}" class="p-4 question-element-gnc ${status}">
             ${questionTitle}
             ${innerHTML}
             <div class="send-btns flex justify-end mt-4" style="color: var(--panel-tab-foreground);"><vscode-button tabindex="0" class="send-element-gnc text-base rounded" title="${l10nForUI["Send"]} [Ctrl+Enter]">${sendIcon}</vscode-button></div>
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
            lasttimestamps.get(id, ts);
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

  document.getElementById('question-input').addEventListener("focus", (_e) => {
    var acc = document.getElementById("attach-code-container");
    if (acc && acc.classList.contains('with-code')) {
      acc.classList.remove('hidden');
    }
  });

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
        list.innerHTML = "";
        break;
      }
      case 'restoreFromCache': {
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
            let labelInstruction = '';
            if (item.instruction) {
              labelInstruction = `<p class="instruction-label font-bold pl-1 pr-2"><span class="material-symbols-rounded align-text-bottom">auto_fix_normal</span>${item.instruction.replace("...", "")}</p>`;
            }
            let html = `<div id="prompt-${item.id}" class="prompt markdown-body pb-2">${labelInstruction}${markedResponse.documentElement.innerHTML}</div>`;
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
            list.innerHTML += `<div id="${item.id}" data-name="${item.name}" class="p-4 answer-element-gnc">
                            <h2 class="avatar mb-2 -ml-1 flex gap-1">
                              <span class="flex gap-2 flex text-xl items-center">
                                ${aiIcon}
                                <span class="flex flex-col gap-1 text-xs">
                                  <b>${item.name}</b>
                                  <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                    ${item.timestamp || `<span class="material-symbols-rounded">more_horiz</span>`}
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
        var acc = document.getElementById("attach-code-container");
        var ct = document.getElementById("code-title");
        var ac = document.getElementById("attach-code");
        if (message.value) {
          if (acc && ac && message.content) {
            acc.classList.add("with-code");
            acc.classList.remove('hidden');
            let fl = new URL(message.file);
            ct.innerHTML = '<span class="material-symbols-rounded" style="transform: rotate(90deg);">chevron_right</span>'
              + '<span class="grow whitespace-pre text-ellipsis overflow-hidden">' + fl.pathname.split('/').slice(-1) + '</span>'
              + '<span class="material-symbols-rounded" style="float: right">open_in_new</span>';
            ct.title = decodeURIComponent(fl.pathname);
            ct.onclick = (_event) => {
              vscode.postMessage({ type: "openDoc", file: message.file, range: message.range });
            };
            if (!hljs.getLanguage(message.lang)) {
              ac.innerHTML = hljs.highlightAuto(message.content).value;
            } else {
              ac.innerHTML = hljs.highlight(message.lang, message.content).value;
            }
          }
        } else {
          if (acc) {
            acc.classList.remove("with-code");
            acc.classList.add('hidden');
            ct.innerText = '';
            ct.title = '';
            ct.onclick = undefined;
            ac.innerHTML = '';
          }
        }
        break;
      }
      case "updateSettingPage": {
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
      case "agentList": {
        agents = message.value;
        var agentnames = '';
        agents.forEach((p, _id, _m) => {
          agentnames += `<button class="flex flex-row-reverse gap-2 items-center" data-shortcut='@${p.id}'
                                  onclick='vscode.postMessage({type: "addAgent", id: "${p.id}"});'
                          >
                            <span class="material-symbols-rounded">${p.icon || "badge"}</span>
                            ${p.label}
                            <span class="shortcut grow" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.id}></span>
                          </button>
                      `;
        });
        document.getElementById("agent-list").innerHTML = agentnames;
        _toggleAgentList();
        break;
      }
      case "addAgent": {
        document.getElementById("question-input").value = "@" + message.value + " ";
        document.getElementById("question-sizer").dataset.value = "@" + message.value + " ";
        _toggleAgentList();
        break;
      }
      case "promptList": {
        prompts = message.value;
        var shortcuts = '<div class="toolbar w-full text-end p-1"><vscode-link><span id="prompt-manage" class="material-symbols-rounded">edit_note</span></vscode-link><vscode-link id="pin-ask-list-btn"><span class="material-symbols-rounded" id="pin-ask-list">push_pin</span></vscode-link></div>';
        for (var p of prompts) {
          let icon = p.icon || "smart_button";
          shortcuts += `  <button class="flex flex-row-reverse gap-2 items-center"
                                 ${p.shortcut ? `data-shortcut='/${p.shortcut}'` : ""}
                                        onclick='vscode.postMessage({
                                            type: "sendQuestion",
                                            prompt: ${JSON.stringify(p)}
                                        });
                          '>
                            <span class="material-symbols-rounded">${icon}</span>
                            ${p.label}${p.inputRequired ? "..." : ""}
                            ${p.shortcut ? `<span class="shortcut grow" style="color: var(--progress-background); text-shadow: 0 0 1px var(--progress-background);" data-suffix=${p.shortcut}></span>` : ""}
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
        document.getElementById('question-input').blur();
        var c = document.getElementById("attach-code-container");
        if (c) {
          c.classList.add("hidden");
        }

        if (promptInfo.status === "editRequired") {
          document.getElementById("chat-button-wrapper")?.classList?.add("editing");
          document.getElementById("question-input").disabled = true;
          editCache.set(`${id}`, promptInfo.prompt);
          list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
          break;
        } else {
          updateHistory(promptInfo.prompt);
          document.getElementById("chat-button-wrapper")?.classList?.add("responsing");
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
            chat.innerHTML = `  <h2 class="avatar mb-2 -ml-1 flex gap-1">
                                    <span class="flex gap-2 flex text-xl items-center">
                                      ${aiIcon}
                                      <span class="flex flex-col gap-1 text-xs">
                                        <b>${message.robot}</b>
                                        <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                          <span class="material-symbols-rounded">
                                            more_horiz
                                          </span>
                                        </div>
                                      </span>
                                    </span>
                                  </h2>
                                  <div id="reference-${id}" class="reference flex gap-2 items-center"></div>
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

            vscode.postMessage({ type: 'telemetry', id: parseInt(message.id), ts: new Date().valueOf(), action: "code-generated", languageid: preCode.parentElement.dataset.lang });

            if (index !== preCodeList.length - 1) {
              preCode.parentElement.classList.add("mb-8");
            }

            const buttonWrapper = document.createElement("div");
            buttonWrapper.classList.add("code-actions-wrapper");

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

            preCode.parentElement.prepend(buttonWrapper);
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
      case "addMessage": {
        list.querySelectorAll(".progress-ring").forEach(elem => elem.remove());
        let lastElem = list.lastElementChild;
        if (lastElem && lastElem.classList.contains("message-element-gnc")) {
          if (lastElem.classList.contains(message.category)) {
            lastElem.remove();
          }
        } else {
        }

        list.innerHTML += `<div class="p-4 message-element-gnc ${message.category || ""}">
                            <h2 class="avatar mb-2 -ml-1 flex gap-1">
                              <span class="flex gap-2 flex text-xl items-center">
                                ${aiIcon}
                                <span class="flex flex-col gap-1 text-xs">
                                  <b>${message.robot}</b>
                                  <div class="message-ts opacity-60 text-[0.6rem] leading-[0.6rem]">
                                    ${message.timestamp}
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
              rts[0].textContent = message.timestamp;
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
      case 'reLogin': {
        if (!list.innerHTML) {
          return;
        }
        const chatText = document.getElementById(`response-${message.id}`);
        if (chatText?.classList.contains("empty")) {
          if (message.timestamp) {
            let r = document.getElementById(`${message.id}`);
            let rts = r?.getElementsByClassName("message-ts");
            if (rts && rts[0]) {
              rts[0].textContent = message.timestamp;
            }
          }
        }
        updateChatBoxStatus("relogin", message.id);
        if (!chatText) {
          break;
        }
        chatText.classList.add("error");
        chatText.innerHTML = chatText.innerHTML + `<div class="infoMsg rounded flex items-center">
                                        <span class="material-symbols-rounded text-3xl p-2">no_accounts</span>
                                        <div class="flex grow py-4">
                                          <div>${message.message}</div>
                                        </div>
                                    </div>`;
        list.lastChild?.scrollIntoView({ block: "end", inline: "nearest" });
        break;
      }
      case "addReference": {
        if (!list.innerHTML) {
          return;
        }
        const reference = document.getElementById(`reference-${message.id}`);
        if (reference) {
          reference.innerHTML = message.files.map((v) => {
            return `<vscode-tag class="opacity-50 max-w-full break-all"><span class="material-symbols-rounded">quick_reference_all</span><span class="align-middle">${decodeURIComponent(v)}</span></vscode-tag>`;
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
              rts[0].textContent = message.timestamp;
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
      var promptTemp = editCache.get(id);
      promptTemp.args = undefined;
      if (replace) {
        document.getElementById(`question-${replace}`)?.remove();
        document.getElementById(replace)?.remove();
      }

      vscode.postMessage({
        type: "sendQuestion",
        prompt: promptTemp,
        values
      });
      editCache.delete(id);
    } else {
      showInfoTip({ style: "error", category: "no-prompt", id: new Date().valueOf(), value: l10nForUI["Empty prompt"] });
    }
  };

  function updateHistory(prompt) {
    if (prompt.type === 'free chat') {
      let item = prompt.message.content;
      item = item.replaceAll("{{code}}", "");
      history = [item.trim(), ...history];
    }
  }

  function updateChatBoxStatus(status, id) {
    if (status === "stop" || status === "relogin") {
      document.getElementById(`question-${id}`)?.classList.remove("responsing");
      document.getElementById(id)?.classList.remove("responsing");
      document.getElementById(`progress-${id}`)?.classList?.add("hidden");
      if (status === "stop") {
        document.getElementById(`feedback-${id}`)?.classList?.remove("hidden");
      } else {
        document.getElementById(`feedback-${id}`)?.remove();
      }
      document.getElementById("chat-button-wrapper")?.classList?.remove("responsing");
      document.getElementById("question-input").disabled = false;
      //document.getElementById("question-input").focus();
    }
    if (status === "start") {
      document.getElementById('settings')?.remove();
      document.getElementById("agent-list").classList.add("hidden");
      document.getElementById("ask-list").classList.add("hidden");
      document.getElementById("search-list").classList.add("hidden");
      document.getElementById("question-input").value = "";
      document.getElementById("highlight-anchor").innerHTML = "";
      document.getElementById("question-sizer").dataset.value = "";
      document.getElementById("question").classList.remove("history");
    }
  }

  function _toggleAgentList() {
    var q = document.getElementById('question-input');
    if (q.value) {
      document.getElementById("question").classList.add("prompt-ready");
      document.getElementById("highlight-anchor").innerHTML = q.value.replace(/</g, '&lt;').replace(/\n$/g, '\n\n').replace(/(@\S+)/g, '<mark>$1</mark>');
    } else {
      document.getElementById("question").classList.remove("prompt-ready");
    }
    var list = document.getElementById("agent-list");
    if (q.value.startsWith('@')) {
      let allAction = list.querySelectorAll("button");
      allAction.forEach((btn, _index) => {
        btn.classList.add('hidden');
      });
      var btns = Array.from(list.querySelectorAll("button")).filter((sc, _i, _arr) => {
        return q.value === '@' || sc.dataset.shortcut?.startsWith(q.value);
      });
      if (btns.length > 0) {
        list.classList.remove("hidden");
        document.getElementById("question").classList.add("agent");
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
        document.getElementById("question").classList.remove("agent");
      }
    } else {
      list.classList.add("hidden");
      document.getElementById("question").classList.remove("agent");
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
        document.getElementById("question").classList.add("action");
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
        document.getElementById("question").classList.remove("action");
      }
    } else {
      list.classList.add("hidden");
      document.getElementById("question").classList.remove("action");
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
    _toggleAgentList();
    _toggleAskList();
    _toggleSearchList();
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

  document.addEventListener("input", (e) => {
    if (e.target.id === "login-account") {
      var pwd = document.getElementById("login-password");
      var loginBtn = document.getElementById("login");
      if (e.target.checkValidity() && pwd.checkValidity()) {
        loginBtn.classList.remove('disabled');
      } else {
        loginBtn.classList.add('disabled');
      }
    }
    if (e.target.id === "login-password") {
      var username = document.getElementById("login-account");
      var loginBtn1 = document.getElementById("login");
      if (e.target.checkValidity() && username.checkValidity()) {
        loginBtn1.classList.remove('disabled');
      } else {
        loginBtn1.classList.add('disabled');
      }
    }
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
    var agentList = document.getElementById("agent-list");
    var list = document.getElementById("ask-list");
    var search = document.getElementById("search-list");
    var settings = document.getElementById("settings");
    if (settings) {
      return;
    }
    const targetButton = e.target.closest('button') || e.target.closest('vscode-button');
    if (targetButton) {
      return;
    }
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
      } else {
        document.getElementById("question-input").focus();
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
    } else if (!agentList.classList.contains("hidden") && !document.getElementById("question").classList.contains("history")) {
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
            }
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
          document.getElementById("highlight-anchor").innerHTML = "";
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
    const targetButton = e.target.closest('button') || e.target.closest('vscode-button');
    let ts = new Date().valueOf();
    if (targetButton?.id === "login") {
      let code = document.getElementById("login-code")?.value;
      let account = document.getElementById("login-account").value;
      let password = document.getElementById("login-password").value;
      vscode.postMessage({
        type: "login",
        code,
        account,
        password
      });
      return;
    }

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
            }
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

    if (e.target.id === "prompt-manage") {
      vscode.postMessage({ type: "promptManage" });
      return;
    }

    if (e.target.id === "pin-ask-list") {
      document.getElementById("ask-list").classList.toggle("pin");
      document.getElementById("question-input").focus();
      return;
    }

    if (e.target.id === "switch-org") {
      vscode.postMessage({ type: "switch-org" });
      return;
    }

    if (e.target.id === "logout") {
      vscode.postMessage({ type: "logout" });
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
      vscode.postMessage({ type: 'deleteQA', id: parseInt(id) });
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
        vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "like-cancelled" });
      } else {
        dislike?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "like" });
      }
      return;
    }

    if (targetButton?.classList?.contains('dislike')) {
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
      vscode.postMessage({ type: 'bug-report', id: id ? parseInt(id) : undefined, ts });
      return;
    }

    if (targetButton?.classList?.contains('regenerate')) {
      let id = targetButton?.dataset.id;
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

    if (targetButton?.classList?.contains("mermaid-element-gnc")) {
      e.preventDefault();
      let id = targetButton?.dataset.id;
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
      var codelang = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "copy-snippet", codelang });
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
      var difflang = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "diff-code", difflang });
      vscode.postMessage({
        type: "diff",
        languageid: difflang,
        value: targetButton.parentElement?.parentElement?.lastChild?.textContent,
      });

      return;
    }

    if (targetButton?.classList?.contains("edit-element-gnc")) {
      e.preventDefault();
      let id = targetButton?.dataset.id;
      var insertlang = targetButton.parentElement?.parentElement?.dataset?.lang;
      vscode.postMessage({ type: 'telemetry', id: parseInt(id), ts, action: "insert-snippet", insertlang });
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

