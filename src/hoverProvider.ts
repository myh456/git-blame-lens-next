import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class HoverProvider implements vscode.HoverProvider {
    private gitAuthorProvider: GitAuthorProvider;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | null> {
        const config = vscode.workspace.getConfiguration('gitAuthor');
        if (!config.get('showOnHover', true)) {
            return null;
        }

        try {
            const lineNumber = position.line + 1;
            const authorInfo = await this.gitAuthorProvider.getAuthorInfo(
                document.uri.fsPath,
                lineNumber
            );

            if (!authorInfo || token.isCancellationRequested) {
                return null;
            }

            return this.createHover(authorInfo);
        } catch (error) {
            console.error('Error in hover provider:', error);
            return null;
        }
    }

    private createHover(authorInfo: AuthorInfo): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        // 添加标题
        markdown.appendMarkdown(`### $(git-commit) Git 提交信息\n\n`);

        // 创建信息表格
        markdown.appendMarkdown(`| | |\n`);
        markdown.appendMarkdown(`|---|---|\n`);
        markdown.appendMarkdown(`| $(person) **作者** | ${authorInfo.author} |\n`);
        markdown.appendMarkdown(`| $(mail) **邮箱** | ${authorInfo.email} |\n`);
        markdown.appendMarkdown(`| $(git-commit) **提交** | \`${authorInfo.commit.substring(0, 12)}\` |\n`);
        markdown.appendMarkdown(`| $(clock) **时间** | ${authorInfo.date} |\n`);
        markdown.appendMarkdown(`| $(note) **摘要** | ${authorInfo.summary} |\n`);
        markdown.appendMarkdown(`| $(location) **行号** | ${authorInfo.line} |\n\n`);

        // 添加操作按钮
        const showFullCommitCommand = `command:git-author.showFullCommit?${encodeURIComponent(JSON.stringify([authorInfo.commit]))}`;
        markdown.appendMarkdown(`[$(diff) 查看文件差异](${showFullCommitCommand})`);

        return new vscode.Hover(markdown);
    }
}
