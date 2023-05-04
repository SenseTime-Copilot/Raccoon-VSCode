import * as vscode from 'vscode';

const LANG_IDS = new Map([
  ['bat', 'batch'],
  ['sh', 'shellscript'],
  ['c++', 'cpp'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['cs', 'csharp'],
  ['py', 'python'],
  ['py2', 'python'],
  ['py3', 'python'],
]);

const LANG_ABBREVS = new Map(
  Array.from(LANG_IDS.keys()).map(k => [LANG_IDS.get(k), k])
);

interface ICodeBlockStart {
  langId: string;
  indentation: string;
  fence: string;
}

/**
 * Note - the indented code block parsing is basic. It should only be applied inside lists, indentation should be consistent across lines and
 * between the start and end blocks, etc. This is good enough for typical use cases.
 */
function parseCodeBlockStart(line: string): ICodeBlockStart | null {
  const match = line.match(/(    |\t)?(```|~~~)\s*(\S*)/);
  return match && {
    indentation: match[1],
    fence: match[2],
    langId: match[3]
  };
}

function isCodeBlockStart(line: string): boolean {
  return !!parseCodeBlockStart(line);
}

function isCodeBlockEndLine(line: string, fence: string): boolean {
  return !!line.match(new RegExp('^\s*' + fence));
}

export function parseMarkdown(docContent: string): vscode.NotebookData {
  let metasec = docContent.match(/(?:^---+\s*)((?:.*$\n)*)(?:^---+\s*)/m);
  let metadata: { [key: string]: any } = {};
  if (metasec && docContent.startsWith(metasec[0])) {
    const metas = metasec[1].split(/\r?\n/g);
    for (let m of metas) {
      let meta = m.match(/(?:(.+)(?::))\s*(.*)/);
      if (meta) {
        metadata[meta[1]] = JSON.parse(meta[2]);
      }
    }
    docContent = docContent.slice(metasec[0].length);
    metadata['__raw__'] = metasec[1];
  }

  const lines = docContent.split(/\r?\n/g);
  let cells: vscode.NotebookCellData[] = [];
  let i = 0;

  // Each parse function starts with line i, leaves i on the line after the last line parsed
  for (; i < lines.length;) {
    const leadingWhitespace = i === 0 ? parseWhitespaceLines(true) : '';
    if (i >= lines.length) {
      break;
    }
    const codeBlockMatch = parseCodeBlockStart(lines[i]);
    if (codeBlockMatch) {
      parseCodeBlock(leadingWhitespace, codeBlockMatch);
    } else {
      parseMarkdownParagraph(leadingWhitespace);
    }
  }

  function parseWhitespaceLines(isFirst: boolean): string {
    let start = i;
    const nextNonWhitespaceLineOffset = lines.slice(start).findIndex(l => l !== '');
    let end: number; // will be next line or overflow
    let isLast = false;
    if (nextNonWhitespaceLineOffset < 0) {
      end = lines.length;
      isLast = true;
    } else {
      end = start + nextNonWhitespaceLineOffset;
    }

    i = end;
    const numWhitespaceLines = end - start + (isFirst || isLast ? 0 : 1);
    return '\n'.repeat(numWhitespaceLines);
  }

  function parseCodeBlock(leadingWhitespace: string, codeBlockStart: ICodeBlockStart): void {
    const language = LANG_IDS.get(codeBlockStart.langId) || codeBlockStart.langId;
    const startSourceIdx = ++i;
    while (true) {
      const currLine = lines[i];
      if (i >= lines.length) {
        break;
      } else if (isCodeBlockEndLine(currLine, codeBlockStart.fence)) {
        i++; // consume block end marker
        break;
      }

      i++;
    }

    const content = lines.slice(startSourceIdx, i - 1)
      .map(line => line.replace(new RegExp('^' + codeBlockStart.indentation), ''))
      .join('\n');
    const trailingWhitespace = parseWhitespaceLines(false);
    let cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, content, language);
    cell.metadata = {
      leadingWhitespace: leadingWhitespace,
      trailingWhitespace: trailingWhitespace,
      indentation: codeBlockStart.indentation
    };
    cells.push(cell);
  }

  function parseMarkdownParagraph(leadingWhitespace: string): void {
    const startSourceIdx = i;
    while (true) {
      if (i >= lines.length) {
        break;
      }

      const currLine = lines[i];
      if (currLine === '' || isCodeBlockStart(currLine)) {
        break;
      }

      i++;
    }

    const content = lines.slice(startSourceIdx, i).join('\n');
    const trailingWhitespace = parseWhitespaceLines(false);
    let cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, content, 'markdown');
    cell.metadata = {
      leadingWhitespace: leadingWhitespace,
      trailingWhitespace: trailingWhitespace,
    };
    cells.push(cell);
  }

  return { cells, metadata };
}

export function writeCellsToMarkdown(data: vscode.NotebookData): string {
  let result = '';
  if (data.metadata) {
    result += '---\n';
    result += `${data.metadata['__raw__']}`;
    result += '---\n';
  }
  let cells = data.cells;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (i === 0) {
      result += cell.metadata?.leadingWhitespace ?? '';
    }

    if (cell.kind === vscode.NotebookCellKind.Code) {
      const indentation = cell.metadata?.indentation || '';
      let languageAbbrev = LANG_ABBREVS.get(cell.languageId) ?? cell.languageId;
      const codePrefix = indentation + '```' + languageAbbrev + '\n';
      const contents = cell.value.split(/\r?\n/g)
        .map(line => indentation + line)
        .join('\n');
      const codeSuffix = '\n' + indentation + '```';

      result += codePrefix + contents + codeSuffix;
    } else {
      result += cell.value;
    }

    result += getBetweenCellsWhitespace(cells, i);
  }
  return result;
}

function getBetweenCellsWhitespace(cells: ReadonlyArray<vscode.NotebookCellData>, idx: number): string {
  const thisCell = cells[idx];
  const nextCell = cells[idx + 1];

  if (!nextCell) {
    return thisCell.metadata?.trailingWhitespace ?? '\n';
  }

  const trailing = thisCell.metadata?.trailingWhitespace;
  const leading = nextCell.metadata?.leadingWhitespace;

  if (typeof trailing === 'string' && typeof leading === 'string') {
    return trailing + leading;
  }

  // One of the cells is new
  const combined = (trailing ?? '') + (leading ?? '');
  if (!combined || combined === '\n') {
    return '\n\n';
  }

  return combined;
}
