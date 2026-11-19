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
    private decorationType!: vscode.TextEditorDecorationType;
    private recentDecorationType!: vscode.TextEditorDecorationType;
    private emptyDecorationType!: vscode.TextEditorDecorationType;

    private currentWidth: string = '15em';  // 缓存当前宽度
    private maxDisplayChars: number = 14;   // 估算的字符容量

    constructor() {
        this.createDecorationTypes();
    }

    /**
     * 创建装饰器类型
     */
    private createDecorationTypes(): void {
        // 读配置
        const config = vscode.workspace.getConfiguration('gitBlameLens');
        this.currentWidth = config.get<string>('blameAnnotationWidth', '15em');
        this.maxDisplayChars = this.calcMaxChars(this.currentWidth);

        // 通用样式
        const baseStyle = {
            margin: '0 5px 0 0',
            width: this.currentWidth,
            textDecoration: 'none',
        };

        // 普通提交装饰器
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                ...baseStyle,
                color: new vscode.ThemeColor('editorCodeLens.foreground')
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });

        // 最近提交装饰器（高亮）
        this.recentDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                ...baseStyle,
                color: new vscode.ThemeColor('editorWarning.foreground'),
                fontWeight: 'bold'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });

        // 空白行装饰器（只显示占位符）
        this.emptyDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                ...baseStyle,
                color: new vscode.ThemeColor('editorLineNumber.foreground')
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
        const isRecent = this.isRecentCommit(authorInfo.date);
        const suffix = isRecent ? '*' : ' ';

        // 返回格式：日期 作者
        return this.truncateWithEllipsis(
            `${formattedDate}${suffix}${authorInfo.author}`,
            this.maxDisplayChars
        );
    }

    /**
     * 配置变更时重建所有装饰器类型
     */
    recreate(): void {
        // 清理所有可见编辑器上的旧装饰
        vscode.window.visibleTextEditors.forEach(editor => this.clearDecorations(editor));

        // 释放旧类型
        this.decorationType?.dispose();
        this.recentDecorationType?.dispose();
        this.emptyDecorationType?.dispose();

        // 用新配置重建
        this.createDecorationTypes();
    }

    /**
     * 生成空白占位符，保持代码对齐
     */
    private generateEmptyPlaceholder(): string {
        return ' ';
    }

    /**
     * 创建悬停提示信息
     */
    private createHoverMessage(authorInfo: AuthorInfo): vscode.MarkdownString {
        return new vscode.MarkdownString()
            .appendMarkdown(`**Git 作者信息**\n\n`)
            .appendMarkdown(`**作者:** ${authorInfo.author}\n\n`)
            .appendMarkdown(`**提交:** \`${authorInfo.commit}\`\n\n`)
            .appendMarkdown(`**时间:** ${authorInfo.date}\n\n`)
            .appendMarkdown(`**摘要:** ${authorInfo.summary}\n\n`);
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
            return `${year}/${month}/${day}`;
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
            const config = vscode.workspace.getConfiguration('gitBlameLens');
            return diffDays <= config.get<number>('recentCommitThreshold', 3);
        } catch (error) {
            return false;
        }
    }

    /**
     * 把 CSS 宽度字符串估算成"等宽字符数"
     */
    private calcMaxChars(widthStr: string): number {
        const m = widthStr.trim().match(/^(\d+(?:\.\d+)?)\s*(px|em|rem|ch|%)$/i);
        if (!m) return 14;

        const num = parseFloat(m[1]);
        const unit = m[2].toLowerCase();

        switch (unit) {
            case 'ch':
                return Math.max(1, Math.floor(num));
            case 'em':
            case 'rem':
                // 等宽字体 1 字符约 0.6em
                return Math.max(1, Math.floor(num / 0.6));
            case 'px':
                // 假设编辑器字号 14px，1 字符约 8.4px
                return Math.max(1, Math.floor(num / 8.4));
            case '%':
            default:
                return 14;
        }
    }

    /** 计算字符串的"显示宽度"（CJK 字符算 2） */
    private stringWidth(s: string): number {
        let w = 0;
        for (const ch of s) w += this.charWidth(ch);
        return w;
    }

    /** 单字符显示宽度 */
    private charWidth(ch: string): number {
        const code = ch.codePointAt(0) ?? 0;
        // 常见 CJK / 全角范围
        if (
            (code >= 0x1100 && code <= 0x115F) ||
            (code >= 0x2E80 && code <= 0xA4CF) ||
            (code >= 0xAC00 && code <= 0xD7A3) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFE30 && code <= 0xFE4F) ||
            (code >= 0xFF00 && code <= 0xFF60) ||
            (code >= 0xFFE0 && code <= 0xFFE6) ||
            (code >= 0x20000 && code <= 0x3FFFD)
        ) {
            return 2;
        }
        return 1;
    }

    /**
     * 按显示宽度截断，超出时追加省略号
     */
    private truncateWithEllipsis(text: string, maxWidth: number): string {
        if (this.stringWidth(text) <= maxWidth) return text;

        // 留 1 个字符给省略号
        const target = Math.max(0, maxWidth - 1);
        let w = 0;
        let out = '';
        for (const ch of text) {
            const cw = this.charWidth(ch);
            if (w + cw > target) break;
            out += ch;
            w += cw;
        }
        return out + '…';
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
