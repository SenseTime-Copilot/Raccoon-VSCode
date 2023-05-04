const vscode = acquireVsCodeApi();

(function () {

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

  const aiIcon = `<span class="material-symbols-rounded">assistant</span>`;
  const questionIcon = `<span class="material-symbols-rounded">live_help</span>`;
  const clipboardIcon = `<span class="material-symbols-rounded">content_paste</span>`;
  const checkIcon = `<span class="material-symbols-rounded">inventory</span>`;
  const cancelIcon = `<span class="material-symbols-rounded">cancel</span>`;
  const sendIcon = `<span class="material-symbols-rounded">send</span>`;
  const insertIcon = `<span class="material-symbols-rounded">keyboard_return</span>`;
  const unfoldIcon = `<span class="material-symbols-rounded">expand</span>`;
  const foldIcon = `<span class="material-symbols-rounded">compress</span>`;

  var prompts = undefined;

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
    const asklist = document.getElementById("ask-list");

    switch (message.type) {
      case 'showError': {
        addError(message);
        break;
      }
      case 'enableAsk': {
        if (message.value) {
          // document.getElementById("shortcuts").classList.remove("disabled");
          // document.getElementById("ask-list").classList.remove("disabled");
          // document.getElementById("ask-button").classList.remove("disabled");
        } else {
          // document.getElementById("shortcuts").classList.add("disabled");
          // document.getElementById("ask-list").classList.add("disabled");
          // document.getElementById("ask-button").classList.add("disabled");
        }
        break;
      }
      case "updateSettingPage": {
        if (message.action === "close" || (message.action === "toogle" && document.getElementById('settings'))) {
          document.getElementById('settings').remove();
          break;
        }
        if (message.action === "open" || message.action === "toogle" || document.getElementById('settings')) {
          asklist.classList.add("hidden");
          document.getElementById("ask-button").classList.remove("open");
          const sp = document.getElementById("setting-page");
          sp.innerHTML = message.value;
        }
        break;
      }
      case "promptList": {
        prompts = message.value;
        var shortcuts = '<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>';
        for (var p of prompts) {
          let icon = p.icon || "smart_button";
          let ellip = "";
          let brush = p.brush || false;
          if (p.prompt.includes("${input")) {
            ellip = "...";
            brush = false;
          }
          shortcuts += `  <button class="grow flex flex-col gap-2 justify-center items-center rounded-lg m-2 p-2 w-32 ${brush ? "with-brush" : ""}"
                                        onclick='vscode.postMessage({
                                            type: "repareQuestion",
                                            value: ${JSON.stringify(p)}
                                        });
                          '>
                            <span class="material-symbols-rounded text-2xl">${icon}</span>
                            ${p.label}${ellip}
                          </button>
                      `;
        }
        document.getElementById("ask-list").innerHTML = shortcuts +
          `<button class="shortcut grow flex-col gap-2 justify-center items-center rounded-lg m-2 p-2 w-32"
                      onclick="vscode.postMessage({
                          type: 'repareQuestion',
                          value: {type: 'code Q&A', prompt: '\${input:${l10nForUI["Question Here..."]}}'}
                      });"
            >
          <span class="material-symbols-rounded text-2xl">chat</span>
          ${l10nForUI["Code Q&A"]}
        </button>
        `;

        shortcuts += `<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
                      <button class="shortcut gap-2 justify-center items-center rounded-lg m-2 p-2 w-full"
                              onclick="vscode.postMessage({type: 'repareQuestion', value: {type: 'code Q&A', prompt: '\${input:${l10nForUI["Question Here..."]}}'}});">
                        <span class="material-symbols-rounded text-2xl">chat</span>
                        ${l10nForUI["Code Q&A"]}
                      </button>
                      <button class="shortcut chat-shortcut gap-2 justify-center items-center rounded-lg m-2 p-2 w-full"
                              onclick="vscode.postMessage({type: 'repareQuestion', value: {type: 'free chat', prompt: '\${input:${l10nForUI["Question Here..."]}}'}});">
                        <span class="material-symbols-rounded text-2xl">chat_bubble</span>
                        ${l10nForUI["Free chat"]}
                      </button>`;
        document.getElementById("shortcuts").innerHTML = shortcuts;

        break;
      }
      case "addQuestion": {
        document.getElementById('settings')?.remove();

        document.getElementById("cover")?.classList?.add("hidden");
        document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");

        var replaceElems = document.getElementsByClassName("replace");
        for (var e of replaceElems) {
          e.remove();
        }

        let id = message.id;
        let prompt = message.value;
        let code = message.code + "" || "";
        let lang = message.lang + "" || "";
        let progress = `<div id="progress-${id}" class="pt-6 flex justify-between items-center">
                    <span class="flex gap-2 opacity-50">
                      <div class="spinner">
                          <span class="material-symbols-rounded">autorenew</span>
                      </div>
                      <div class="typing">${l10nForUI["Thinking..."]}</div>
                    </span>
                  </div>`;
        const edit = !message.send;
        if (message.streaming === true) {
          progress = `
          <div id="progress-${id}" class="pt-6 flex justify-between items-center">
            <span class="flex gap-2 opacity-50">
              <div class="spinner">
                  <span class="material-symbols-rounded">autorenew</span>
              </div>
              <div class="typing">${l10nForUI["Typing..."]}</div>
            </span>
            <button class="stopGenerate flex" data-id=${id}>
              <span class="material-symbols-rounded">
                stop_circle
              </span>
              <p style="margin: 0 4px 0 6px">${l10nForUI["Stop responding"]}</p>
            </button>
          </div>`;
        }

        let prompthtml = prompt.prompt;
        if (prompt.prompt.includes("${input")) {
          prompthtml = prompthtml.replaceAll(/\${input(:([^}]*))?}/g, `<p class="editable inline-block mx-1 rounded w-fit" contenteditable="${edit}" data-placeholder="$2"></p>`);
        }

        let codeSnippet = "";
        if (prompt.type === 'free chat') {
          code = "";
        } else {
          const codehtml = new DOMParser().parseFromString(marked.parse("```\n" + code + "\n```"), "text/html");
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
        if (edit) {
          actionBtns = `
          <div class="text-sm">
              <div class="${edit ? "" : "hidden"} send-cancel-elements-gnc flex flex-row-reverse gap-0.5">
                  <button title="${l10nForUI["Cancel"]}" class="cancel-element-gnc p-0.5 opacity-75 rounded flex items-center">${cancelIcon}</button>
                  <button title="${l10nForUI["Send"]}" class="send-element-gnc p-0.5 opacity-75 rounded flex items-center">${sendIcon}</button>
              </div>
          </div>
          `;
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
              <div id="prompt-${id}" class="prompt inline-block leading-loose py-2" data-prompt='${JSON.stringify(prompt)}' data-code="${encodeURIComponent(code)}" data-lang="${lang}">${prompthtml}</div>
              ${codeSnippet}
          </div>`;

        if (edit) {
          var promptText = document.getElementById(`prompt-${id}`);
          const editableElems = promptText.getElementsByClassName("editable");
          Array.from(editableElems).reverse().forEach((el) => {
            el.setAttribute("contenteditable", true);
            el.focus();
          });
        } else {
          document.getElementById("chat-button-wrapper")?.classList?.add("disabled");
          var chat = document.getElementById(id);
          if (!chat) {
            chat = document.createElement("div");
            chat.id = id;
            chat.classList.add("p-4", "answer-element-gnc", "w-full");
            chat.innerHTML = `  <h2 class="avatar font-bold mt-1 mb-4 flex flex-row-reverse text-xl gap-1">${aiIcon} ${l10nForUI["SenseCode"]}</h2>
                                        <div id="response-${id}" class="response flex flex-col gap-1"></div>
                                        ${progress}
                                        <div id="feedback-${id}" class="feedback pt-6 flex justify-between items-center hidden">
                                          <span class="flex gap-2">
                                            <button class="like flex rounded" data-id=${id}>
                                              <span class="material-symbols-rounded">
                                                thumb_up
                                              </span>
                                            </button>
                                            <button class="unlike flex rounded" data-id=${id}>
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
                                          <button class="regenerate flex rounded" data-id=${id}>
                                            <span class="material-symbols-rounded">
                                              refresh
                                            </span>
                                            <p style="margin: 0 4px 0 6px">${l10nForUI["Regenerate"]}</p>
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
        document.getElementById("chat-button-wrapper")?.classList?.remove("disabled");

        const chatText = document.getElementById(`response-${message.id}`);
        if (!chatText.dataset.response) {
          break;
        }
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

          preCode.classList.add("inline", "whitespace-pre", "overflow-x-scroll", "overflow-y-auto");

          const buttonWrapper = document.createElement("div");
          buttonWrapper.classList.add("code-actions-wrapper");

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

          buttonWrapper.append(copyButton, insert);

          preCode.parentElement.prepend(buttonWrapper);
        });
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        chatText.classList.add("markdown-body");
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });

        if (message.byUser === true) {
          vscode.postMessage({ type: 'telemetry', info: collectInfo(message.id, "stopped-by-user") });
        }
        break;
      }
      case "addResponse": {
        const chatText = document.getElementById(`response-${message.id}`);
        chatText.dataset.response = (chatText.dataset.response || "") + message.value;
        const markedResponse = new DOMParser().parseFromString(marked.parse(chatText.dataset.response + "\n\n"), "text/html");
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
                                        <div class="grow">
                                            <p>An error occurred</p><p>${message.error}</p>
                                        </div>
                                        <button class="bug rounded border-0 mx-4 opacity-50 focus:outline-none" data-id=${message.id}>
                                          <span class="material-symbols-rounded">
                                            bug_report
                                          </span>
                                        </button>
                                    </div>`;

        document.getElementById(`progress-${message.id}`)?.classList?.add("hidden");
        document.getElementById("chat-button-wrapper")?.classList?.remove("disabled");
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
        break;
      case "clearQAList": {
        clearQAList();
        break;
      }
      default:
        break;
    }
  });

  vscode.postMessage({ type: "listPrompt" });

  const clearQAList = () => {
    document.getElementById("qa-list").innerHTML = "";
    document.getElementById("ask-list").classList.add("hidden");
    document.getElementById("ask-button").classList.remove("open");
    document.getElementById("cover")?.classList?.remove("hidden");
    document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
  };

  const sendQuestion = (question) => {
    const prompt = question.getElementsByClassName("prompt");
    if (prompt[0].textContent.trim().length > 0) {
      const elements = question.getElementsByClassName("send-cancel-elements-gnc");
      elements[0]?.classList.add("hidden");
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

  document.addEventListener("change", (e) => {
    if (e.target.id === "triggerModeRadio") {
      vscode.postMessage({ type: "triggerMode", value: e.target._value });
    } else if (e.target.id === "completionModeRadio") {
      vscode.postMessage({ type: "completionMode", value: e.target._value });
    } else if (e.target.id === "responseModeRadio") {
      vscode.postMessage({ type: "responseMode", value: e.target._value });
    } else if (e.target.id === "engineDropdown") {
      vscode.postMessage({ type: "activeEngine", value: e.target._value });
    } else {
    }
  });

  document.addEventListener("keydown", (e) => {
    const promptBox = e.target.closest('.prompt');
    if (promptBox && e.ctrlKey && e.code === "Enter") {
      e.preventDefault();
      const question = e.target.closest('.question-element-gnc');
      sendQuestion(question);
      return;
    }
    if (e.target.classList.contains("editable") && e.code === "Enter") {
      e.preventDefault();
      return;
    }
    if (promptBox && e.code === "Escape") {
      e.preventDefault();
      const question = e.target.closest('.question-element-gnc');
      question.remove();
      if (document.getElementById("qa-list").childElementCount === 0) {
        clearQAList();
      }
    }
  });

  var checkMengxiStart = false;
  var clickMengxiCount = 0;
  var timer;
  const checkMengxi = function (elem) {
    if (elem.id === "Penrose") {
      if (checkMengxiStart === false) {
        checkMengxiStart = true;
        clickMengxiCount++;
        timer = setTimeout(() => {
          checkMengxiStart = false;
          clickMengxiCount = 0;
          clearTimeout(timer);
        }, 1500);
      } else {
        clickMengxiCount++;
      }
      if ((!document.body.classList.contains("x-next") && clickMengxiCount >= 8) ||
        (document.body.classList.contains("x-next") && clickMengxiCount >= 4)) {
        checkMengxiStart = false;
        clickMengxiCount = 0;
        clearTimeout(timer);
        return true;
      }
    } else {
      checkMengxiStart = false;
      clickMengxiCount = 0;
    }
    return false;
  };

  document.addEventListener("click", (e) => {
    if (checkMengxi(e.target)) {
      document.body.classList.toggle('x-next');
      return;
    }
    const targetButton = e.target.closest('button');

    if (targetButton?.id === "ask-button") {
      e.preventDefault();
      document.getElementById("ask-list").classList.toggle("hidden");
      targetButton.classList.toggle("open");
      return;
    }

    var list = document.getElementById("ask-list");
    if (!list.classList.contains("hidden")) {
      list.classList.add("hidden");
      document.getElementById("ask-button").classList.remove("open");
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
      vscode.postMessage({ type: "candidates", value: (parseInt(e.target.dataset.value) + 2) % 6 });
      return;
    }

    if (e.target.id === "clearAll") {
      vscode.postMessage({ type: "clearAll" });
      return;
    }

    if (targetButton?.id === "clear-button") {
      e.preventDefault();
      clearQAList();
      return;
    }

    if (targetButton?.id === "chat-button") {
      e.preventDefault();
      vscode.postMessage({ type: 'repareQuestion', value: { type: 'free chat', prompt: `\${input:${l10nForUI["Question Here..."]}}` } });
      return;
    }

    if (targetButton?.classList?.contains('stopGenerate')) {
      vscode.postMessage({ type: 'stopGenerate', id: targetButton.dataset.id });
      return;
    }

    if (targetButton?.classList?.contains('like')) {
      const feedbackActions = targetButton.closest('.feedback');
      var unlike = feedbackActions.querySelectorAll(".unlike")[0];
      if (targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.remove("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "like-cancelled") });
      } else {
        unlike?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "like") });
      }
      return;
    }

    if (targetButton?.classList?.contains('unlike')) {
      const feedbackActions = targetButton.closest('.feedback');
      var like = feedbackActions.querySelectorAll(".like")[0];
      if (targetButton?.classList?.contains('checked')) {
        targetButton?.classList?.remove("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "unlike-cancelled") });
      } else {
        like?.classList.remove("checked");
        targetButton?.classList?.add("checked");
        vscode.postMessage({ type: 'telemetry', info: collectInfo(targetButton?.dataset.id, "unlike") });
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
      const question = targetButton.closest(".question-element-gnc");
      sendQuestion(question);
      return;
    }

    if (targetButton?.classList?.contains("cancel-element-gnc")) {
      e.preventDefault();
      const question = targetButton.closest(".question-element-gnc");
      question.remove();
      if (document.getElementById("qa-list").childElementCount === 0) {
        clearQAList();
      }
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
