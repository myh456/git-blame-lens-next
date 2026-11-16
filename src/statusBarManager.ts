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
            this.statusBarItem.text = '$(sync~spin) 获取Git信息...';
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
        this.statusBarItem.text = `$(person) ${authorInfo.author} (${shortCommit})`;

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**Git 作者信息**\n\n`);
        tooltip.appendMarkdown(`**作者:** ${authorInfo.author}\n\n`);
        tooltip.appendMarkdown(`**邮箱:** ${authorInfo.email}\n\n`);
        tooltip.appendMarkdown(`**提交:** \`${authorInfo.commit}\`\n\n`);
        tooltip.appendMarkdown(`**时间:** ${authorInfo.date}\n\n`);
        tooltip.appendMarkdown(`**摘要:** ${authorInfo.summary}\n\n`);
        tooltip.appendMarkdown(`**行号:** ${authorInfo.line}`);

        this.statusBarItem.tooltip = tooltip;
    }

    private showNoInfo(): void {
        this.statusBarItem.text = '$(question) 无Git信息';
        this.statusBarItem.tooltip = '当前行没有Git提交信息';
    }

    private showError(): void {
        this.statusBarItem.text = '$(error) Git错误';
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
