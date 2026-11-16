import * as vscode from 'vscode';

let channel: vscode.LogOutputChannel | undefined;

export function initLogger(context: vscode.ExtensionContext): vscode.LogOutputChannel {
    channel ??= vscode.window.createOutputChannel('Git Blame Lens Next', { log: true });
    context.subscriptions.push(channel);
    return channel;
}

export function getLogger(): vscode.LogOutputChannel {
    if (!channel) throw new Error('Logger not initialized');
    return channel;
}