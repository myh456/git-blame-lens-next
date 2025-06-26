import * as vscode from 'vscode';
import { GitAuthorProvider } from './gitAuthorProvider';
import { StatusBarManager } from './statusBarManager';
import { HoverProvider } from './hoverProvider';
import { BlameDecorationManager } from './blameDecorationManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Author extension is now active!');

    // 初始化上下文状态
    vscode.commands.executeCommand('setContext', 'git-author.blameActive', false);

    const gitAuthorProvider = new GitAuthorProvider();
    const statusBarManager = new StatusBarManager(gitAuthorProvider);
    const hoverProvider = new HoverProvider(gitAuthorProvider);
    const blameDecorationManager = new BlameDecorationManager(gitAuthorProvider);

    // 注册命令
    const showAuthorCommand = vscode.commands.registerCommand('git-author.showAuthor', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('没有活动的编辑器');
            return;
        }

        const line = editor.selection.active.line;
        try {
            const authorInfo = await gitAuthorProvider.getAuthorInfo(editor.document.uri.fsPath, line + 1);

            if (authorInfo) {
                vscode.window.showInformationMessage(
                    `作者: ${authorInfo.author} | 提交: ${authorInfo.commit.substring(0, 8)} | 时间: ${authorInfo.date}`
                );
            } else {
                vscode.window.showInformationMessage('当前行没有Git提交信息');
            }
        } catch (error) {
            vscode.window.showErrorMessage('获取Git作者信息时发生错误');
            console.error('Error in showAuthor command:', error);
        }
    });

    // 显示完整提交信息的命令
    const showFullCommitCommand = vscode.commands.registerCommand('git-author.showFullCommit', async (commitHash: string) => {
        if (!commitHash) {
            vscode.window.showErrorMessage('无效的提交哈希');
            return;
        }

        try {
            const terminal = vscode.window.createTerminal('Git Show');
            terminal.sendText(`git show ${commitHash}`);
            terminal.show();
        } catch (error) {
            vscode.window.showErrorMessage('无法显示提交信息');
            console.error('Error showing commit:', error);
        }
    });

    // 清除缓存命令
    const clearCacheCommand = vscode.commands.registerCommand('git-author.clearCache', () => {
        gitAuthorProvider.clearCache();
        vscode.window.showInformationMessage('Git作者信息缓存已清除');
    });

    // 显示Git Blame注释命令
    const showBlameAnnotationsCommand = vscode.commands.registerCommand('git-author.showBlameAnnotations', async () => {
        await blameDecorationManager.show();
        vscode.commands.executeCommand('setContext', 'git-author.blameActive', true);
    });

    // 隐藏Git Blame注释命令
    const hideBlameAnnotationsCommand = vscode.commands.registerCommand('git-author.hideBlameAnnotations', async () => {
        await blameDecorationManager.hide();
        vscode.commands.executeCommand('setContext', 'git-author.blameActive', false);
    });

    // 刷新Git Blame注释命令
    const refreshBlameAnnotationsCommand = vscode.commands.registerCommand('git-author.refreshBlameAnnotations', async () => {
        await blameDecorationManager.refresh();
    });

    // 显示当前行提交详情命令
    const showCurrentLineCommitCommand = vscode.commands.registerCommand('git-author.showCurrentLineCommit',
        async () => {
            await blameDecorationManager.showCurrentLineCommit();
        }
    );

    // 显示行作者信息命令（从CodeLens点击触发）
    const showLineAuthorInfoCommand = vscode.commands.registerCommand('git-author.showLineAuthorInfo',
        async (authorInfo: any, lineNumber: number) => {
            const message = `第${lineNumber}行 - 作者: ${authorInfo.author} | 时间: ${authorInfo.date} | 提交: ${authorInfo.commit.substring(0, 8)}`;

            const action = await vscode.window.showInformationMessage(
                message,
                '查看完整提交',
                '复制提交哈希'
            );

            if (action === '查看完整提交') {
                const terminal = vscode.window.createTerminal('Git Show');
                terminal.sendText(`git show ${authorInfo.commit}`);
                terminal.show();
            } else if (action === '复制提交哈希') {
                await vscode.env.clipboard.writeText(authorInfo.commit);
                vscode.window.showInformationMessage('提交哈希已复制到剪贴板');
            }
        }
    );

    // 监听光标位置变化
    const onSelectionChange = vscode.window.onDidChangeTextEditorSelection(async (event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
            console.log('Selection changed, updating status bar for line:', event.textEditor.selection.active.line + 1);
            await statusBarManager.updateStatusBar(event.textEditor);
        }
    });

    // 监听活动编辑器变化
    const onActiveEditorChange = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            console.log('Active editor changed to:', editor.document.fileName);
            await statusBarManager.updateStatusBar(editor);
            await blameDecorationManager.onActiveEditorChanged(editor);
        } else {
            console.log('No active editor');
            statusBarManager.hideStatusBar();
        }
    });

    // 注册悬停提供者
    const hoverProviderDisposable = vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        hoverProvider
    );

    context.subscriptions.push(
        showAuthorCommand,
        showFullCommitCommand,
        clearCacheCommand,
        showLineAuthorInfoCommand,
        showBlameAnnotationsCommand,
        hideBlameAnnotationsCommand,
        refreshBlameAnnotationsCommand,
        showCurrentLineCommitCommand,
        onSelectionChange,
        onActiveEditorChange,
        hoverProviderDisposable,
        blameDecorationManager,
        statusBarManager
    );

    // 初始化状态栏
    if (vscode.window.activeTextEditor) {
        statusBarManager.updateStatusBar(vscode.window.activeTextEditor);
    }
}

export function deactivate() {
    console.log('Git Author extension is now deactivated!');
}
