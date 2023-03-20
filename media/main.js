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

    const aiIcon = `<span class="material-symbols-rounded">all_inclusive</span>`;
    const userIcon = `<span class="material-symbols-rounded">person</span>`;
    const clipboardIcon = `<span class="material-symbols-rounded">content_paste</span>`;
    const checkIcon = `<span class="material-symbols-rounded">inventory</span>`;
    const cancelIcon = `<span class="material-symbols-rounded">cancel</span>`;
    const sendIcon = `<span class="material-symbols-rounded">send</span>`;
    const pencilIcon = `<span class="material-symbols-rounded">edit</span>`;
    const plusIcon = `<span class="material-symbols-rounded">note_add</span>`;
    const insertIcon = `<span class="material-symbols-rounded">double_arrow</span>`;

    var lastChatId = undefined;
    var prompts = undefined;
    var promptList = ``;

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;
        const list = document.getElementById("qa-list");

        switch (message.type) {
            case "promptList":
                prompts = message.value;
                for (var k in prompts) {
                    const label_pre = k.replace(/([A-Z])/g, " $1");
                    const label = label_pre.charAt(0).toUpperCase() + label_pre.slice(1);
                    promptList += `<vscode-option value="${prompts[k]}">${label}</vscode-option>`;
                }
                break;
            case "addQuestion":
                document.getElementById("cover")?.classList?.add("hidden");
                var replaceElems = document.getElementsByClassName("replace");
                for (var e of replaceElems) {
                    e.remove();
                }
                const codehtml = message.code != null
                    ? marked.parse("```\n" + message.code + "\n```")
                    : "";

                var promptText = message.value;
                const edit = !message.send;
                if (promptText === "") {
                    for (var k in prompts) {
                        promptText = prompts[k];
                        break;
                    }
                }

                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 question-element-gnc relative  ${edit ? "replace" : ""}" style="background: var(--vscode-input-background)">
                        <h2 class="font-bold mb-5 flex text-xl gap-1">${userIcon}You</h2>
                        <no-export class="mb-5 flex items-center">
                            <button title="Edit and resend this prompt" class="resend-element-gnc p-0.5 flex items-center rounded-lg text-base absolute right-4 top-4 ${edit ? "hidden" : ""}">${pencilIcon}</button>
                            <div class="${edit ? "" : "hidden"} send-cancel-elements-gnc flex gap-2 absolute right-4" style="width: calc(100% - 32px);">
                                <vscode-dropdown style="width: 100%">${promptList}</vscode-dropdown>
                                <button title="Send this prompt" class="send-element-gnc p-0.5 rounded-lg flex items-center text-base">${sendIcon}</button>
                                <button title="Cancel" class="cancel-element-gnc p-0.5 rounded-lg flex items-center text-base">${cancelIcon}</button>
                            </div>
                        </no-export>
                        <p class="prompt leading-loose p-2" contenteditable=${edit}>${promptText}</p>
                        <div class="overflow-y-auto p-2">${codehtml}</div>
                    </div>`;

                if (!edit) {
                    document.getElementById("in-progress")?.classList?.remove("hidden");
                    document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
                }
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                break;
            case "stopResponse":
                {
                    document.getElementById("in-progress")?.classList?.add("hidden");
                    document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");

                    const chatText = document.getElementById(`${lastChatId}-text`);
                    lastChatId = undefined;
                    const markedResponse = new DOMParser().parseFromString(marked.parse(chatText.textContent + "\n\n"), "text/html");
                    const preCodeList = markedResponse.querySelectorAll("pre > code");

                    preCodeList.forEach((preCode, index) => {
                        preCode.parentElement.classList.add("pre-code-element", "relative");

                        if (index != preCodeList.length - 1) {
                            preCode.parentElement.classList.add("mb-8");
                        }

                        preCode.classList.add("block", "whitespace-pre", "overflow-x-scroll");

                        const buttonWrapper = document.createElement("div");
                        buttonWrapper.classList.add("code-actions-wrapper", "flex", "gap-2", "flex-wrap", "items-center", "right-2", "top-1", "absolute");

                        // Create copy to clipboard button
                        const copyButton = document.createElement("button");
                        copyButton.title = "Copy to clipboard";
                        copyButton.innerHTML = clipboardIcon;

                        copyButton.classList.add("code-element-gnc", "text-base", "p-0.5", "flex", "items-center", "rounded-lg");

                        const insert = document.createElement("button");
                        insert.title = "Insert the below code to the current file";
                        insert.innerHTML = insertIcon;

                        insert.classList.add("edit-element-gnc", "text-base", "p-0.5", "flex", "items-center", "rounded-lg");

                        const newTab = document.createElement("button");
                        newTab.title = "Create a new file with the below code";
                        newTab.innerHTML = plusIcon;

                        newTab.classList.add("new-code-element-gnc", "text-base", "p-0.5", "flex", "items-center", "rounded-lg");

                        buttonWrapper.append(copyButton, insert, newTab);

                        preCode.parentElement.prepend(buttonWrapper);
                    });
                    chatText.innerHTML = markedResponse.documentElement.innerHTML;
                    break;
                }
            case "addResponse": {
                var chat = document.getElementById(message.id);
                if (!chat) {
                    lastChatId = message.id;
                    chat = document.createElement("div");
                    chat.id = message.id;
                    chat.classList.add("p-4", "self-end", "mt-4", "pb-8", "answer-element-gnc");
                    chat.innerHTML = `<h2 class="font-bold mb-5 flex text-xl gap-1">${aiIcon}SenseCode</h2>
                                      <div id="${message.id}-text" class="flex flex-col gap-1 whitespace-pre-wrap"></div>`;
                    list.appendChild(chat);
                }
                const chatText = document.getElementById(`${message.id}-text`);
                chatText.textContent = chatText.textContent + message.value;
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                break;
            }
            case "addError":
                if (!list.innerHTML) {
                    return;
                }

                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 pb-8 error-element-gnc">
                        <h2 class="font-bold mb-5 flex text-xl gap-1">${aiIcon}SenseCode</h2>
                        <div class="text-red-400">${marked.parse("An error occurred\n\n> " + message.error)}</div>
                    </div>`;

                document.getElementById("in-progress")?.classList?.add("hidden");
                document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                break;
            case "clearQAList":
                clearQAList();
                break;
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

    document.addEventListener("change", (e) => {
        const question = e.target.closest(".question-element-gnc");

        const prompts = question.getElementsByClassName('prompt');
        prompts[0].textContent = e.target._value;
    });

    document.addEventListener("click", (e) => {
        const targetButton = e.target.closest('button');

        if (targetButton?.id === "clear-button") {
            e.preventDefault();
            clearQAList();
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

        if (targetButton?.classList?.contains("resend-element-gnc")) {
            e.preventDefault();
            const question = targetButton.closest(".question-element-gnc");
            const elements = targetButton.nextElementSibling;
            elements.classList.remove("hidden");
            const prompt = question.getElementsByClassName("prompt");
            prompt[0]?.setAttribute("contenteditable", true);

            targetButton.classList.add("hidden");

            return;
        }

        if (targetButton?.classList?.contains("send-element-gnc")) {
            e.preventDefault();

            const question = targetButton.closest(".question-element-gnc");
            const elements = targetButton.closest(".send-cancel-elements-gnc");
            const resendElement = targetButton.parentElement.parentElement.firstElementChild;
            elements.classList.add("hidden");
            resendElement.classList.remove("hidden");
            const prompt = question.getElementsByClassName("prompt");
            prompt[0]?.setAttribute("contenteditable", false);
            const code = question.querySelectorAll("pre > code");

            if (question.lastElementChild.textContent?.length > 0) {
                vscode.postMessage({
                    type: "addFreeTextQuestion",
                    value: prompt[0].textContent,
                    code: code[0].textContent,
                    send: true
                });
            }
            return;
        }

        if (targetButton?.classList?.contains("cancel-element-gnc")) {
            e.preventDefault();
            const question = targetButton.closest(".question-element-gnc");
            const elements = targetButton.closest(".send-cancel-elements-gnc");
            const resendElement = targetButton.parentElement.parentElement.firstElementChild;
            elements.classList.add("hidden");
            resendElement.classList.remove("hidden");
            question.lastElementChild?.setAttribute("contenteditable", false);
            document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");
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
