import * as vscode from 'vscode';
import { AuthorInfo } from './gitAuthorProvider';
import { BlameCache } from './blameCache';

/**
 * Git Blame装饰器管理器
 * 
 * 职责：
 * 1. 创建和管理VSCode装饰器类型
 * 2. 应用blame装饰到编辑器
 * 3. 生成显示文本和占位符
 * 4. 处理主题颜色适配
 */
export class BlameDecorator {
    private decorationType!: vscode.TextEditorDecorationType;           // 普通提交装饰器
    private recentDecorationType!: vscode.TextEditorDecorationType;     // 最近提交装饰器
    private emptyDecorationType!: vscode.TextEditorDecorationType;      // 空白行装饰器

    constructor() {
        this.createDecorationTypes();
    }

    /**
     * 创建装饰器类型
     */
    private createDecorationTypes(): void {
        // 通用装饰器样式配置
        const baseStyle = {
            margin: '0 12px 0 0',                    // 右边距8px，与代码分离
            width: 'auto',                          // 自动宽度
            textDecoration: 'none; font-size: 11px; font-family: monospace; white-space: nowrap; min-width: 150px; display: inline-block;'
        };

        // 普通提交装饰器
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                ...baseStyle,
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                textDecoration: baseStyle.textDecoration + ' opacity: 0.7;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });

        // 最近提交装饰器（高亮）
        this.recentDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                ...baseStyle,
                color: new vscode.ThemeColor('editorWarning.foreground'),
                fontWeight: 'bold',
                textDecoration: baseStyle.textDecoration + ' opacity: 0.8;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });

        // 空白行装饰器（只显示占位符）
        this.emptyDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                ...baseStyle,
                color: new vscode.ThemeColor('editorLineNumber.foreground'),
                textDecoration: baseStyle.textDecoration + ' opacity: 0.5;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });
    }

    /**
     * 应用blame装饰器到编辑器
     */
    applyDecorations(editor: vscode.TextEditor, cache: BlameCache): void {
        const visibleRanges = editor.visibleRanges;
        if (visibleRanges.length === 0) {
            return;
        }

        const normalDecorations: vscode.DecorationOptions[] = [];
        const recentDecorations: vscode.DecorationOptions[] = [];
        const emptyDecorations: vscode.DecorationOptions[] = [];

        // 为所有可见行创建装饰器，确保对齐一致
        const firstLine = visibleRanges[0].start.line;
        const lastLine = visibleRanges[visibleRanges.length - 1].end.line;

        for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex++) {
            const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
            const authorInfo = cache.getBlameInfo(lineIndex);
            const displayText = cache.getDisplayText(lineIndex);

            if (authorInfo && displayText) {
                // 有Git信息的行
                const decoration: vscode.DecorationOptions = {
                    range,
                    renderOptions: {
                        before: {
                            contentText: displayText
                        }
                    },
                    hoverMessage: this.createHoverMessage(authorInfo)
                };

                if (this.isRecentCommit(authorInfo.date)) {
                    recentDecorations.push(decoration);
                } else {
                    normalDecorations.push(decoration);
                }
            } else {
                // 没有Git信息的行（修改行、新增行等）- 添加空白占位符保持对齐
                const emptyDecoration: vscode.DecorationOptions = {
                    range,
                    renderOptions: {
                        before: {
                            contentText: this.generateEmptyPlaceholder()
                        }
                    }
                };
                emptyDecorations.push(emptyDecoration);
            }
        }

        // 应用所有装饰器到编辑器
        editor.setDecorations(this.decorationType, normalDecorations);
        editor.setDecorations(this.recentDecorationType, recentDecorations);
        editor.setDecorations(this.emptyDecorationType, emptyDecorations);
    }

    /**
     * 清除所有装饰器
     */
    clearDecorations(editor: vscode.TextEditor): void {
        editor.setDecorations(this.decorationType, []);
        editor.setDecorations(this.recentDecorationType, []);
        editor.setDecorations(this.emptyDecorationType, []);
    }

    /**
     * 生成blame显示文本
     */
    generateBlameDisplayText(authorInfo: AuthorInfo): string {
        const formattedDate = this.formatDate(authorInfo.date);
        
        // 截断过长的作者名，保持显示整洁
        const authorName = authorInfo.author.length > 10
            ? authorInfo.author.substring(0, 8) + '..'
            : authorInfo.author;

        // 为最近3天内的提交添加星号标记
        const authorWithMark = this.isRecentCommit(authorInfo.date)
            ? `${authorName}*`
            : authorName;

        // 返回格式：日期 作者（去掉行号显示，减少视觉干扰）
        return `${formattedDate} ${authorWithMark}`;
    }

    /**
     * 生成空白占位符，保持代码对齐
     */
    private generateEmptyPlaceholder(): string {
        // 格式："MM-DD 作者名" 的典型长度
        // MM-DD = 5字符，空格 = 1字符，作者名 = 8字符，总计约14字符
        return '              '; // 14个空格
    }

    /**
     * 创建悬停提示信息
     */
    private createHoverMessage(authorInfo: AuthorInfo): vscode.MarkdownString {
        return new vscode.MarkdownString(
            `**Git Blame**\n\n` +
            `**作者:** ${authorInfo.author}\n\n` +
            `**时间:** ${authorInfo.date}\n\n` +
            `**提交:** \`${authorInfo.commit.substring(0, 8)}\`\n\n` +
            `**摘要:** ${authorInfo.summary}`
        );
    }

    /**
     * 格式化日期为简洁格式（包含年份）
     */
    private formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            const year = date.getFullYear().toString();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (error) {
            return dateString.substring(0, 10);
        }
    }

    /**
     * 判断是否是最近的提交（3天内）
     */
    private isRecentCommit(dateString: string): boolean {
        try {
            const commitDate = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - commitDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 3;
        } catch (error) {
            return false;
        }
    }

    /**
     * 释放装饰器资源
     */
    dispose(): void {
        this.decorationType.dispose();
        this.recentDecorationType.dispose();
        this.emptyDecorationType.dispose();
    }
}
