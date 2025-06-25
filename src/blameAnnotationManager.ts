import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class BlameAnnotationManager implements vscode.Disposable {
    private gitAuthorProvider: GitAuthorProvider;
    private decorationType: vscode.TextEditorDecorationType;
    private isActive = false;
    private currentEditor: vscode.TextEditor | undefined;
    private decorations: vscode.DecorationOptions[] = [];
    private blameInfoMap: Map<number, AuthorInfo> = new Map(); // 存储每行的blame信息

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
        
        // 创建装饰器类型 - 使用before属性在行号区域显示
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: '',
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
                fontWeight: 'normal',
                margin: '0 1em 0 0',
                width: '25em', // 固定宽度
                textDecoration: 'none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            isWholeLine: false
        });
    }

    async toggle(): Promise<void> {
        this.isActive = !this.isActive;
        
        if (this.isActive) {
            await this.showBlameAnnotations();
            vscode.window.showInformationMessage('Git Blame 注释已开启');
        } else {
            this.hideBlameAnnotations();
            vscode.window.showInformationMessage('Git Blame 注释已关闭');
        }
    }

    private async showBlameAnnotations(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        this.currentEditor = editor;
        const document = editor.document;
        
        // 显示进度
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "正在获取 Git Blame 信息...",
            cancellable: true
        }, async (progress, token) => {
            const decorations: vscode.DecorationOptions[] = [];
            const lineCount = Math.min(document.lineCount, 500); // 限制处理行数以提高性能
            
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
                        document.uri.fsPath,
                        lineIndex + 1
                    );

                    if (authorInfo && !token.isCancellationRequested) {
                        // 存储blame信息
                        this.blameInfoMap.set(lineIndex, authorInfo);
                        const decoration = this.createDecoration(authorInfo, lineIndex);
                        decorations.push(decoration);
                    }
                } catch (error) {
                    console.error(`Error getting blame info for line ${lineIndex + 1}:`, error);
                }
            }

            if (!token.isCancellationRequested && this.isActive) {
                this.decorations = decorations;
                editor.setDecorations(this.decorationType, decorations);
            }
        });
    }

    private createDecoration(authorInfo: AuthorInfo, lineIndex: number): vscode.DecorationOptions {
        const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
        const shortCommit = authorInfo.commit.substring(0, 8);
        const formattedDate = this.formatDate(authorInfo.date);

        // 创建显示文本，限制长度以避免过长
        const authorName = authorInfo.author.length > 12
            ? authorInfo.author.substring(0, 9) + '...'
            : authorInfo.author;

        const contentText = `${authorName} • ${formattedDate} • ${shortCommit}`;

        const decoration: vscode.DecorationOptions = {
            range,
            renderOptions: {
                before: {
                    contentText,
                    color: new vscode.ThemeColor('editorCodeLens.foreground'),
                    fontStyle: 'italic',
                    margin: '0 1em 0 0',
                    width: '25em',
                    textDecoration: 'none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;'
                }
            },
            hoverMessage: new vscode.MarkdownString(
                `**Git Blame 信息**\n\n` +
                `**作者:** ${authorInfo.author}\n\n` +
                `**邮箱:** ${authorInfo.email}\n\n` +
                `**时间:** ${authorInfo.date}\n\n` +
                `**提交:** \`${authorInfo.commit}\`\n\n` +
                `**摘要:** ${authorInfo.summary}\n\n` +
                `*点击此区域查看完整提交信息*`
            )
        };

        return decoration;
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

    private hideBlameAnnotations(): void {
        if (this.currentEditor) {
            this.currentEditor.setDecorations(this.decorationType, []);
        }
        this.decorations = [];
        this.blameInfoMap.clear();
    }

    // 处理点击事件 - 只有点击在行首（blame注释区域）才响应
    async handleClick(position: vscode.Position): Promise<void> {
        if (!this.isActive || !this.currentEditor) {
            return;
        }

        // 只有当点击位置在行首（字符位置0-2）时才认为是点击了blame注释
        if (position.character > 2) {
            return;
        }

        const lineIndex = position.line;

        try {
            const authorInfo = await this.gitAuthorProvider.getAuthorInfo(
                this.currentEditor.document.uri.fsPath,
                lineIndex + 1
            );

            if (authorInfo) {
                // 在终端中显示完整的git log
                const terminal = vscode.window.createTerminal('Git Log');
                terminal.sendText(`git show ${authorInfo.commit} --stat`);
                terminal.show();

                vscode.window.showInformationMessage(
                    `查看提交 ${authorInfo.commit.substring(0, 8)} 的详细信息`
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage('无法获取提交信息');
            console.error('Error showing commit:', error);
        }
    }

    dispose(): void {
        this.hideBlameAnnotations();
        this.decorationType.dispose();
    }
}
