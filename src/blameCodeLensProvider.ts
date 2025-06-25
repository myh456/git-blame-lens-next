import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class BlameCodeLensProvider implements vscode.CodeLensProvider {
    private gitAuthorProvider: GitAuthorProvider;
    public isActive = false;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
    }

    setActive(active: boolean): void {
        this.isActive = active;
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (!this.isActive) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const lineCount = Math.min(document.lineCount, 500); // 限制处理的行数

        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            if (token.isCancellationRequested) {
                break;
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
                    const formattedDate = this.formatDate(authorInfo.date);
                    const authorName = authorInfo.author.length > 12 
                        ? authorInfo.author.substring(0, 9) + '...' 
                        : authorInfo.author;
                    
                    const displayText = `${authorName} • ${formattedDate} • ${shortCommit}`;
                    
                    codeLens.command = {
                        title: displayText,
                        command: 'git-author.showCommitDetails',
                        arguments: [authorInfo.commit, lineIndex + 1]
                    };

                    codeLenses.push(codeLens);
                }
            } catch (error) {
                console.error(`Error getting author info for line ${lineIndex + 1}:`, error);
            }
        }

        return codeLenses;
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
                return date.toLocaleDateString();
            }
        } catch (error) {
            return dateString;
        }
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
