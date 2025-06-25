import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class BlameTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly authorInfo: AuthorInfo,
        public readonly lineNumber: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = this.createTooltip();
        this.contextValue = 'blameItem';
        this.command = {
            command: 'git-author.showCommitFromTree',
            title: '查看提交详情',
            arguments: [this.authorInfo.commit, this.lineNumber]
        };
    }

    private createTooltip(): string {
        return `作者: ${this.authorInfo.author}\n` +
               `邮箱: ${this.authorInfo.email}\n` +
               `时间: ${this.authorInfo.date}\n` +
               `提交: ${this.authorInfo.commit}\n` +
               `摘要: ${this.authorInfo.summary}`;
    }
}

export class BlameTreeProvider implements vscode.TreeDataProvider<BlameTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BlameTreeItem | undefined | null | void> = new vscode.EventEmitter<BlameTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BlameTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private gitAuthorProvider: GitAuthorProvider;
    private blameData: Map<number, AuthorInfo> = new Map();
    private currentFile: string | undefined;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BlameTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BlameTreeItem): Promise<BlameTreeItem[]> {
        if (!element) {
            // 根节点，返回所有blame信息
            const items: BlameTreeItem[] = [];
            
            for (const [lineNumber, authorInfo] of this.blameData) {
                const formattedDate = this.formatDate(authorInfo.date);
                const shortCommit = authorInfo.commit.substring(0, 8);
                const isRecent = this.isRecentCommit(authorInfo.date);
                const recentMark = isRecent ? ' *' : '';
                
                const label = `${lineNumber}: ${formattedDate} ${authorInfo.author}${recentMark} (${shortCommit})`;
                
                const item = new BlameTreeItem(
                    label,
                    authorInfo,
                    lineNumber,
                    vscode.TreeItemCollapsibleState.None
                );
                
                items.push(item);
            }
            
            return items.sort((a, b) => a.lineNumber - b.lineNumber);
        }
        
        return [];
    }

    async loadBlameData(filePath: string): Promise<void> {
        this.currentFile = filePath;
        this.blameData.clear();

        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const lineCount = Math.min(document.lineCount, 200); // 限制处理行数

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在加载 Git Blame 信息...",
                cancellable: true
            }, async (progress, token) => {
                for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    progress.report({
                        increment: (100 / lineCount),
                        message: `处理第 ${lineIndex + 1}/${lineCount} 行`
                    });

                    try {
                        const authorInfo = await this.gitAuthorProvider.getAuthorInfo(
                            filePath,
                            lineIndex + 1
                        );

                        if (authorInfo && !token.isCancellationRequested) {
                            this.blameData.set(lineIndex + 1, authorInfo);
                        }
                    } catch (error) {
                        console.error(`Error getting blame info for line ${lineIndex + 1}:`, error);
                    }
                }
            });

            this.refresh();
        } catch (error) {
            console.error('Error loading blame data:', error);
            vscode.window.showErrorMessage('加载Git Blame信息失败');
        }
    }

    getBlameInfo(lineNumber: number): AuthorInfo | undefined {
        return this.blameData.get(lineNumber);
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
                return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
            }
        } catch (error) {
            return dateString;
        }
    }

    private isRecentCommit(dateString: string): boolean {
        try {
            const commitDate = new Date(dateString);
            const now = new Date();
            const diffMs = now.getTime() - commitDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return diffDays <= 3; // 3天内的提交认为是最近的
        } catch (error) {
            return false;
        }
    }
}
