const vscode = require('vscode');
const rpc = require('atomic_rpc');
const _ = require('lodash');
const helpers = require('./helpers');
// this method is called when your extension is activated

function activate(context) {
    const remote = new rpc({
        host: 'localhost',
        port: 7778,
        reconnect: true
    });

    remote.expose('executeCommand', (req) => {
        const command = req.command;
        const times = req.times || 1;
        const params = req.params || [];
        const args = [command].concat(params)

        for (var index = 0; index < times; index++) {
            vscode.commands.executeCommand.apply(null, args);
        }
    });

    // options: line?, cursorEnd?
    remote.expose('moveCursorToLine', (req) => {
        const options = req.options || {};

        const editor = vscode.window.activeTextEditor;

        let range = null;
        if (req.options.line) {
            range = editor.document.lineAt(req.options.line - 1).range;
        } else {
            range = editor.document.lineAt(editor.selection.active.line).range;
        }

        let active = null;
        let anchor = null;

        if (options.cursorEnd) {
            active = range.end;
            anchor = range.end;
        } else {
            active = range.start;
            anchor = range.start;
        }

        editor.selection = new vscode.Selection(active, anchor);
        editor.revealRange(range);
    });

    remote.expose('selectLines', (req) => {
        const options = req.options || {};
        const editor = vscode.window.activeTextEditor;

        let range = null;
        if (options.from && options.to) {
            let startRange = editor.document.lineAt(options.from - 1).range;
            let endRange = editor.document.lineAt(options.to - 1).range;

            if (startRange.start.isAfter(endRange.end)) {
                const temp = startRange;
                startRange = endRange;
                endRange = temp;
            }

            range = new vscode.Range(startRange.start, endRange.end);
        } else if (options.from) {
            range = editor.document.lineAt(options.from - 1).range;
        } else if (options.to) {
            let startRange = editor.document.lineAt(editor.selection.active.line).range;
            let endRange = editor.document.lineAt(options.to - 1).range;

            if (startRange.start.isAfter(endRange.end)) {
                const temp = startRange;
                startRange = endRange;
                endRange = temp;
            }

            range = new vscode.Range(startRange.start, endRange.end);
        } else {
            range = editor.document.lineAt(editor.selection.active.line).range;
        }


        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range);
    });

    remote.expose('expandSelectionToScope', (req) => {
        const editor = vscode.window.activeTextEditor;

        const selection = editor.selection;

        editor.selection = new vscode.Selection(findScopeStart(selection.active), findScopeEnd(selection.active));
    });

    remote.expose('insertFromLine', (req) => {
        const editor = vscode.window.activeTextEditor;

        if (req.options.line) {
            const range = editor.document.lineAt(req.options.line - 1).range;
            const selectedText = editor.document.getText(range);

            editor.edit((edition) => {
                edition.insert(editor.selection.active, selectedText);
            })
        }
    });

    remote.expose('selectBySurroundingCharacters', (req) => {
        const editor = vscode.window.activeTextEditor;
        const first = req.options.first;
        const last = req.options.last;
        const nextWord = req.options.nextWord || false;

        if (first && last) {
            if (nextWord) {
                const regex = new RegExp(`(^|\\W)${first}[\\w]+${last}($|\\W)`, "i");
                const range = new vscode.Range(editor.selection.active, editor.document.lineAt(editor.document.lineCount - 1).range.end);
                const match = editor.document.getText(range).match(regex);
                const wordPos = match.index + editor.document.offsetAt(editor.selection.active);

                const wordRange = editor.document.getWordRangeAtPosition(editor.document.positionAt(wordPos + 2));
                editor.selection = new vscode.Selection(wordRange.start, wordRange.end);
            } else {
                const regex = new RegExp(`(^|\\W)${last}[\\w]+${first}($|\\W)`, "i");
                const range = new vscode.Range(new vscode.Position(0, 0), editor.selection.active);

                const match = editor.document.getText(range).split("").reverse().join("").match(regex);
                const wordPos = editor.document.getText(range).length - match.index;

                const wordRange = editor.document.getWordRangeAtPosition(editor.document.positionAt(wordPos - 2));
                editor.selection = new vscode.Selection(wordRange.start, wordRange.end);
            }
        }
    });
    remote.expose('selectNextWord', (req) => {
        const backwards = _.get(req, 'options.backwards', null);
        const offset = backwards ? -1 : 1;
        const editor = vscode.window.activeTextEditor;
        const currentWordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
        const edgeOfWord = backwards ? currentWordRange.start : currentWordRange.end;
        const startPos = currentWordRange ? edgeOfWord : editor.selection.active;
        let nextWordRange = undefined;
        let nextWordPosition = startPos;
        while (nextWordRange === undefined) {                
            try {
                nextWordPosition = nextWordPosition.translate(0, offset);
            } catch (e) {
                nextWordPosition = editor.document.validatePosition(nextWordPosition.translate(offset, 0).with({ character: 9999 }));
            }
    
            if (nextWordPosition !== editor.document.validatePosition(nextWordPosition)) {
                nextWordPosition = nextWordPosition.translate(offset, 0).with({ character: 0 });
                if (nextWordPosition !== editor.document.validatePosition(nextWordPosition)) {
                    return;
                }

            }
            nextWordRange = editor.document.getWordRangeAtPosition(nextWordPosition);
        }
        editor.selection = new vscode.Selection(nextWordRange.start, nextWordRange.end);
    });

    remote.initialize();
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;

function findScopeStart(position) {
    const editor = vscode.window.activeTextEditor;
    const text = editor.document.getText();
    let index = editor.document.offsetAt(position);
    let brackets = 0;
    let braces = 0;
    let parentheses = 0;

    let q1 = 0;
    let q1Position = -1;

    let q2 = 0;
    let q2Position = -1;

    let q3 = 0;
    let q3Position = -1;

    while (index >= 0 && brackets <= 0 && braces <= 0 && parentheses <= 0) {
        const currentChar = text[index];

        switch (currentChar) {
            case '}':
                braces--;
                break;
            case ']':
                brackets--;
                break;
            case ')':
                parentheses--;
                break;
            case '{':
                braces++;
                break;
            case '[':
                brackets++;
                break;
            case '(':
                parentheses++;
                break;
            case '"':
                q1++;
                if (q1Position === -1) {
                    q1Position = index + 1;
                }
                break;
            case "'":
                q2++;
                if (q2Position === -1) {
                    q2Position = index + 1;
                }
                break;
            case '`':
                q3++;
                if (q3Position === -1) {
                    q3Position = index + 1;
                }
                break;
        }
        index--;
    }
    if (index < 0) {
        index = 0;
    } else {
        index = index + 2;
    }

    if (q1 % 2 === 1) {
        index = q1Position;
    } else if (q2 % 2 === 1) {
        index = q2Position;
    } else if (q3 % 2 === 1) {
        index = q3Position;
    }

    return editor.document.positionAt(index);
}

function findScopeEnd(position) {
    const editor = vscode.window.activeTextEditor;
    const text = editor.document.getText();
    let index = editor.document.offsetAt(position);
    let brackets = 0;
    let braces = 0;
    let parentheses = 0;

    let q1 = 0;
    let q1Position = -1;

    let q2 = 0;
    let q2Position = -1;

    let q3 = 0;
    let q3Position = -1;

    while (index < text.length && brackets <= 0 && braces <= 0 && parentheses <= 0) {
        const currentChar = text[index];

        switch (currentChar) {
            case '}':
                braces++;
                break;
            case ']':
                brackets++;
                break;
            case ')':
                parentheses++;
                break;
            case '{':
                braces--;
                break;
            case '[':
                brackets--;
                break;
            case '(':
                parentheses--;
                break;
            case '"':
                q1++;
                if (q1Position === -1) {
                    q1Position = index;
                }
                break;
            case "'":
                q2++;
                if (q2Position === -1) {
                    q2Position = index;
                }
                break;
            case '`':
                q3++;
                if (q3Position === -1) {
                    q3Position = index;
                }
                break;
        }
        index++;
    }
    if (index >= text.length) {
        index = text.length - 1;
    } else {
        index = index;
    }

    if (q1 % 2 === 1) {
        index = q1Position;
    } else if (q2 % 2 === 1) {
        index = q2Position;
    } else if (q3 % 2 === 1) {
        index = q3Position;
    }

    return editor.document.positionAt(index);
}