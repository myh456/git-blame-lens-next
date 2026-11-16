import * as vscode from 'vscode';
import { getLogger } from './logger';
import { BlameCache } from './blameCache';

/**
 * 文档变化处理器
 * 
 * 职责：
 * 1. 监听文档内容变化
 * 2. 分析变化类型和影响范围
 * 3. 更新缓存和修改行记录
 * 4. 处理行号偏移问题
 */
export class DocumentChangeHandler {
    private cache: BlameCache;

    constructor(cache: BlameCache) {
        this.cache = cache;
    }

    /**
     * 处理文档变化事件
     */
    handleDocumentChange(change: vscode.TextDocumentContentChangeEvent): void {
        const { range, text } = change;
        const startLine = range.start.line;
        const endLine = range.end.line;

        getLogger().info(`Document change: line ${startLine}-${endLine}, text: "${text.substring(0, 50)}..."`);

        // 计算行数变化
        const linesDelta = this.calculateLinesDelta(change);

        if (linesDelta !== 0) {
            getLogger().info(`Lines delta: ${linesDelta}, clearing affected cache to ensure consistency`);
            // 有行号变化时，只清除受影响的范围，而不是从修改位置往下的所有内容
            const affectedStart = Math.max(0, startLine - 5);  // 向上清除5行
            const affectedEnd = startLine + Math.abs(linesDelta) + 10;  // 向下清除变化行数+10行
            this.cache.clearRange(affectedStart, affectedEnd);
        }

        // 标记真正被修改的行
        if (this.isLineContentModified(change)) {
            // 对于插入操作，标记插入位置的行
            if (linesDelta > 0) {
                for (let line = startLine; line < startLine + linesDelta; line++) {
                    this.cache.markLineAsModified(line);
                    getLogger().info(`Marked inserted line ${line} as modified`);
                }
            } else {
                // 对于其他修改，标记原始行
                for (let line = startLine; line <= endLine; line++) {
                    this.cache.markLineAsModified(line);
                    getLogger().info(`Marked line ${line} as modified`);
                }
            }
        }

        // 清除受影响区域的缓存（需要重新加载的行）
        const clearStart = Math.max(0, startLine - 1);
        const clearEnd = startLine + Math.max(Math.abs(linesDelta), endLine - startLine) + 1;

        this.cache.clearRange(clearStart, clearEnd);
        getLogger().info(`Cleared cache for lines ${clearStart}-${clearEnd}`);
    }

    /**
     * 计算文档变化导致的行数变化
     */
    private calculateLinesDelta(change: vscode.TextDocumentContentChangeEvent): number {
        const { range, text } = change;
        const startLine = range.start.line;
        const endLine = range.end.line;

        // 计算删除的行数
        const deletedLines = endLine - startLine;

        // 计算插入的行数（通过统计换行符）
        const insertedLines = (text.match(/\n/g) || []).length;

        const delta = insertedLines - deletedLines;
        getLogger().info(`Lines calculation: deleted=${deletedLines}, inserted=${insertedLines}, delta=${delta}`);

        return delta;
    }

    /**
     * 判断文档变化是否真正修改了行内容
     */
    private isLineContentModified(change: vscode.TextDocumentContentChangeEvent): boolean {
        const { range, text } = change;
        const startLine = range.start.line;
        const endLine = range.end.line;
        const startChar = range.start.character;
        const endChar = range.end.character;

        getLogger().info(`Change analysis: line ${startLine}-${endLine}, char ${startChar}-${endChar}, text: "${text}"`);

        // 情况1：纯换行操作（按回车键）
        if ((text === '\n' || text === '\r\n') && startLine === endLine && startChar === endChar) {
            getLogger().info('Pure newline insertion - not modifying original line');
            return false;
        }

        // 情况2：删除操作
        if (text === '') {
            // 删除整行（包括换行符）
            if (startChar === 0 && endLine > startLine) {
                getLogger().info('Deleting entire line(s) - not modifying other lines');
                return false;
            }
            // 在行内删除内容
            if (startLine === endLine && startChar < endChar) {
                getLogger().info('Deleting content within line - modifying line');
                return true;
            }
            // 删除跨行内容，起始行被修改
            if (startLine < endLine) {
                getLogger().info('Deleting across lines - modifying start line');
                return true;
            }
        }

        // 情况3：插入操作（非纯换行）
        if (startLine === endLine && startChar === endChar) {
            // 插入非空白文本
            if (text.trim() !== '' && text !== '\n' && text !== '\r\n') {
                getLogger().info('Inserting text within line - modifying line');
                return true;
            }
            // 插入只包含换行的文本（如粘贴多行）
            if (text.includes('\n') && text.trim() !== '') {
                getLogger().info('Inserting multi-line text - modifying start line');
                return true;
            }
        }

        // 情况4：替换操作
        if (startLine === endLine && startChar < endChar && text !== '') {
            getLogger().info('Replacing content within line - modifying line');
            return true;
        }

        // 情况5：跨行替换
        if (startLine < endLine && text !== '') {
            getLogger().info('Replacing across lines - modifying start line');
            return true;
        }

        getLogger().info('No line content modification detected');
        return false;
    }

    /**
     * 检测文档变化是否导致行号变化
     */
    hasLineNumberChanges(change: vscode.TextDocumentContentChangeEvent): boolean {
        return this.calculateLinesDelta(change) !== 0;
    }
}
