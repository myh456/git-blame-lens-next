import * as vscode from 'vscode';
import * as path from 'path';
import { initLogger, getLogger } from './logger';
import { GitAuthorProvider } from './gitAuthorProvider';
import { StatusBarManager } from './statusBarManager';
import { HoverProvider } from './hoverProvider';
import { HintsProvider } from './hintsProvider';
import { BlameDecorationManager } from './blameDecorationManager';

export function activate(context: vscode.ExtensionContext) {
    initLogger(context);
    getLogger().info('Git Blame Lens Next extension is now active!');

    vscode.commands.executeCommand('setContext', 'gitBlameLens.blameActive', false);

    const gitAuthorProvider = new GitAuthorProvider();
    const statusBarManager = new StatusBarManager(gitAuthorProvider);
    const hoverProvider = new HoverProvider(gitAuthorProvider);
    const hintsProvider = new HintsProvider(gitAuthorProvider);
    const blameDecorationManager = new BlameDecorationManager(gitAuthorProvider);

    context.subscriptions.push(
        registerCommands(blameDecorationManager),
        vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
        vscode.languages.registerInlayHintsProvider({ scheme: 'file' }, hintsProvider),
        vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('gitBlameLens.blameInfoType')) {
                // 直接刷新InlayHint
                hintsProvider.refresh();
            }
            if (e.affectsConfiguration('gitBlameLens.blameAnnotationWidth')) {
                // TODO:重建装饰器
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (e.textEditor === vscode.window.activeTextEditor) {
                statusBarManager.updateStatusBar(e.textEditor);
                hintsProvider.refresh();
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
    // 镜像 gitBlameLens.blameActive 的状态
    let blameActive = false;

    return vscode.Disposable.from(

        vscode.commands.registerCommand('gitBlameLens.showFullCommit', async (commitHash: string) => {
            if (!commitHash) {
                vscode.window.showErrorMessage('无效的提交哈希');
                return;
            }

            await openCommitInVSCodeGit(commitHash);
        }),

        vscode.commands.registerCommand('gitBlameLens.showBlameAnnotations', async () => {
            await vscode.commands.executeCommand('setContext', 'gitBlameLens.blameActive', true);
            await blameDecorationManager.show();
            blameActive = true;
        }),

        vscode.commands.registerCommand('gitBlameLens.hideBlameAnnotations', async () => {
            await vscode.commands.executeCommand('setContext', 'gitBlameLens.blameActive', false);
            await blameDecorationManager.hide();
            blameActive = false;
        }),

        vscode.commands.registerCommand('gitBlameLens.refreshBlameAnnotations', async () => {
            await blameDecorationManager.refresh();
        }),

        vscode.commands.registerCommand('gitBlameLens.toggleBlameAnnotations', async () => {
            const cmd = blameActive
                ? 'gitBlameLens.hideBlameAnnotations'
                : 'gitBlameLens.showBlameAnnotations';
            await vscode.commands.executeCommand(cmd);
        }),
    );
}

/**
 * 使用 Git 扩展的 API 打开指定提交的 diff 视图
 */
async function openCommitInVSCodeGit(commitHash: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const fileUri = editor.document.uri;
    if (fileUri.scheme !== 'file') {
        getLogger().error('仅支持本地文件');
        return;
    }

    const targetLine = editor.selection.active.line;
    const fileName = path.basename(fileUri.fsPath);

    try {
        // 把file URI转成指向某rev的git URI
        const toGitUri = (ref: string) =>
            fileUri.with({
                scheme: 'git',
                query: JSON.stringify({ path: fileUri.fsPath, ref })
            });

        // 比较父提交与当前提交
        const leftUri = toGitUri(`${commitHash}^`);
        const rightUri = toGitUri(commitHash);

        const short = commitHash.substring(0, 8);
        const title = `${fileName} · ${short} 的改动`;

        const opts: vscode.TextDocumentShowOptions = {
            viewColumn: vscode.ViewColumn.Active,
            preview: false
        };

        try {
            await vscode.commands.executeCommand(
                'vscode.diff', leftUri, rightUri, title, opts
            );
        } catch (err) {
            // 该文件不存在父提交，降级为空白文件与该提交
            await vscode.commands.executeCommand(
                'vscode.diff',
                vscode.Uri.parse('untitled:empty'),
                rightUri,
                `${fileName} · ${short}（首次引入）`,
                opts
            );
        }

        // 等待diff编辑器成为活动编辑器
        await new Promise(resolve => setTimeout(resolve, 200));
        const diffEditor = vscode.window.activeTextEditor;
        if (!diffEditor) return;

        // 滚动到目标行
        const line = Math.min(targetLine, diffEditor.document.lineCount - 1);
        if (line >= 0) {
            const pos = new vscode.Position(line, 0);
            const range = new vscode.Range(pos, pos);
            diffEditor.selection = new vscode.Selection(pos, pos);
            diffEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    } catch (err) {
        vscode.window.showErrorMessage(`无法打开提交差异: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export function deactivate() {
    getLogger().info('Git Blame Lens Next extension is now deactivated!');
}
