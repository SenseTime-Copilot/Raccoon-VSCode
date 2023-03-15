// @ts-nocheck

(function () {
    const vscode = acquireVsCodeApi();

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

    const aiSvg = `<span class="material-symbols-rounded">all_inclusive</span>`;
    const userSvg = `<span class="material-symbols-rounded">person</span>`;
    const clipboardSvg = `<span class="material-symbols-rounded">content_paste</span>`;
    const checkSvg = `<span class="material-symbols-rounded">inventory</span>`;
    const cancelSvg = `<span class="material-symbols-rounded">cancel</span>`;
    const sendSvg = `<span class="material-symbols-rounded">send</span>`;
    const pencilSvg = `<span class="material-symbols-rounded">edit</span>`;
    const plusSvg = `<span class="material-symbols-rounded">note_add</span>`;
    const insertSvg = `<span class="material-symbols-rounded">double_arrow</span>`;

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data;
        const list = document.getElementById("qa-list");

        switch (message.type) {
            case "addQuestion":
                const html = message.code != null
                    ? marked.parse(message.value + "\r\n\n\n```\n" + message.code + "\n```")
                    : message.value;

                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 question-element-gnc relative" style="background: var(--vscode-input-background)">
                        <h2 class="font-bold mb-5 flex text-xl gap-1">${userSvg}You</h2>
                        <no-export class="mb-5 flex items-center">
                            <button title="Edit and resend this prompt" class="resend-element-gnc p-0.5 flex items-center rounded-lg text-base absolute right-4 top-4">${pencilSvg}</button>
                            <div class="hidden send-cancel-elements-gnc flex gap-2 absolute right-6">
                                <button title="Send this prompt" class="send-element-gnc p-0.5 rounded-lg flex items-center text-base">${sendSvg}</button>
                                <button title="Cancel" class="cancel-element-gnc p-0.5 rounded-lg flex items-center text-base">${cancelSvg}</button>
                            </div>
                        </no-export>
                        <div class="overflow-y-auto">${html}</div>
                    </div>`;

                document.getElementById("in-progress")?.classList?.remove("hidden");
                document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                break;
            case "addResponse":
                document.getElementById("in-progress")?.classList?.add("hidden");
                document.getElementById("chat-button-wrapper")?.classList?.remove("hidden");

                const markedResponse = new DOMParser().parseFromString(marked.parse(message.value), "text/html");
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
                    copyButton.innerHTML = clipboardSvg;

                    copyButton.classList.add("code-element-gnc", "text-base", "p-0.5", "flex", "items-center", "rounded-lg");

                    const insert = document.createElement("button");
                    insert.title = "Insert the below code to the current file";
                    insert.innerHTML = insertSvg;

                    insert.classList.add("edit-element-gnc", "text-base", "p-0.5", "flex", "items-center", "rounded-lg");

                    const newTab = document.createElement("button");
                    newTab.title = "Create a new file with the below code";
                    newTab.innerHTML = plusSvg;

                    newTab.classList.add("new-code-element-gnc", "text-base", "p-0.5", "flex", "items-center", "rounded-lg");

                    buttonWrapper.append(copyButton, insert, newTab);

                    preCode.parentElement.prepend(buttonWrapper);
                });

                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 pb-8 answer-element-gnc">
                        <h2 class="font-bold mb-5 flex text-xl gap-1">${aiSvg}SenseCode</h2>
                        <div>${markedResponse.documentElement.innerHTML}</div>
                    </div>`;

                list.lastChild?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
                break;
            case "addError":
                if (!list.innerHTML) {
                    return;
                }

                list.innerHTML +=
                    `<div class="p-4 self-end mt-4 pb-8 error-element-gnc">
                        <h2 class="font-bold mb-5 flex">${aiSvg}SenseCode</h2>
                        <div class="text-red-400">${marked.parse("An error occurred.")}</div>
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

    const clearQAList = () => {
        document.getElementById("qa-list").innerHTML = "";

        document.getElementById("chat-button-wrapper")?.classList?.add("hidden");
    };

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
                targetButton.innerHTML = checkSvg;

                setTimeout(() => {
                    targetButton.innerHTML = clipboardSvg;
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
            question.lastElementChild?.setAttribute("contenteditable", true);

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
            question.lastElementChild?.setAttribute("contenteditable", false);

            if (question.lastElementChild.textContent?.length > 0) {
                vscode.postMessage({
                    type: "addFreeTextQuestion",
                    value: question.lastElementChild.textContent,
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
