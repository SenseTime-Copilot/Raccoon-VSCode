export function getDocumentLanguage(documentLanguageId: string) {
  let lang = "";
  switch (documentLanguageId) {
    case "abap":
    case "css":
    case "html":
    case "json":
    case "php":
    case "scss":
    case "sass":
    case "sql":
    case "xml":
    case "xsl":
    case "yaml":
      lang = documentLanguageId.toUpperCase();
      break;
    case "clojure":
    case "c":
    case "coffeescript":
    case "diff":
    case "dockerfile":
    case "go":
    case "groovy":
    case "handlebars":
    case "haml":
    case "ini":
    case "java":
    case "less":
    case "lua":
    case "makefile":
    case "markdown":
    case "perl":
    case "perl6":
    case "python":
    case "r":
    case "razor":
    case "ruby":
    case "rust":
    case "slim":
    case "stylus":
    case "swift":
    case "vue":
      lang = documentLanguageId.charAt(0).toUpperCase() + documentLanguageId.slice(1);
      break;
    case "bat":
      lang = "Windows Bat";
      break;
    case "bibtex":
      lang = "BibTeX";
      break;
    case "cpp":
      lang = "C++";
      break;
    case "csharp":
      lang = "C#";
      break;
    case "dockercompose":
      lang = "Compose";
      break;
    case "cuda-cpp":
      lang = "CUDA C++";
      break;
    case "fsharp":
      lang = "F#";
      break;
    case "javascript":
      lang = "JavaScript";
      break;
    case "javascriptreact":
      lang = "JavaScript JSX";
      break;
    case "jsonc":
      lang = "JSON with Commnets";
      break;
    case "latex":
      lang = "LaTeX";
      break;
    case "objective-c":
      lang = "Objective-C";
      break;
    case "objective-cpp":
      lang = "Objective-C++";
      break;
    case "powershell":
      lang = "PowerShell";
      break;
    case "jade":
    case "pug":
      lang = "Pug";
      break;
    case "shaderlab":
      lang = "ShaderLab";
      break;
    case "shellscript":
      lang = "Shell Script (Bash)";
      break;
    case "typescript":
      lang = "TypeScript";
      break;
    case "typescriptreact":
      lang = "TypeScript JSX";
      break;
    case "tex":
      lang = "TeX";
      break;
    case "vb":
      lang = "Visual Basic";
      break;
    case "vue-html":
      lang = "Vue HTML";
      break;
    default:
      lang = "";
  }
  return lang;
}
