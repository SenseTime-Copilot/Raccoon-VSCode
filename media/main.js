// @ts-nocheck
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
  const pencilIcon = `<span class="material-symbols-rounded">edit</span>`;
  const plusIcon = `<span class="material-symbols-rounded">note_add</span>`;
  const insertIcon = `<span class="material-symbols-rounded">double_arrow</span>`;

  var prompts = undefined;
  var promptList = ``;

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    const list = document.getElementById("qa-list");

    switch (message.type) {
      case "updateSettingPage": {
        if (document.getElementById('settings') || message.show) {
          const sp = document.getElementById("setting-page");
          sp.innerHTML = message.value;
        }
        break;
      }
      case "promptList": {
        prompts = message.value;
        var shortcuts = '<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>';

        for (var k in prompts) {
          const labelPre = k.replace(/([A-Z])/g, " $1");
          label = labelPre.charAt(0).toUpperCase() + labelPre.slice(1);

          let p = prompts[k].prompt;
          let icon = prompts[k].icon || "smart_button";
          let ellip = "";
          let brush = prompts[k].brush || false;
          if (p.includes("${input")) {
            ellip = "...";
            brush = false;
          }
          promptList += `<vscode-option value="${p}">${label}${ellip}</vscode-option>`;
          shortcuts += `  <button class="grow flex flex-col gap-2 justify-center items-center rounded-lg m-2 p-2 w-32 ${brush ? "with-brush" : ""}"
                                        onclick='vscode.postMessage({
                                            type: "repareQuestion",
                                            value: ${JSON.stringify(prompts[k])}
                                        });
                          '>
                            <span class="material-symbols-rounded text-2xl">${icon}</span>
                            ${label}${ellip}
                          </button>
                      `;
        }
        document.getElementById("ask-list").innerHTML = shortcuts +
          `<button class="chat-shortcut grow flex-col gap-2 justify-center items-center rounded-lg m-2 p-2 w-32"
                      onclick="vscode.postMessage({
                          type: 'repareQuestion',
                          value: {type: 'code Q&A', prompt: '\${input:Question Here...}'}
                      });"
            >
          <span class="material-symbols-rounded text-2xl">chat</span>
          ${l10nForUI["Code Q&A"]}
        </button>
        `;

        shortcuts += `<vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
                      <button class="chat-shortcut gap-2 justify-center items-center rounded-lg m-2 p-2 w-full"
                              onclick="vscode.postMessage({type: 'repareQuestion', value: {type: 'code Q&A', prompt: '\${input:Question Here...}'}});">
                        <span class="material-symbols-rounded text-2xl">chat</span>
                        ${l10nForUI["Code Q&A"]}
                      </button>
                      <button class="chat-shortcut gap-2 justify-center items-center rounded-lg m-2 p-2 w-full"
                              onclick="vscode.postMessage({type: 'repareQuestion', value: {type: 'free chat', prompt: '\${input:Question Here...}'}});">
                        <span class="material-symbols-rounded text-2xl">chat_bubble</span>
                        ${l10nForUI["FreeChat"]}
                      </button>`;
        document.getElementById("shortcuts").innerHTML = shortcuts;

        break;
      }
      case "addQuestion": {
        document.getElementById('settings')?.remove();
        let id = message.id;
        let prompt = message.value;
        let code = message.code + "" || "";
        let lang = message.lang + "" || "";
        let tip = message.streaming ? "Typing..." : "Thinking...";
        const edit = !message.send;

        let margin = "";
        if (edit && prompt.type !== 'free chat') {
          margin = "mb-4";
        }

        let prompthtml = prompt.prompt;
        if (prompt.prompt.includes("${input")) {
          prompthtml = prompthtml.replaceAll(/\${input(:([^}]*))?}/g, `<p class="eidtable mx-1 px-2 w-fit h-6" contenteditable="${edit}">$2</p>`);
        }

        let codeSnippet = "";
        if (prompt.type === 'free chat') {
          code = "";
        } else {
          let expendStatus = "";
          let expendBtn = "";
          let codehtml = marked.parse("```\n" + code + "\n```");
          let lines = code.split('\n');
          if (lines.length > 10) {
            expendBtn = `<button class="expend-code -ml-2 mr-1 border-none rounded-md cursor-pointer justify-center opacity-75">
                      <span class="material-symbols-rounded">keyboard_double_arrow_down</span>
                    </button>`;
            expendStatus = "";
          } else {
            expendStatus = "expend";
          }
          codeSnippet = `<div class="code-wrapper ${expendStatus} flex p-2">
                          ${expendBtn}
                          ${codehtml}
                        </div>`;
        }

        document.getElementById("cover")?.classList?.add("hidden");
        var replaceElems = document.getElementsByClassName("replace");
        for (var e of replaceElems) {
          e.remove();
        }

        list.innerHTML +=
          `<div class="p-4 self-end question-element-gnc relative ${edit ? "replace" : ""}">
              <h2 class="avatar font-bold ${margin} flex text-xl gap-1 opacity-60">${questionIcon} ${l10nForUI["Question"]}</h2>
              <div class="mb-5 flex items-center">
                  <button title="${l10nForUI["Edit"]}" class="resend-element-gnc p-0.5 opacity-50 flex items-center rounded-lg text-base absolute right-4 top-4 hidden">${pencilIcon}</button>
                  <div class="${edit ? "" : "hidden"} send-cancel-elements-gnc flex flex-row-reverse gap-2 absolute right-4" style="width: calc(100% - 32px);">
                      <button title="${l10nForUI["Cancel"]}" class="cancel-element-gnc p-0.5 opacity-50 rounded-lg flex items-center text-base">${cancelIcon}</button>
                      <button title="${l10nForUI["Send"]}" class="send-element-gnc p-0.5 opacity-50 rounded-lg flex items-center text-base">${sendIcon}</button>
                      <vscode-dropdown style="width: 100%;margin: 1px 0;" class="hidden">${promptList}</vscode-dropdown>
                  </div>
              </div>
              <div id="prompt-${id}" class="prompt flex leading-loose p-2" data-prompt='${JSON.stringify(prompt)}' data-code="${encodeURIComponent(code)}" data-lang="${lang}">${prompthtml}</div>
              ${codeSnippet}
          </div>`;

        if (edit) {
          var promptText = document.getElementById(`prompt-${id}`);
          promptText.focus();
        } else {
          document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
          var chat = document.getElementById(id);
          if (!chat) {
            chat = document.createElement("div");
            chat.id = id;
            chat.classList.add("p-4", "self-end", "pb-8", "answer-element-gnc");
            chat.innerHTML = `  <h2 class="avatar font-bold mb-4 flex flex-row-reverse text-xl gap-1 opacity-60">${aiIcon} ${l10nForUI["SenseCode"]}</h2>
                                        <div id="${id}-text" class="flex flex-col gap-1 whitespace-pre-wrap"></div>
                                        <div id="${id}-progress" class="pt-6 flex opacity-50 justify-between items-center">
                                          <span class="flex gap-2">
                                            <div class="spinner">
                                                <span class="material-symbols-rounded">autorenew</span>
                                            </div>
                                            <div class="typing">${l10nForUI[tip]}</div>
                                          </span>
                                          <vscode-button appearance="icon" onclick="vscode.postMessage({type: 'stopGenerate', id: '${id}'});">
                                            <span class="material-symbols-rounded">
                                              stop_circle
                                            </span>
                                            <p style="margin: 0 4px 0 6px">${l10nForUI["Stop responding"]}</p>
                                          </vscode-button>
                                        </div>`;
            list.appendChild(chat);
          }
        }
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
        break;
      }
      case "stopResponse": {
        document.getElementById(`${message.id}-progress`)?.classList?.add("hidden");
        document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");

        const chatText = document.getElementById(`${message.id}-text`);
        if (!chatText.dataset.content) {
          break;
        }
        const markedResponse = new DOMParser().parseFromString(marked.parse(chatText.dataset.content + "\n\n"), "text/html");
        chatText.dataset.content = undefined;
        const preCodeList = markedResponse.querySelectorAll("pre > code");

        preCodeList.forEach((preCode, index) => {
          preCode.parentElement.classList.add("pre-code-element", "relative");

          if (index !== preCodeList.length - 1) {
            preCode.parentElement.classList.add("mb-8");
          }

          preCode.classList.add("block", "whitespace-pre", "overflow-x-scroll");

          const buttonWrapper = document.createElement("div");
          buttonWrapper.classList.add("code-actions-wrapper", "flex", "gap-2", "opacity-60", "flex-wrap", "items-center", "right-2", "top-1", "absolute");

          // Create copy to clipboard button
          const copyButton = document.createElement("button");
          copyButton.title = l10nForUI["Copy"];
          copyButton.innerHTML = clipboardIcon;

          copyButton.classList.add("code-element-gnc", "text-base", "p-0.5", "opacity-50", "flex", "items-center", "rounded-lg");

          const insert = document.createElement("button");
          insert.title = l10nForUI["Insert"];
          insert.innerHTML = insertIcon;

          insert.classList.add("edit-element-gnc", "text-base", "p-0.5", "flex", "opacity-50", "items-center", "rounded-lg");

          const newTab = document.createElement("button");
          newTab.title = l10nForUI["NewFile"];
          newTab.innerHTML = plusIcon;

          newTab.classList.add("new-code-element-gnc", "text-base", "p-0.5", "flex", "opacity-50", "items-center", "rounded-lg");

          buttonWrapper.append(copyButton, insert, newTab);

          preCode.parentElement.prepend(buttonWrapper);
        });
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        chatText.classList.add("markdown-body");
        break;
      }
      case "addResponse": {
        const chatText = document.getElementById(`${message.id}-text`);
        chatText.dataset.content = (chatText.dataset.content || "") + message.value;
        const markedResponse = new DOMParser().parseFromString(marked.parse(chatText.dataset.content + "\n\n"), "text/html");
        chatText.innerHTML = markedResponse.documentElement.innerHTML;
        list.lastChild?.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
        break;
      }
      case "addError":
        if (!list.innerHTML) {
          return;
        }
        const chatText = document.getElementById(`${message.id}-text`);
        chatText.innerHTML = chatText.innerHTML + `<div class="errorMsg flex items-center">
                                        <span class="material-symbols-rounded text-3xl p-2">report</span>
                                        <div>
                                            <p>An error occurred</p><p>${message.error}</p>
                                        </div>
                                    </div>`;

        document.getElementById(`${message.id}-progress`)?.classList?.add("hidden");
        document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");
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
    document.getElementById("cover")?.classList?.remove("hidden");
    document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
  };

  const sendQuestion = (question) => {
    const elements = question.getElementsByClassName("send-cancel-elements-gnc");
    const resendElement = question.getElementsByClassName("resend-element-gnc");
    elements[0]?.classList.add("hidden");
    resendElement[0]?.classList.remove("hidden");
    const prompt = question.getElementsByClassName("prompt");
    const eidtableElems = prompt[0].getElementsByClassName("eidtable");
    Array.from(eidtableElems).forEach((el) => {
      el.setAttribute("contenteditable", false);
    });
    var s = window.getSelection();
    if (s.rangeCount > 0) {
      s.removeAllRanges();
    }

    if (prompt[0].textContent.length > 0) {
      let updatedPrompt = JSON.parse(prompt[0].dataset.prompt);
      updatedPrompt.prompt = prompt[0].textContent;
      vscode.postMessage({
        type: "sendQuestion",
        value: updatedPrompt,
        code: decodeURIComponent(prompt[0].dataset.code),
        lang: prompt[0].dataset.lang
      });
    }
  };

  const cancelEditQuestion = (question) => {
    const elements = question.getElementsByClassName("send-cancel-elements-gnc");
    const resendElement = question.getElementsByClassName("resend-element-gnc");
    elements[0]?.classList.add("hidden");
    resendElement[0]?.classList.remove("hidden");
    const prompt = question.getElementsByClassName("prompt");
    const eidtableElems = prompt[0].getElementsByClassName("eidtable");
    Array.from(eidtableElems).forEach((el) => {
      el.setAttribute("contenteditable", false);
    });
    var s = window.getSelection();
    if (s.rangeCount > 0) {
      s.removeAllRanges();
    }
    document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");
  };

  document.addEventListener("change", (e) => {
    if (e.target.id === "triggerModeRadio") {
      vscode.postMessage({ type: "triggerMode", value: e.target._value });
      if (e.target._value === "Auto") {
        document.getElementById("triggerDelay").classList.remove("hidden");
        document.getElementById("keyBindingBtn").classList.add("hidden");
      } else {
        document.getElementById("triggerDelay").classList.add("hidden");
        document.getElementById("keyBindingBtn").classList.remove("hidden");
      }
    } else if (e.target.id === "completionModeRadio") {
      vscode.postMessage({ type: "completionMode", value: e.target._value });
    } else if (e.target.id === "responseModeRadio") {
      vscode.postMessage({ type: "responseMode", value: e.target._value });
    } else if (e.target.id === "engineDropdown") {
      vscode.postMessage({ type: "activeEngine", value: e.target._value });
    } else {
      const question = e.target.closest(".question-element-gnc");
      const ps = question.getElementsByClassName('prompt');
      var content = e.target._value;
      ps[0].innerHTML = content.replaceAll(/\${input(:([^}]*))?}/g, `<p class="eidtable mx-1 px-2 w-fit h-6" contenteditable="true">$2</p>`);
      ps[0].focus();
    }
  });

  document.addEventListener("keydown", (e) => {
    const promptBox = e.target.closest('.prompt');
    if (promptBox && e.ctrlKey && e.code === "Enter") {
      e.preventDefault();
      const question = e.target.closest('.question-element-gnc');
      sendQuestion(question);
    }
    if (promptBox && e.code === "Escape") {
      e.preventDefault();
      const question = e.target.closest('.question-element-gnc');
      cancelEditQuestion(question);
    }
  });

  document.addEventListener("click", (e) => {
    const targetButton = e.target.closest('button');

    if (targetButton?.id === "ask-button") {
      e.preventDefault();
      document.getElementById("ask-list").classList.toggle("hidden");
      return;
    }

    var list = document.getElementById("ask-list");
    if (!list.classList.contains("hidden")) {
      list.classList.add("hidden");
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

    if (targetButton?.id === "clear-button") {
      e.preventDefault();
      clearQAList();
      return;
    }

    if (targetButton?.id === "chat-button") {
      e.preventDefault();
      vscode.postMessage({ type: 'repareQuestion', value: { type: 'free chat', prompt: '${input:Question Here...}' } });
      return;
    }

    if (targetButton?.classList?.contains("expend-code")) {
      e.preventDefault();
      const question = targetButton.closest(".question-element-gnc");
      const code = question.getElementsByClassName("code-wrapper");
      code[0].classList.toggle("expend");
      return;
    }

    if (targetButton?.classList?.contains("resend-element-gnc")) {
      e.preventDefault();
      document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
      const question = targetButton.closest(".question-element-gnc");
      const elements = targetButton.nextElementSibling;
      elements.classList.remove("hidden");
      const prompt = question.getElementsByClassName("prompt");
      const eidtableElems = prompt[0].getElementsByClassName("eidtable");
      Array.from(eidtableElems).forEach((el) => {
        el.setAttribute("contenteditable", true);
        el.focus();
      });

      targetButton.classList.add("hidden");

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
      cancelEditQuestion(question);
      return;
    }

    if (targetButton?.classList?.contains("code-element-gnc")) {
      e.preventDefault();
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
      vscode.postMessage({
        type: "editCode",
        value: targetButton.parentElement?.parentElement?.lastChild?.textContent,
      });

      return;
    }

    if (targetButton?.classList?.contains("new-code-element-gnc")) {
      e.preventDefault();
      vscode.postMessage({
        type: "openNew",
        value: targetButton.parentElement?.parentElement?.lastChild?.textContent,
      });
      // return;
    }

  });

})();
