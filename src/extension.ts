import * as vscode from 'vscode';
import { GitAuthorProvider } from './gitAuthorProvider';
import { StatusBarManager } from './statusBarManager';
import { HoverProvider } from './hoverProvider';
import { BlameDecorationManager } from './blameDecorationManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Author extension is now active!');

    vscode.commands.executeCommand('setContext', 'git-author.blameActive', false);

    const gitAuthorProvider = new GitAuthorProvider();
    const statusBarManager = new StatusBarManager(gitAuthorProvider);
    const hoverProvider = new HoverProvider(gitAuthorProvider);
    const blameDecorationManager = new BlameDecorationManager(gitAuthorProvider);

    context.subscriptions.push(
        registerCommands(blameDecorationManager),
        vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (e.textEditor === vscode.window.activeTextEditor) {
                statusBarManager.updateStatusBar(e.textEditor);
            }
        }),
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            if (editor) {
                await statusBarManager.updateStatusBar(editor);
                await blameDecorationManager.onActiveEditorChanged(editor);
            } else {
                statusBarManager.hideStatusBar();
            }
        }),
        blameDecorationManager,
        statusBarManager
    );

    if (vscode.window.activeTextEditor) {
        statusBarManager.updateStatusBar(vscode.window.activeTextEditor);
    }
}

function registerCommands(
    blameDecorationManager: BlameDecorationManager
) {
    return vscode.Disposable.from(


        vscode.commands.registerCommand('git-author.showFullCommit', async (commitHash: string) => {
            if (!commitHash) {
                vscode.window.showErrorMessage('无效的提交哈希');
                return;
            }

            await openCommitInVSCodeGit(commitHash);
        }),



        vscode.commands.registerCommand('git-author.showBlameAnnotations', async () => {
            await blameDecorationManager.show();
            vscode.commands.executeCommand('setContext', 'git-author.blameActive', true);
        }),

        vscode.commands.registerCommand('git-author.hideBlameAnnotations', async () => {
            await blameDecorationManager.hide();
            vscode.commands.executeCommand('setContext', 'git-author.blameActive', false);
        }),

        vscode.commands.registerCommand('git-author.refreshBlameAnnotations', async () => {
            await blameDecorationManager.refresh();
        }),


    );
}

/**
 * 使用 Git 扩展的 API 打开指定提交的 diff 视图
 */
async function openCommitInVSCodeGit(commitHash: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const fileUrl = editor.document.uri;
    const fileName = fileUrl.path.split('/').pop() || fileUrl.path;

    // vscode.commands.executeCommand('git.openFile', fileUrl, commitHash);
    // vscode.commands.executeCommand('git.openChange', fileUrl, commitHash);

    vscode.commands.executeCommand('vscode.diff', vscode.Uri.parse(`git:${fileUrl.fsPath}?${encodeURIComponent(JSON.stringify({
        ref: commitHash,
        path: fileUrl.fsPath
    }))}`), fileUrl, `${fileName}(${commitHash.substring(0, 8)})↔${fileName}(working tree)`);
}

export function deactivate() {
    console.log('Git Author extension is now deactivated!');
}
