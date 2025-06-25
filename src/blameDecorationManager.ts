import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class BlameDecorationManager implements vscode.Disposable {
    private gitAuthorProvider: GitAuthorProvider;
    private decorationType: vscode.TextEditorDecorationType;
    private recentDecorationType: vscode.TextEditorDecorationType;
    private isActive = false;
    private currentEditor: vscode.TextEditor | undefined;
    private blameInfoMap: Map<number, AuthorInfo> = new Map();

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;

        // 创建普通装饰器类型 - 固定宽度，统一布局，减少右侧留白
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'normal',
                fontWeight: 'normal',
                margin: '0 0 0 0',
                width: '18em', // 固定宽度确保统一
                textDecoration: 'none; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; padding-right: 0.5em;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });

        // 创建最近提交装饰器类型 - 稍微突出一些，同样的固定宽度
        this.recentDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                color: new vscode.ThemeColor('editorWarning.foreground'),
                fontStyle: 'normal',
                fontWeight: 'bold',
                margin: '0 0 0 0',
                width: '18em', // 固定宽度确保统一
                textDecoration: 'none; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; padding-right: 0.5em;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    async toggle(): Promise<void> {
        this.isActive = !this.isActive;

        console.log('Toggle blame decorations, isActive:', this.isActive);

        if (this.isActive) {
            await this.showBlameDecorations();
            vscode.window.showInformationMessage('Git Blame 注释已开启');
        } else {
            this.hideBlameDecorations();
            vscode.window.showInformationMessage('Git Blame 注释已关闭');
        }
    }

    async show(): Promise<void> {
        if (!this.isActive) {
            this.isActive = true;
            console.log('Show blame decorations');
            await this.showBlameDecorations();
            vscode.window.showInformationMessage('Git Blame 注释已开启');
        }
    }

    async hide(): Promise<void> {
        if (this.isActive) {
            this.isActive = false;
            console.log('Hide blame decorations');
            this.hideBlameDecorations();
            vscode.window.showInformationMessage('Git Blame 注释已关闭');
        }
    }

    get isBlameActive(): boolean {
        return this.isActive;
    }

    private async showBlameDecorations(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            console.log('No active editor');
            return;
        }

        console.log('Starting blame decorations for:', editor.document.fileName);
        this.currentEditor = editor;
        const document = editor.document;
        
        // 显示进度
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "正在获取 Git Blame 信息...",
            cancellable: true
        }, async (progress, token) => {
            const normalDecorations: vscode.DecorationOptions[] = [];
            const recentDecorations: vscode.DecorationOptions[] = [];
            const lineCount = Math.min(document.lineCount, 100);

            this.blameInfoMap.clear();
            console.log(`Processing ${lineCount} lines for blame info`);

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
                        console.log(`Got blame info for line ${lineIndex + 1}:`, authorInfo.author);
                        this.blameInfoMap.set(lineIndex, authorInfo);
                        const decoration = this.createDecoration(authorInfo, lineIndex);

                        // 判断是否是最近3天内的提交
                        if (this.isRecentCommit(authorInfo.date)) {
                            recentDecorations.push(decoration);
                        } else {
                            normalDecorations.push(decoration);
                        }
                    }
                } catch (error) {
                    console.error(`Error getting blame info for line ${lineIndex + 1}:`, error);
                }
            }

            if (!token.isCancellationRequested && this.isActive) {
                console.log(`Applying decorations: ${normalDecorations.length} normal, ${recentDecorations.length} recent`);
                editor.setDecorations(this.decorationType, normalDecorations);
                editor.setDecorations(this.recentDecorationType, recentDecorations);
            }
        });
    }

    private createDecoration(authorInfo: AuthorInfo, lineIndex: number): vscode.DecorationOptions {
        const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
        const formattedDate = this.formatDate(authorInfo.date);

        // 创建简洁的显示文本：提交人 时间，适配14em宽度
        const authorName = authorInfo.author.length > 8
            ? authorInfo.author.substring(0, 6) + '..'
            : authorInfo.author;

        // 如果是最近3天内的提交，在提交人后面加星号
        const authorWithMark = this.isRecentCommit(authorInfo.date)
            ? `${authorName}*`
            : authorName;

        // 格式：日期 作者，在末尾添加空字符来修复高亮问题
        const contentText = `${formattedDate} ${authorWithMark} `;

        const decoration: vscode.DecorationOptions = {
            range,
            renderOptions: {
                before: {
                    contentText,
                    color: new vscode.ThemeColor('editorCodeLens.foreground'),
                    fontStyle: 'normal',
                    fontWeight: 'normal',
                    margin: '0 0 0 0',
                    width: '18em', // 固定宽度确保统一
                    textDecoration: 'none; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; padding-right: 0.5em;'
                }
            },
            hoverMessage: new vscode.MarkdownString(
                `**Git Blame 信息**\n\n` +
                `**行号:** ${lineIndex + 1}\n\n` +
                `**作者:** ${authorInfo.author}\n\n` +
                `**邮箱:** ${authorInfo.email}\n\n` +
                `**时间:** ${authorInfo.date}\n\n` +
                `**提交:** \`${authorInfo.commit}\`\n\n` +
                `**摘要:** ${authorInfo.summary}\n\n` +
                `*右键菜单选择"显示提交详情"查看完整信息*`
            )
        };

        return decoration;
    }

    private formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            // 简单显示年月日格式：2024-01-15
            return date.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).replace(/\//g, '-');
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

    // 显示当前行的提交详情
    async showCurrentLineCommit(): Promise<void> {
        if (!this.isActive || !this.currentEditor) {
            vscode.window.showWarningMessage('请先开启Git Blame注释');
            return;
        }

        const position = this.currentEditor.selection.active;
        const lineIndex = position.line;

        const authorInfo = this.blameInfoMap.get(lineIndex);
        if (!authorInfo) {
            vscode.window.showInformationMessage('当前行没有Git提交信息');
            return;
        }

        // 在终端中显示完整的git log
        const terminal = vscode.window.createTerminal('Git Show');
        terminal.sendText(`git show ${authorInfo.commit} --stat`);
        terminal.show();

        vscode.window.showInformationMessage(
            `查看第${lineIndex + 1}行提交 ${authorInfo.commit.substring(0, 8)} 的详细信息`
        );
    }

    private hideBlameDecorations(): void {
        if (this.currentEditor) {
            this.currentEditor.setDecorations(this.decorationType, []);
            this.currentEditor.setDecorations(this.recentDecorationType, []);
        }
        this.blameInfoMap.clear();
    }

    // 当编辑器改变时更新装饰
    async onActiveEditorChanged(editor: vscode.TextEditor | undefined): Promise<void> {
        if (this.isActive && editor) {
            this.currentEditor = editor;
            await this.showBlameDecorations();
        }
    }

    dispose(): void {
        this.hideBlameDecorations();
        this.decorationType.dispose();
        this.recentDecorationType.dispose();
    }
}
