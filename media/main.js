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

  const aiIcon = `<span class="material-symbols-rounded">assistant</span>`;
  const questionIcon = `<span class="material-symbols-rounded">live_help</span>`;
  const clipboardIcon = `<span class="material-symbols-rounded">content_paste</span>`;
  const checkIcon = `<span class="material-symbols-rounded">inventory</span>`;
  const cancelIcon = `<span class="material-symbols-rounded">close</span>`;
  const sendIcon = `<span class="material-symbols-rounded">send</span>`;
  const insertIcon = `<span class="material-symbols-rounded">keyboard_return</span>`;
  const wrapIcon = `<span class="material-symbols-rounded">wrap_text</span>`;
  const unfoldIcon = `<span class="material-symbols-rounded">expand</span>`;
  const foldIcon = `<span class="material-symbols-rounded">compress</span>`;

  var prompts = undefined;
  var history = [];

  document.getElementById("question-input").disabled = true;

  collectInfo = function (id, action) {
    var promptNode = document.getElementById(`prompt-${id}`);
    var responseNode = document.getElementById(`response-${id}`);
    var prompt = JSON.parse(promptNode.dataset.prompt);
    var code = decodeURIComponent(promptNode.dataset.code);
    var language = promptNode.dataset.lang;
    var response = responseNode.dataset.response;
    var error = responseNode.dataset.error;
    return {
      event: "response-feedback",
      request: {
        type: prompt.type, prompt: prompt.prompt, code, language
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

  addError = function (message) {
    var ew = document.getElementById('error-wrapper');
    if (ew.querySelector(`.${message.category}`)) {
      return;
    }
    ew.innerHTML += `<div class="error ${message.category}" id="error-${message.id}">${message.value}</div>`;
    setTimeout(() => {
      var err = document.getElementById(`error-${message.id}`);
      err.remove();
    }, 3000);
  };

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    const list = document.getElementById("qa-list");

    switch (message.type) {
      case 'showError': {
        addError(message);
        break;
      }
      case 'codeReady': {
        if (message.value) {
          document.getElementById("question").classList.add("code-ready");
        } else {
          document.getElementById("question").classList.remove("code-ready");
        }
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
          let ellip = "";
          let brush = p.brush || false;
          if (p.prompt.includes("${input")) {
            ellip = "...";
            brush = false;
          }
          shortcuts += `  <button class="flex gap-2 items-center ${brush ? "with-brush" : ""}"
                                        title='${p.type !== "custom" ? p.prompt + ": ${code}" : p.prompt}'
                                        onclick='vscode.postMessage({
                                            type: "prepareQuestion",
                                            value: ${JSON.stringify(p)}
                                        });
                          '>
                            <span class="material-symbols-rounded">${icon}</span>
                            ${p.label}${ellip}
                          </button>
                      `;
        }
        document.getElementById("ask-list").innerHTML = shortcuts;
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        break;
      }
      case "addSearch": {
        document.getElementById('settings')?.remove();
        document.getElementById("ask-list").classList.add("hidden");
        document.getElementById("question-input").value = "";
        document.getElementById("question-sizer").dataset.value = "";
        document.getElementById("question").classList.remove("history");
        toggleAskList();
        history = [message.value, ...history];
        break;
      }
      case "addQuestion": {
        document.getElementById('settings')?.remove();
        document.getElementById("ask-list").classList.add("hidden");
        document.getElementById("question-input").value = "";
        document.getElementById("question-sizer").dataset.value = "";
        document.getElementById("question").classList.remove("history");
        toggleAskList();
        var replaceElems = document.getElementsByClassName("replace");
        for (var e of replaceElems) {
          e.remove();
        }

        let id = message.id;
        let prompt = message.value;
        let code = message.code + "" || "";
        let lang = message.lang + "" || "";
        let progress = `<div id="progress-${id}" class="progress pt-6 flex justify-between items-center">
                    <span class="flex items-center gap-2 opacity-30">
                      <div class="spinner thinking">
                          <span class="material-symbols-rounded">autorenew</span>
                      </div>
                      <div class="thinking-text">${l10nForUI["Thinking..."]}</div>
                    </span>
                    <button class="stopGenerate flex items-center" data-id=${id}>
                      <span class="material-symbols-rounded">
                        stop_circle
                      </span>
                      <p class="mx-1">${l10nForUI["Stop responding"]}</p>
                    </button>
                  </div>`;
        const edit = !message.send;
        if (message.streaming === true) {
          progress = `
          <div id="progress-${id}" class="progress pt-6 flex justify-between items-center">
            <span class="flex items-center gap-2 opacity-30">
              <div class="spinner connecting">
                <span class="material-symbols-rounded">autorenew</span>
              </div>
              <div class="connecting-text">${l10nForUI["Connecting..."]}</div>
              <div class="spinner typing">
                <span class="material-symbols-rounded">magic_exchange</span>
              </div>
              <div class="typing-text">${l10nForUI["Typing..."]}</div>
            </span>
            <button class="stopGenerate flex items-center" data-id=${id}>
              <span class="material-symbols-rounded">
                stop_circle
              </span>
              <p class="mx-1">${l10nForUI["Stop responding"]}</p>
            </button>
          </div>`;
        }

        let prompthtml = prompt.prompt;
        if (prompt.prompt.includes("${input")) {
          prompthtml = prompthtml.replaceAll(/\${input(:([^}]*))?}/g, `<p class="editable inline-block mx-1 rounded w-fit" contenteditable="${edit}" data-placeholder="$2"></p>`);
        }

        let codeSnippet = "";
        if (code.trim()) {
          if (!lang) {
            let res = hljs.highlightAuto(code);
            if (res.language !== "vbnet" && res.relevance >= 5) {
              lang = res.language;
            }
          }
          const codehtml = new DOMParser().parseFromString(marked.parse("```" + lang + "\n" + code + "\n```"), "text/html");
          const preCodeList = codehtml.querySelectorAll("pre > code");
          preCodeList.forEach((preCode, _index) => {
            preCode.parentElement.dataset.lang = lang;
            preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");

            preCode.classList.add("inline", "whitespace-pre");
            const buttonWrapper = document.createElement("div");
            buttonWrapper.classList.add("code-actions-wrapper");

            let lines = code.split('\n');
            if (lines.length > 10) {
              // Create copy to clipboard button
              const unfoldButton = document.createElement("button");
              unfoldButton.innerHTML = unfoldIcon;
              unfoldButton.classList.add("unfold-btn", "expend-code", "rounded");
              const flodButton = document.createElement("button");
              flodButton.innerHTML = foldIcon;
              flodButton.classList.add("fold-btn", "expend-code", "rounded", "hidden");
              buttonWrapper.append(unfoldButton, flodButton);
              preCode.parentElement.classList.add("fold");
            }

            preCode.parentElement.prepend(buttonWrapper);
            codeSnippet = codehtml.documentElement.innerHTML;
          });
        }

        let actionBtns = `<div class="text-xs opacity-30" style="font-family: var(--vscode-editor-font-family); text-align: right;">${message.timestamp}</div>`;
        let sendBtn = ``;
        if (edit) {
          actionBtns = `<button title="${l10nForUI["Cancel"]}" class="cancel-element-gnc border-none bg-transparent -mt-8 -mr-2">${cancelIcon}</button>`;
          sendBtn = `<div class="flex mx-2 my-4 -mb-4 justify-end" style="color: var(--panel-tab-foreground);"><vscode-button tabindex="0" class="send-element-gnc text-base rounded" title="${l10nForUI["Send"]}">${sendIcon}</vscode-button></div>`;
        }

        let questionTitle = `<h2 class="avatar place-content-between mt-1 mb-4 flex">
                              <span class="capitalize flex gap-1 font-bold flex text-xl">
                                ${questionIcon} ${message.username || l10nForUI["Question"]}
                              </span>
                              ${actionBtns}
                            </h2>`;
        if (message.avatar && message.username) {
          questionTitle = `<h2 class="avatar place-content-between mt-1 mb-4 flex">
                            <span class="capitalize flex gap-1 font-bold flex text-xl">
                              <img src="${message.avatar}"/ class="w-8 rounded-full"> ${message.username}
                            </span>
                            ${actionBtns}
                          </h2>`;
        }

        list.innerHTML +=
          `<div id="question-${id}" class="p-4 pb-8 question-element-gnc w-full ${edit ? "replace" : ""}">
              ${questionTitle}
              <div id="prompt-${id}" class="prompt inline-block leading-loose py-2 w-full" data-prompt='${JSON.stringify(prompt)}' data-code="${encodeURIComponent(code)}" data-lang="${lang}">${prompthtml}</div>
              ${codeSnippet}
              ${sendBtn}
          </div>`;

        if (edit) {
          document.getElementById("chat-button-wrapper")?.classList?.add("editing");
          document.getElementById("question-input").disabled = true;
          var promptText = document.getElementById(`prompt-${id}`);
          const editableElems = promptText.getElementsByClassName("editable");
          Array.from(editableElems).reverse().forEach((el) => {
            el.setAttribute("contenteditable", true);
            el.focus();
          });
        } else {
          if (prompt.type === 'free chat') {
            history = [prompt.prompt, ...history];
          }
          document.getElementById("chat-button-wrapper")?.classList?.add("responsing");
          document.getElementById("question-input").disabled = true;
          var chat = document.getElementById(id);
          if (!chat) {
            chat = document.createElement("div");
            chat.id = id;
            chat.classList.add("p-4", "answer-element-gnc", "w-full");
            let outlang = lang;
            let exp = /Convert the given code to equivalent (.+) code/mg;
            let matches = exp.exec(prompt.prompt);
            if (matches) {
              outlang = matches[1];
            }
            chat.innerHTML = `  <h2 class="avatar font-bold mt-1 mb-4 flex flex-row-reverse text-xl gap-1">${aiIcon} ${l10nForUI["SenseCode"]}</h2>
                                        <div id="response-${id}" class="response empty flex flex-col gap-1 markdown-body" data-lang="${outlang}"></div>
                                        ${progress}
                                        <div id="feedback-${id}" class="feedback pt-6 flex justify-between items-center hidden">
                                          <span class="flex items-center gap-2">
                                            <button class="like flex rounded" data-id=${id}>
                                              <span class="material-symbols-rounded">
                                                thumb_up
                                              </span>
                                            </button>
                                            <button class="dislike flex rounded" data-id=${id}>
                                              <span class="material-symbols-rounded">
                                                thumb_down
                                              </span>
                                            </button>
                                            <button class="correct flex rounded" title="" data-id=${id}>
                                              <span class="material-symbols-rounded">
                                                sentiment_dissatisfied
                                              </span>
                                            </button>
                                          </span>
                                          <button class="regenerate flex items-center rounded" data-id=${id}>
                                            <span class="material-symbols-rounded">
                                              refresh
                                            </span>
                                            <p class="mx-1">${l10nForUI["Regenerate"]}</p>
                                          </button>
                                        </div>`;
            list.appendChild(chat);
          }
        }
        list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
        break;
      }
      case "stopResponse": {
        document.getElementById(`progress-${message.id}`)?.classList?.add("hidden");
        document.getElementById(`feedback-${message.id}`)?.classList?.remove("hidden");
        document.getElementById("chat-button-wrapper")?.classList?.remove("responsing");
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();

        const chatText = document.getElementById(`response-${message.id}`);
        if (chatText.classList.contains("empty")) {
          document.getElementById(`feedback-${message.id}`)?.classList?.add("empty");
        }
        if (!chatText.dataset.response) {
          break;
        }
        chatText.dataset.response = wrapCode(chatText.dataset.response, chatText.dataset.lang);
        const markedResponse = new DOMParser().parseFromString(marked.parse(chatText.dataset.response + "\n\n"), "text/html");
        // chatText.dataset.response = undefined;
        const preCodeList = markedResponse.querySelectorAll("pre > code");

        preCodeList.forEach((preCode, index) => {
          preCode.classList.forEach((cls) => {
            if (cls.startsWith('language-')) {
              preCode.parentElement.dataset.lang = cls.slice(9);
            }
          });
          preCode.parentElement.classList.add("pre-code-element", "flex", "flex-col");

          if (index !== preCodeList.length - 1) {
            preCode.parentElement.classList.add("mb-8");
          }

          const buttonWrapper = document.createElement("div");
          buttonWrapper.classList.add("code-actions-wrapper");

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

          buttonWrapper.append(wrapButton, copyButton, insert);

          preCode.parentElement.prepend(buttonWrapper);
        });
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        //chatText.classList.add("markdown-body");
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });

        if (message.byUser === true) {
          vscode.postMessage({ type: 'telemetry', info: collectInfo(message.id, "stopped-by-user") });
        }
        break;
      }
      case "addMessage": {
        if (list.lastElementChild.classList.contains(message.category)) {

        } else {
          list.innerHTML = `<div class="p-4 w-full message-element-gnc markdown-body ${message.category || ""}">
                    <h2 class="avatar font-bold mt-1 mb-4 flex flex-row-reverse text-xl gap-1">${aiIcon} ${l10nForUI["SenseCode"]}</h2>
                    <div>
                      ${message.value}
                    </div>
                  </div>`;
          list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
        }
        break;
      }
      case "addResponse": {
        const chatText = document.getElementById(`response-${message.id}`);
        if (chatText?.classList.contains("empty")) {
          chatText?.classList.remove("empty");
        }
        const progText = document.getElementById(`progress-${message.id}`);
        progText?.classList.add("started");
        chatText.dataset.response = (chatText.dataset.response || "") + message.value;
        let cont = wrapCode(chatText.dataset.response, chatText.dataset.lang);
        const markedResponse = new DOMParser().parseFromString(marked.parse(cont + "\n\n"), "text/html");
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
        break;
      }
      case "addError":
        if (!list.innerHTML) {
          return;
        }
        const chatText = document.getElementById(`response-${message.id}`);
        const feedback = document.getElementById(`feedback-${message.id}`);
        feedback?.classList.remove("hidden");
        feedback?.classList.add("error");
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

        document.getElementById(`progress-${message.id}`)?.classList?.add("hidden");
        document.getElementById("chat-button-wrapper")?.classList?.remove("responsing");
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
        break;
      default:
        break;
    }
  });

  vscode.postMessage({ type: "listPrompt" });

  const sendQuestion = (question) => {
    const prompt = question.getElementsByClassName("prompt");
    if (prompt[0].textContent.trim().length > 0) {
      const editableElems = prompt[0].getElementsByClassName("editable");
      Array.from(editableElems).forEach((el) => {
        el.setAttribute("contenteditable", false);
      });
      var s = window.getSelection();
      if (s.rangeCount > 0) {
        s.removeAllRanges();
      }

      let updatedPrompt = JSON.parse(prompt[0].dataset.prompt);
      updatedPrompt.prompt = prompt[0].textContent;
      prompt[0].dataset.prompt = JSON.stringify(updatedPrompt);
      let code = prompt[0].dataset.code;
      vscode.postMessage({
        type: "sendQuestion",
        value: updatedPrompt,
        code: code ? decodeURIComponent(code) : undefined,
        lang: prompt[0].dataset.lang
      });
    } else {
      addError({ category: "no-prompt", id: new Date().valueOf(), value: l10nForUI["Empty prompt"] });
    }
  };

  function toggleAskList() {
    var q = document.getElementById('question-input');
    if (q.value) {
      document.getElementById("question").classList.add("prompt-ready");
    } else {
      document.getElementById("question").classList.remove("prompt-ready");
    }
    if (q.value.startsWith('?') || q.value.startsWith('？')) {
      document.getElementById("question").classList.add("search");
      return;
    } else {
      document.getElementById("question").classList.remove("search");
    }
    var list = document.getElementById("ask-list");
    if (q.value === '/') {
      list.classList.remove("hidden");
      var btns = list.querySelectorAll("button");
      btns.forEach((btn, _index) => {
        btn.classList.remove('selected');
      });
      btns[0].classList.add('selected');
    } else {
      list.classList.add("hidden");
    }
  }

  document.addEventListener("change", (e) => {
    if (e.target.id === "question-input") {
      toggleAskList();
    } else if (e.target.id === "triggerModeRadio") {
      vscode.postMessage({ type: "triggerMode", value: e.target._value });
    } else if (e.target.id === "responseModeRadio") {
      vscode.postMessage({ type: "responseMode", value: e.target._value });
    } else if (e.target.id === "engineDropdown") {
      vscode.postMessage({ type: "activeEngine", value: e.target._value });
    } else {
    }
  });

  document.getElementById("question-input").addEventListener("input", () => {
    toggleAskList();
  });

  var historyIdx = -1;
  document.getElementById("question-input").addEventListener("blur", () => {
    historyIdx = -1;
  });

  document.addEventListener("keydown", (e) => {
    var list = document.getElementById("ask-list");
    if (!list.classList.contains("hidden")) {
      var btns = list.querySelectorAll("button");
      if (e.code === "Enter") {
        e.preventDefault();
        for (let i = 0; i < btns.length; i++) {
          if (btns[i].classList.contains('selected')) {
            btns[i].click();
            break;
          }
        }
      } else if (e.code === "ArrowDown") {
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
      } else if (e.code === "ArrowUp") {
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
    } else if (e.target.id === "question-input") {
      if (e.target.value.trim() && !e.isComposing && !e.shiftKey && e.code === "Enter") {
        e.preventDefault();
        vscode.postMessage({
          type: "prepareQuestion",
          value: {
            label: "",
            type: "free chat",
            prompt: e.target.value
          }
        });
      } else if (e.code === "ArrowDown") {
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
      } else if (e.code === "ArrowUp") {
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
        }
      } else {
        if (document.getElementById("question").classList.contains("history")) {
          if (e.code !== "Tab") {
            e.target.value = "";
            document.getElementById("question").classList.remove("search");
          } else {
            e.preventDefault();
            document.getElementById("question").classList.add("prompt-ready");
          }
          historyIdx = -1;
          document.getElementById("question").classList.remove("history");
          document.getElementById("question-input").focus();
        }
      }
      return;
    }

    const promptBox = e.target.closest('.prompt');
    if (promptBox && e.ctrlKey && e.code === "Enter") {
      e.preventDefault();
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      const question = e.target.closest('.question-element-gnc');
      sendQuestion(question);
      return;
    }

    if (promptBox && e.code === "Escape") {
      e.preventDefault();
      const question = e.target.closest('.question-element-gnc');
      question.remove();
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (e.ctrlKey && e.code === "Enter") {
      e.preventDefault();
      var readyQuestion = document.getElementsByClassName("replace");
      if (readyQuestion.length > 0) {
        document.getElementById("chat-button-wrapper")?.classList?.remove("editing");
        document.getElementById("question-input").disabled = false;
        document.getElementById("question-input").focus();
        const question = readyQuestion[readyQuestion.length - 1].closest(".question-element-gnc");
        sendQuestion(question);
      }
      return;
    }

    if (e.code === "Escape") {
      e.preventDefault();
      var replaceElems = document.getElementsByClassName("replace");
      for (var p of replaceElems) {
        p.remove();
      }
      vscode.postMessage({ type: 'stopGenerate' });
      document.getElementById("chat-button-wrapper")?.classList?.remove("editing", "responsing");
      document.getElementById("question-input").disabled = false;
      document.getElementById("question-input").focus();
      return;
    }

    if (e.code === "Slash") {
      document.getElementById("question-input").focus();
      return;
    }

    if (e.target.classList.contains("editable") && e.code === "Enter") {
      e.preventDefault();
    }
  });

  document.addEventListener("click", (e) => {
    const targetButton = e.target.closest('button');

    if (targetButton?.id === "send-button" || targetButton?.id === "search-button") {
      var list = document.getElementById("ask-list");
      if (list.classList.contains("hidden")) {
        var prompt = document.getElementById("question-input").value.trim();
        if (prompt) {
          vscode.postMessage({
            type: "prepareQuestion",
            value: {
              label: "",
              type: "free chat",
              prompt
            }
          });
        } else {
          var readyQuestion = document.getElementsByClassName("replace");
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

    if (e.target.id === "setKey") {
      vscode.postMessage({ type: "setKey" });
      return;
    }

    if (e.target.id === "clearKey") {
      vscode.postMessage({ type: "clearKey" });
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

    if (e.target.id === "clearAll") {
      vscode.postMessage({ type: "clearAll" });
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

    if (targetButton?.classList?.contains('bug')) {
      if (!targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.add("checked", "pointer-events-none");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "bug-report") });
      }
      return;
    }

    if (targetButton?.classList?.contains('regenerate')) {
      let id = targetButton?.dataset.id;
      e.preventDefault();
      targetButton?.classList?.add("pointer-events-none");
      const question = document.getElementById(`question-${id}`);
      sendQuestion(question);
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
})();
function wrapCode(cont, defaultLang) {
  if (!cont.startsWith('```')) {
    let lines = cont.split('\n');
    let maxLength = 0;
    for (let line of lines) {
      if (line.length > maxLength) {
        maxLength = line.length;
      }
    }
    let res = hljs.highlightAuto(cont);
    let guesslang = (res.language && res.language !== "vbnet") ? res.language : undefined;
    let relevance = res.relevance;
    if (guesslang) {
      if (maxLength < 200 && relevance > 8) {
        cont = "```" + guesslang + "\n" + cont;
      } else if (maxLength < 160 && relevance > 7) {
        cont = "```" + guesslang + "\n" + cont;
      } else if (maxLength < 120 && relevance > 6) {
        cont = "```" + guesslang + "\n" + cont;
      } else if (maxLength < 100 && relevance > 5) {
        cont = "```" + guesslang + "\n" + cont;
      } else if (defaultLang) {
        // cont = "```" + defaultLang + "\n" + cont;
      }
    }
  }
  if (cont.split("```").length % 2 !== 1) {
    cont = cont + "\n```";
  }
  return cont;
}
