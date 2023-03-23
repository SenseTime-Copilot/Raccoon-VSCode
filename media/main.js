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

    const aiIcon = `<span class="material-symbols-rounded">lightbulb_circle</span>`;
    const userIcon = `<span class="material-symbols-rounded">account_circle</span>`;
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
            case "promptList": {
                prompts = message.value;
                var shortcuts = "";

                for (var k in prompts) {
                    const label_pre = k.replace(/([A-Z])/g, " $1");
                    const label = label_pre.charAt(0).toUpperCase() + label_pre.slice(1);
                    let p = prompts[k];
                    let ellip = "";
                    let send = true;
                    if (p.includes("${input}")) {
                        p = p.replace("${input}", "");
                        ellip = "...";
                        send = false;
                    }
                    promptList += `<vscode-option value="${p}">${label}${ellip}</vscode-option>`;
                    shortcuts += `  <button class="flex gap-2 justify-center items-center rounded-lg p-2"
                                        onclick="vscode.postMessage({
                                            type: 'repareQuestion',
                                            value: '${p}',
                                            send: ${send}
                                        });
                                    ">
                                        ${label}${ellip}
                                    </button>`;
                }
                shortcuts += `<button id="chat-shortcut" class="flex gap-2 justify-center items-center rounded-lg p-2"
                                    onclick="vscode.postMessage({type: 'repareQuestion', value: '', send: false});">
                                    <span class="material-symbols-rounded">quick_phrases</span>
                                        Free Talk...
                                    </button>`;
                document.getElementById("shortcuts").innerHTML = shortcuts;

                break;
            }
            case "addQuestion": {
                let id = message.id;
                let p = message.value || "";
                let code = message.code || "";
                let hasPrompt = p.trim() !== "";
                let hasCode = code.trim() !== "";
                const edit = !message.send;

                if (!hasPrompt && hasCode) {
                    code = "";
                    hasCode = false;
                }

                const codehtml = hasCode ? marked.parse("```\n" + code + "\n```") : "";

                document.getElementById("cover")?.classList?.add("hidden");
                var replaceElems = document.getElementsByClassName("replace");
                for (var e of replaceElems) {
                    e.remove();
                }

                list.innerHTML +=
                    `<div class="p-4 self-end question-element-gnc relative  ${edit ? "replace" : ""}">
                        <h2 class="avatar font-bold mb-5 flex text-xl gap-1">${userIcon} You</h2>
                        <div class="mb-5 flex items-center">
                            <button title="Edit and resend this prompt" class="resend-element-gnc p-0.5 opacity-50 flex items-center rounded-lg text-base absolute right-4 top-5 ${edit ? "hidden" : ""}">${pencilIcon}</button>
                            <div class="${edit ? "" : "hidden"} send-cancel-elements-gnc flex flex-row-reverse gap-2 absolute right-4" style="width: calc(100% - 32px);">
                                <button title="Cancel [Esc]" class="cancel-element-gnc p-0.5 opacity-50 rounded-lg flex items-center text-base">${cancelIcon}</button>
                                <button title="Send this prompt [Ctrl+Enter]" class="send-element-gnc p-0.5 opacity-50 rounded-lg flex items-center text-base">${sendIcon}</button>
                                <vscode-dropdown style="width: 100%;margin: 1px 0;" class="${hasCode ? "" : "hidden"}">${promptList}</vscode-dropdown>
                            </div>
                        </div>
                        <p id="prompt-${id}" class="prompt leading-loose p-2" contenteditable=${edit}>${p}</p>
                        <div class="overflow-y-auto p-2">${codehtml}</div>
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
                        chat.innerHTML = `  <h2 class="avatar font-bold mb-5 flex text-xl gap-1">${aiIcon} SenseCode</h2>
                                        <div id="${id}-text" class="flex flex-col gap-1 whitespace-pre-wrap"></div>
                                        <div id="${id}-progress" class="pt-2 flex items-center opacity-50">
                                            <div class="spinner">
                                                <span class="material-symbols-rounded">workspaces</span>
                                            </div>
                                            <div class="typing">Typing...</div>
                                        </div>`;
                        list.appendChild(chat);
                    }
                }
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                break;
            }
            case "stopResponse":
                {
                    document.getElementById(`${message.id}-progress`)?.classList?.add("hidden");
                    document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");

                    const chatText = document.getElementById(`${message.id}-text`);
                    const markedResponse = new DOMParser().parseFromString(marked.parse(chatText.textContent + "\n\n"), "text/html");
                    const preCodeList = markedResponse.querySelectorAll("pre > code");

                    preCodeList.forEach((preCode, index) => {
                        preCode.parentElement.classList.add("pre-code-element", "relative");

                        if (index != preCodeList.length - 1) {
                            preCode.parentElement.classList.add("mb-8");
                        }

                        preCode.classList.add("block", "whitespace-pre", "overflow-x-scroll");

                        const buttonWrapper = document.createElement("div");
                        buttonWrapper.classList.add("code-actions-wrapper", "flex", "gap-2", "opacity-20", "flex-wrap", "items-center", "right-2", "top-1", "absolute");

                        // Create copy to clipboard button
                        const copyButton = document.createElement("button");
                        copyButton.title = "Copy to clipboard";
                        copyButton.innerHTML = clipboardIcon;

                        copyButton.classList.add("code-element-gnc", "text-base", "p-0.5", "opacity-50", "flex", "items-center", "rounded-lg");

                        const insert = document.createElement("button");
                        insert.title = "Insert the below code to the current file";
                        insert.innerHTML = insertIcon;

                        insert.classList.add("edit-element-gnc", "text-base", "p-0.5", "flex", "opacity-50", "items-center", "rounded-lg");

                        const newTab = document.createElement("button");
                        newTab.title = "Create a new file with the below code";
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
                chatText.textContent = chatText.textContent + message.value;
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
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
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
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
        prompt[0]?.setAttribute("contenteditable", false);
        const code = question.querySelectorAll("pre > code");
        var s = window.getSelection();
        if (s.rangeCount > 0)
            s.removeAllRanges();

        if (prompt[0].textContent.length > 0) {
            vscode.postMessage({
                type: "sendQuestion",
                value: prompt[0].textContent,
                code: code[0]?.textContent,
                send: true
            });
        }
    }

    const cancelEditQuestion = (question) => {
        const elements = question.getElementsByClassName("send-cancel-elements-gnc");
        const resendElement = question.getElementsByClassName("resend-element-gnc");
        elements[0]?.classList.add("hidden");
        resendElement[0]?.classList.remove("hidden");
        question.querySelectorAll(".prompt")[0].setAttribute("contenteditable", false);
        var s = window.getSelection();
        if (s.rangeCount > 0)
            s.removeAllRanges();
        document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");
    }

    document.addEventListener("change", (e) => {
        const question = e.target.closest(".question-element-gnc");

        const prompts = question.getElementsByClassName('prompt');
        prompts[0].textContent = e.target._value;
        prompts[0].focus();
    });

    document.addEventListener("keydown", (e) => {
        if (e.target.classList.contains("prompt") && e.ctrlKey && e.code === "Enter") {
            e.preventDefault();
            const question = e.target.closest('.question-element-gnc');
            sendQuestion(question);
        }
        if (e.target.classList.contains("prompt") && e.code === "Escape") {
            e.preventDefault();
            const question = e.target.closest('.question-element-gnc');
            cancelEditQuestion(question);
        }
    });

    document.addEventListener("click", (e) => {
        const targetButton = e.target.closest('button');

        if (targetButton?.id === "clear-button") {
            e.preventDefault();
            clearQAList();
            return;
        }

        if (targetButton?.id === "chat-button") {
            e.preventDefault();
            vscode.postMessage({ type: 'repareQuestion', value: '', send: false });
            return;
        }

        if (targetButton?.id === "ask-button") {
            e.preventDefault();
            var p = "Question here";
            for (var k in prompts) {
                p = prompts[k].replace("${input}", "");
            }
            vscode.postMessage({ type: 'repareQuestion', value: p, send: false });
            return;
        }

        if (targetButton?.classList?.contains("resend-element-gnc")) {
            e.preventDefault();
            document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
            const question = targetButton.closest(".question-element-gnc");
            const elements = targetButton.nextElementSibling;
            elements.classList.remove("hidden");
            const prompt = question.getElementsByClassName("prompt");
            prompt[0]?.setAttribute("contenteditable", true);
            prompt[0].focus();

            targetButton.classList.add("hidden");

            return;
        }

        if (targetButton?.classList?.contains("send-element-gnc")) {
            e.preventDefault();
            const question = targetButton.closest(".question-element-gnc");
            sendQuestion(question);
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

            return;
        }
    });

})();
