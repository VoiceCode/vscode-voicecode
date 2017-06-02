This is an VSCode package/plugin that lets VoiceCode http://voicecode.io control VSCode https://code.visualstudio.com/

It should be used together with the vscode package for voicecode: https://github.com/VoiceCode/vscode/

This integration is needed because many VoiceCode voice commands are more sophisticated than simply pressing keys or clicking the mouse. For example, a command that selects the next curly brace, or a command that extends the current selection(s) forward until the next comma, etc. It also enables synchronous bidirectional communication between VoiceCode and VSCode.

There is no setup needed, as the extension is automatically connected on startup.

## Known Issues

- If multiple windows of VSCode are open, the command will be executed in all of them