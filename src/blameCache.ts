import * as vscode from 'vscode';
import { AuthorInfo } from './gitAuthorProvider';

/**
 * Git Blame缓存管理器
 * 
 * 职责：
 * 1. 管理Git blame信息的缓存
 * 2. 管理显示文本的缓存
 * 3. 管理修改行记录
 * 4. 提供缓存操作接口
 */
export class BlameCache {
    // 核心缓存映射
    private blameInfoMap: Map<number, AuthorInfo | null> = new Map();
    private gitBlameDisplayMap: Map<number, string> = new Map();
    private modifiedLines: Set<number> = new Set();

    /**
     * 获取指定行的Git blame信息
     */
    getBlameInfo(lineIndex: number): AuthorInfo | null | undefined {
        return this.blameInfoMap.get(lineIndex);
    }

    /**
     * 设置指定行的Git blame信息
     */
    setBlameInfo(lineIndex: number, authorInfo: AuthorInfo | null): void {
        this.blameInfoMap.set(lineIndex, authorInfo);
    }

    /**
     * 获取指定行的显示文本
     */
    getDisplayText(lineIndex: number): string | undefined {
        return this.gitBlameDisplayMap.get(lineIndex);
    }

    /**
     * 设置指定行的显示文本
     */
    setDisplayText(lineIndex: number, displayText: string): void {
        this.gitBlameDisplayMap.set(lineIndex, displayText);
    }

    /**
     * 检查指定行是否有blame信息
     */
    hasBlameInfo(lineIndex: number): boolean {
        return this.blameInfoMap.has(lineIndex);
    }

    /**
     * 检查指定行是否有显示文本
     */
    hasDisplayText(lineIndex: number): boolean {
        return this.gitBlameDisplayMap.has(lineIndex);
    }

    /**
     * 检查指定行是否被修改
     */
    isLineModified(lineIndex: number): boolean {
        return this.modifiedLines.has(lineIndex);
    }

    /**
     * 标记指定行为修改行
     */
    markLineAsModified(lineIndex: number): void {
        this.modifiedLines.add(lineIndex);
    }

    /**
     * 取消指定行的修改标记
     */
    unmarkLineAsModified(lineIndex: number): void {
        this.modifiedLines.delete(lineIndex);
    }

    /**
     * 获取所有修改行的迭代器
     */
    getModifiedLines(): IterableIterator<number> {
        return this.modifiedLines.values();
    }

    /**
     * 获取所有显示文本的条目
     */
    getDisplayTextEntries(): IterableIterator<[number, string]> {
        return this.gitBlameDisplayMap.entries();
    }

    /**
     * 删除指定行的所有缓存
     */
    deleteLine(lineIndex: number): void {
        this.blameInfoMap.delete(lineIndex);
        this.gitBlameDisplayMap.delete(lineIndex);
    }

    /**
     * 清除从指定行开始的所有缓存
     */
    clearFromLine(fromLine: number): void {
        const keysToDelete: number[] = [];
        
        // 收集需要删除的键
        for (const lineIndex of this.blameInfoMap.keys()) {
            if (lineIndex >= fromLine) {
                keysToDelete.push(lineIndex);
            }
        }

        for (const lineIndex of this.gitBlameDisplayMap.keys()) {
            if (lineIndex >= fromLine) {
                keysToDelete.push(lineIndex);
            }
        }

        // 删除缓存
        const uniqueKeys = [...new Set(keysToDelete)];
        for (const key of uniqueKeys) {
            this.deleteLine(key);
        }

        // console.log(`Cleared cache for ${uniqueKeys.length} lines from line ${fromLine}`);
    }

    /**
     * 清除指定范围的缓存
     */
    clearRange(startLine: number, endLine: number): void {
        for (let line = startLine; line <= endLine; line++) {
            this.deleteLine(line);
        }
        console.log(`Cleared cache for lines ${startLine}-${endLine}`);
    }

    /**
     * 清除所有缓存
     */
    clearAll(): void {
        this.blameInfoMap.clear();
        this.gitBlameDisplayMap.clear();
        console.log('Cleared all blame cache');
    }

    /**
     * 清除所有修改行记录
     */
    clearModifiedLines(): void {
        this.modifiedLines.clear();
        console.log('Cleared all modified lines');
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): { blameEntries: number; displayEntries: number; modifiedLines: number } {
        return {
            blameEntries: this.blameInfoMap.size,
            displayEntries: this.gitBlameDisplayMap.size,
            modifiedLines: this.modifiedLines.size
        };
    }

    /**
     * 获取可见区域的加载状态
     */
    getVisibleAreaLoadStatus(visibleRanges: readonly vscode.Range[]): { total: number; loaded: number; missing: number } {
        if (visibleRanges.length === 0) {
            return { total: 0, loaded: 0, missing: 0 };
        }

        const firstLine = visibleRanges[0].start.line;
        const lastLine = visibleRanges[visibleRanges.length - 1].end.line;
        const total = lastLine - firstLine + 1;
        let loaded = 0;

        for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex++) {
            if (this.hasBlameInfo(lineIndex)) {
                loaded++;
            }
        }

        return {
            total,
            loaded,
            missing: total - loaded
        };
    }
}
