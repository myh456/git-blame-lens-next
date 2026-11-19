import * as vscode from 'vscode';
import { getLogger } from './logger';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private gitAuthorProvider: GitAuthorProvider;
    private isUpdating = false;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'gitBlameLens.showAuthor';
        this.statusBarItem.show();
    }

    async updateStatusBar(editor: vscode.TextEditor): Promise<void> {
        if (this.isUpdating) {
            return;
        }

        const config = vscode.workspace.getConfiguration('gitBlameLens');
        if (!config.get('showInStatusBar', true)) {
            this.hideStatusBar();
            return;
        }

        this.isUpdating = true;

        try {
            const line = editor.selection.active.line;
            const filePath = editor.document.uri.fsPath;

            // 显示加载状态
            this.statusBarItem.text = '获取Git信息...';
            this.statusBarItem.tooltip = '正在获取Git作者信息';

            const authorInfo = await this.gitAuthorProvider.getAuthorInfo(filePath, line + 1);

            if (authorInfo) {
                this.showAuthorInfo(authorInfo);
            } else {
                this.showNoInfo();
            }
        } catch (error) {
            getLogger().error('Error updating status bar:', error);
            this.showError();
        } finally {
            this.isUpdating = false;
        }
    }

    private showAuthorInfo(authorInfo: AuthorInfo): void {
        const shortCommit = authorInfo.commit.substring(0, 8);
        this.statusBarItem.text = `${authorInfo.author} (${shortCommit})`;

        const tooltip = new vscode.MarkdownString()
            .appendMarkdown(`**Git 作者信息**\n\n`)
            .appendMarkdown(`**作者:** ${authorInfo.author}\n\n`)
            .appendMarkdown(`**提交:** \`${authorInfo.commit}\`\n\n`)
            .appendMarkdown(`**时间:** ${authorInfo.date}\n\n`)
            .appendMarkdown(`**摘要:** ${authorInfo.summary}\n\n`)

        this.statusBarItem.tooltip = tooltip;
    }

    private showNoInfo(): void {
        this.statusBarItem.text = '无Git信息';
        this.statusBarItem.tooltip = '当前行没有Git提交信息';
    }

    private showError(): void {
        this.statusBarItem.text = 'Git错误';
        this.statusBarItem.tooltip = '获取Git信息时发生错误';
    }

    hideStatusBar(): void {
        this.statusBarItem.hide();
    }

    showStatusBar(): void {
        this.statusBarItem.show();
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
