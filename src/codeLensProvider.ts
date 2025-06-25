import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class GitAuthorCodeLensProvider implements vscode.CodeLensProvider {
    private gitAuthorProvider: GitAuthorProvider;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const config = vscode.workspace.getConfiguration('gitAuthor');
        if (!config.get('showCodeLens', true)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const lineCount = Math.min(document.lineCount, 1000); // 限制处理的行数以提高性能

        // 获取当前可见区域的行号范围
        const visibleRanges = vscode.window.activeTextEditor?.visibleRanges || [];
        const linesToProcess = new Set<number>();

        // 只处理可见区域的行
        for (const range of visibleRanges) {
            for (let line = range.start.line; line <= range.end.line && line < lineCount; line++) {
                linesToProcess.add(line);
            }
        }

        // 如果没有可见区域，处理前50行
        if (linesToProcess.size === 0) {
            for (let line = 0; line < Math.min(50, lineCount); line++) {
                linesToProcess.add(line);
            }
        }

        const promises = Array.from(linesToProcess).map(async (lineIndex) => {
            if (token.isCancellationRequested) {
                return null;
            }

            try {
                const authorInfo = await this.gitAuthorProvider.getAuthorInfo(
                    document.uri.fsPath,
                    lineIndex + 1
                );

                if (authorInfo && !token.isCancellationRequested) {
                    const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
                    const codeLens = new vscode.CodeLens(range);
                    
                    // 创建显示文本
                    const shortCommit = authorInfo.commit.substring(0, 8);
                    const displayText = `👤 ${authorInfo.author} • ${this.formatDate(authorInfo.date)} • ${shortCommit}`;
                    
                    codeLens.command = {
                        title: displayText,
                        command: 'git-author.showLineAuthorInfo',
                        arguments: [authorInfo, lineIndex + 1]
                    };

                    return codeLens;
                }
            } catch (error) {
                console.error(`Error getting author info for line ${lineIndex + 1}:`, error);
            }

            return null;
        });

        const results = await Promise.all(promises);
        return results.filter((codeLens): codeLens is vscode.CodeLens => codeLens !== null);
    }

    private formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return '今天';
            } else if (diffDays === 1) {
                return '昨天';
            } else if (diffDays < 7) {
                return `${diffDays}天前`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                return `${weeks}周前`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                return `${months}个月前`;
            } else {
                const years = Math.floor(diffDays / 365);
                return `${years}年前`;
            }
        } catch (error) {
            return dateString;
        }
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
