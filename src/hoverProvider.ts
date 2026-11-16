import * as vscode from 'vscode';
import { getLogger } from './logger';
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
        const config = vscode.workspace.getConfiguration('gitBlameLens');
        if (config.get<string>('blameInfoType', 'InlayHints') !== 'HoverPopup') {
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
            getLogger().error('Error in hover provider:', error);
            return null;
        }
    }

    private createHover(authorInfo: AuthorInfo): vscode.Hover {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        // 添加标题
        markdown.appendMarkdown(`###Git提交信息\n\n`);

        // 创建信息表格
        markdown.appendMarkdown(`| | |\n|---|---|\n`);
        markdown.appendMarkdown(`|**作者：**| ${authorInfo.author} |\n`);
        markdown.appendMarkdown(`|**提交：**| \`${authorInfo.commit.substring(0, 12)}\` |\n`);
        markdown.appendMarkdown(`|**时间：**| ${authorInfo.date} |\n`);
        markdown.appendMarkdown(`|**摘要：**| ${authorInfo.summary} |\n\n`);

        // 添加操作按钮
        const showFullCommitCommand = `command:gitBlameLens.showFullCommit?${encodeURIComponent(JSON.stringify([authorInfo.commit]))}`;
        markdown.appendMarkdown(`[查看文件差异](${showFullCommitCommand})`);

        return new vscode.Hover(markdown);
    }
}
