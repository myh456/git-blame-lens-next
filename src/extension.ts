import * as vscode from 'vscode';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
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
                await blameDecorationManager.onConfigurationChanged();
                await vscode.commands.executeCommand('gitBlameLens.refreshBlameAnnotations')
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
    const short = commitHash.substring(0, 8);

    const toGitUri = (ref: string) =>
        fileUri.with({
            scheme: 'git',
            query: JSON.stringify({ path: fileUri.fsPath, ref })
        });

    const opts: vscode.TextDocumentShowOptions = {
        viewColumn: vscode.ViewColumn.Active,
        preview: false
    };

    // 预检父提交下该文件是否存在
    const repoRoot = await getRepoRoot(fileUri.fsPath);
    if (!repoRoot) {
        getLogger().error('当前文件不在 Git 仓库中');
        return;
    }

    const parentRef = `${commitHash}^`;
    const hasParentVersion = await fileExistsAtRef(repoRoot, fileUri.fsPath, parentRef);
    getLogger().debug('showFullCommit: commit=%s parentExists=%s', short, hasParentVersion);

    let leftUri: vscode.Uri;
    let title: string;
    if (hasParentVersion) {
        leftUri = toGitUri(parentRef);
        title = `${fileName} · ${short} 的改动`;
    } else {
        // 首次引入：用空文档做左侧
        // NOTE：VSCODE文件至少包含一行，所以对比时会出现删除首行添加全文的效果，无法修改
        const emptyDoc = await vscode.workspace.openTextDocument({ content: '' });
        leftUri = emptyDoc.uri;
        title = `${fileName} · ${short}（首次引入）`;
    }

    try {
        await vscode.commands.executeCommand(
            'vscode.diff', leftUri, toGitUri(commitHash), title, opts
        );
    } catch (err) {
        // 命令本身失败
        getLogger().error('打开 diff 命令失败: %O', err);
        return;
    }

    // 滚动到原光标行
    await new Promise(r => setTimeout(r, 150));
    const ed = vscode.window.activeTextEditor;
    if (ed) {
        const line = Math.min(targetLine, ed.document.lineCount - 1);
        if (line >= 0) {
            const pos = new vscode.Position(line, 0);
            ed.selection = new vscode.Selection(pos, pos);
            ed.revealRange(
                new vscode.Range(pos, pos),
                vscode.TextEditorRevealType.InCenter
            );
        }
    }
}

const execFileAsync = promisify(execFile);

/** 获取文件所在仓库的根目录，失败返回 null */
async function getRepoRoot(filePath: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync(
            'git', ['-C', path.dirname(filePath), 'rev-parse', '--show-toplevel'],
            { windowsHide: true }
        );
        return stdout.trim() || null;
    } catch {
        return null;
    }
}

/** 检查 ref 下某文件是否存在 */
async function fileExistsAtRef(repoRoot: string, filePath: string, ref: string): Promise<boolean> {
    // git 需要 / 分隔的相对路径
    const rel = path.relative(repoRoot, filePath).split(path.sep).join('/');
    try {
        await execFileAsync(
            'git', ['-C', repoRoot, 'cat-file', '-e', `${ref}:${rel}`],
            { windowsHide: true }
        );
        return true;
    } catch {
        return false;
    }
}

export function deactivate() {
    getLogger().info('Git Blame Lens Next extension is now deactivated!');
}
