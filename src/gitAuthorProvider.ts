import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from './logger';
import { exec } from 'child_process';

export interface AuthorInfo {
    author: string;
    email: string;
    commit: string;
    date: string;
    summary: string;
    line: number;
}

export class GitAuthorProvider {
    private cache: Map<string, AuthorInfo | null> = new Map();
    private cacheTimeout = 5000; // 减少到5秒缓存，更快响应文件变化

    async getAuthorInfo(filePath: string, lineNumber: number): Promise<AuthorInfo | null> {
        const cacheKey = `${filePath}:${lineNumber}`;

        // 检查文件是否有未保存的修改
        const hasUnsavedChanges = await this.hasUnsavedChanges(filePath);

        // 如果文件有未保存的修改，不使用缓存，直接查询
        if (!hasUnsavedChanges && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) || null;
        }

        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
            if (!workspaceFolder) {
                return null;
            }

            const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
            const authorInfo = await this.executeGitBlame(workspaceFolder.uri.fsPath, relativePath, lineNumber);

            // 只有在文件没有未保存修改时才缓存结果
            if (!hasUnsavedChanges) {
                this.cache.set(cacheKey, authorInfo);

                // 设置缓存过期
                setTimeout(() => {
                    this.cache.delete(cacheKey);
                }, this.cacheTimeout);
            }

            return authorInfo;
        } catch (error) {
            getLogger().error('Error getting Git Blame Lens Next info:', error);
            // 有未保存修改时不缓存错误结果
            if (!hasUnsavedChanges) {
                this.cache.set(cacheKey, null);
            }
            return null;
        }
    }

    /**
     * 检查文件是否有未保存的修改
     */
    private async hasUnsavedChanges(filePath: string): Promise<boolean> {
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
        return document ? document.isDirty : false;
    }

    /**
     * 清除指定文件的所有缓存
     * 当文件被修改或保存时调用
     */
    clearFileCache(filePath: string): void {
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${filePath}:`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
        getLogger().info(`Cleared ${keysToDelete.length} cache entries for file: ${filePath}`);
    }

    /**
     * 清除所有缓存
     */
    clearAllCache(): void {
        const size = this.cache.size;
        this.cache.clear();
        getLogger().info(`Cleared all ${size} cache entries`);
    }

    private executeGitBlame(workingDir: string, filePath: string, lineNumber: number): Promise<AuthorInfo | null> {
        return new Promise((resolve) => {
            // 使用git blame获取指定行的信息
            // 添加 --show-stats 来获取更详细的信息
            const command = `git blame -L ${lineNumber},${lineNumber} --porcelain "${filePath}"`;

            exec(command, { cwd: workingDir }, (error, stdout, stderr) => {
                if (error) {
                    getLogger().info(`Git blame error for line ${lineNumber}:`, error.message);
                    if (error.message.includes('not a git repository') ||
                        error.message.includes('no such file or directory') ||
                        error.message.includes('no such path') ||
                        error.message.includes('fatal: no such path')) {
                        resolve(null);
                        return;
                    }
                    // 对于新增行或未提交的行，git blame会返回错误，这是正常的
                    resolve(null);
                    return;
                }

                if (stderr) {
                    // 如果stderr包含关于未提交行的信息，也返回null
                    if (stderr.includes('has only') || stderr.includes('beyond end of file')) {
                        resolve(null);
                        return;
                    }
                }

                try {
                    const authorInfo = this.parseGitBlameOutput(stdout, lineNumber);
                    resolve(authorInfo);
                } catch (parseError) {
                    getLogger().error(`Parse error for line ${lineNumber}:`, parseError);
                    resolve(null);
                }
            });
        });
    }

    private parseGitBlameOutput(output: string, lineNumber: number): AuthorInfo | null {
        if (!output || output.trim() === '') {
            return null;
        }

        const lines = output.split('\n');
        if (lines.length === 0) {
            return null;
        }

        let commit = '';
        let author = '';
        let email = '';
        let date = '';
        let summary = '';

        for (const line of lines) {
            if (line.match(/^[0-9a-f]{40}/)) {
                // 提交哈希行
                commit = line.split(' ')[0];
            } else if (line.startsWith('author ')) {
                author = line.substring(7);
            } else if (line.startsWith('author-mail ')) {
                email = line.substring(12).replace(/[<>]/g, '');
            } else if (line.startsWith('author-time ')) {
                const timestamp = parseInt(line.substring(12));
                if (!isNaN(timestamp)) {
                    date = new Date(timestamp * 1000).toLocaleString();
                }
            } else if (line.startsWith('summary ')) {
                summary = line.substring(8);
            }
        }

        // 检查是否是未提交的行（全0哈希或空哈希）
        if (!commit ||
            commit === '0000000000000000000000000000000000000000' ||
            commit.match(/^0+$/)) {
            return null;
        }

        // 确保必要字段都存在
        if (!author || !date) {
            return null;
        }

        return {
            author,
            email,
            commit,
            date,
            summary,
            line: lineNumber
        };
    }

    clearCache(): void {
        this.cache.clear();
    }
}
