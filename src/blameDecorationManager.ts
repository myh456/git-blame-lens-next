import * as vscode from 'vscode';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class BlameDecorationManager implements vscode.Disposable {
    private gitAuthorProvider: GitAuthorProvider;
    private decorationType: vscode.TextEditorDecorationType;
    private recentDecorationType: vscode.TextEditorDecorationType;
    private emptyDecorationType: vscode.TextEditorDecorationType;
    private isActive = false;
    private currentEditor: vscode.TextEditor | undefined;
    private blameInfoMap: Map<number, AuthorInfo | null> = new Map();
    private scrollListener: vscode.Disposable | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private loadingPromises: Map<number, Promise<AuthorInfo | null>> = new Map();
    private maxCacheSize = 500; // 最大缓存行数
    private lastVisibleRange: { start: number; end: number } | undefined;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;

        // 创建普通装饰器类型 - 固定宽度，统一布局，修复垂直对齐
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'normal',
                fontWeight: 'normal',
                margin: '0 0 0 0',
                width: '18em', // 固定宽度确保统一
                textDecoration: 'none; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; padding-right: 0.5em; vertical-align: top; line-height: inherit;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });

        // 创建最近提交装饰器类型 - 稍微突出一些，同样的固定宽度
        this.recentDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                color: new vscode.ThemeColor('editorWarning.foreground'),
                fontStyle: 'normal',
                fontWeight: 'bold',
                margin: '0 0 0 0',
                width: '18em', // 固定宽度确保统一
                textDecoration: 'none; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; padding-right: 0.5em; vertical-align: top; line-height: inherit;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
        });

        // 创建空白装饰器类型 - 为没有blame信息的行提供统一的空白区域
        this.emptyDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: '', // 空内容
                margin: '0 0 0 0',
                width: '18em', // 与其他装饰器相同的宽度
                textDecoration: 'none; display: inline-block; padding-right: 0.5em; vertical-align: top; line-height: inherit;'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.OpenClosed
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
            this.setupScrollListener();
            vscode.window.showInformationMessage('Git Blame 注释已开启');
        }
    }

    async hide(): Promise<void> {
        if (this.isActive) {
            this.isActive = false;
            console.log('Hide blame decorations');
            this.hideBlameDecorations();
            this.disposeScrollListener();
            vscode.window.showInformationMessage('Git Blame 注释已关闭');
        }
    }

    // 刷新当前文件的blame信息
    async refresh(): Promise<void> {
        if (this.isActive && this.currentEditor) {
            console.log('Refreshing blame decorations');
            // 清除缓存
            this.blameInfoMap.clear();
            // 清除加载中的Promise
            this.loadingPromises.clear();
            // 重新显示
            await this.showBlameDecorations();
            vscode.window.showInformationMessage('Git Blame 信息已刷新');
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

            // 获取当前可见的行范围
            const visibleRanges = editor.visibleRanges;
            if (visibleRanges.length === 0) {
                return;
            }

            // 计算需要处理的行范围（包含预加载）
            const config = vscode.workspace.getConfiguration('gitBlameLens');
            const preloadCount = config.get<number>('preloadLines', 20);
            const firstVisibleLine = Math.max(0, visibleRanges[0].start.line - preloadCount);
            const lastVisibleLine = Math.min(
                document.lineCount - 1,
                visibleRanges[visibleRanges.length - 1].end.line + preloadCount
            );

            const totalLines = lastVisibleLine - firstVisibleLine + 1;

            this.blameInfoMap.clear();
            console.log(`Processing visible lines ${firstVisibleLine + 1}-${lastVisibleLine + 1} (${totalLines} lines total)`);

            // 先为所有可见行添加空白装饰，保持布局一致
            const emptyDecorations: vscode.DecorationOptions[] = [];
            for (let lineIndex = visibleRanges[0].start.line; lineIndex <= visibleRanges[visibleRanges.length - 1].end.line; lineIndex++) {
                const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
                emptyDecorations.push({ range });
            }
            editor.setDecorations(this.emptyDecorationType, emptyDecorations);

            // 立即开始加载所有行，不等待
            const allPromises: Promise<void>[] = [];

            for (let lineIndex = firstVisibleLine; lineIndex <= lastVisibleLine; lineIndex++) {
                const promise = (async (currentLineIndex: number) => {
                    if (token.isCancellationRequested) {
                        return;
                    }

                    progress.report({
                        increment: (100 / totalLines),
                        message: `处理第 ${currentLineIndex + 1}/${document.lineCount} 行`
                    });

                    try {
                        const authorInfo = await this.gitAuthorProvider.getAuthorInfo(
                            document.uri.fsPath,
                            currentLineIndex + 1
                        );

                        if (authorInfo && !token.isCancellationRequested) {
                            this.blameInfoMap.set(currentLineIndex, authorInfo);
                            const decoration = this.createDecoration(authorInfo, currentLineIndex);

                            // 判断是否是最近3天内的提交
                            if (this.isRecentCommit(authorInfo.date)) {
                                recentDecorations.push(decoration);
                            } else {
                                normalDecorations.push(decoration);
                            }

                            // 每加载一行就更新一次显示（对于可见行）
                            if (currentLineIndex >= visibleRanges[0].start.line &&
                                currentLineIndex <= visibleRanges[visibleRanges.length - 1].end.line) {
                                // 更新所有装饰，包括移除对应的空白装饰
                                this.updateCachedDecorations();
                            }
                        } else {
                            // 明确标记为没有blame信息的行（新增未提交行）
                            this.blameInfoMap.set(currentLineIndex, null);

                            // 如果是可见行，立即更新显示
                            if (currentLineIndex >= visibleRanges[0].start.line &&
                                currentLineIndex <= visibleRanges[visibleRanges.length - 1].end.line) {
                                this.updateCachedDecorations();
                            }
                        }
                    } catch (error) {
                        console.error(`Error getting blame info for line ${currentLineIndex + 1}:`, error);
                        // 出错时也要标记为null
                        this.blameInfoMap.set(currentLineIndex, null);

                        // 如果是可见行，立即更新显示
                        if (currentLineIndex >= visibleRanges[0].start.line &&
                            currentLineIndex <= visibleRanges[visibleRanges.length - 1].end.line) {
                            this.updateCachedDecorations();
                        }
                    }
                })(lineIndex);

                allPromises.push(promise);
            }

            // 等待所有加载完成
            await Promise.all(allPromises);

            // 最终更新
            if (!token.isCancellationRequested && this.isActive) {
                this.updateCachedDecorations();
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
                    contentText
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

    private setupScrollListener(): void {
        if (this.currentEditor) {
            this.scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges(async (event) => {
                if (event.textEditor === this.currentEditor && this.isActive) {
                    const visibleRanges = event.textEditor.visibleRanges;
                    if (visibleRanges.length === 0) return;

                    const currentRange = {
                        start: visibleRanges[0].start.line,
                        end: visibleRanges[visibleRanges.length - 1].end.line
                    };

                    // 立即更新已缓存的行
                    this.updateCachedDecorations();

                    // 立即开始加载可见行，无防抖
                    this.loadVisibleLinesImmediately();

                    // 预测性加载：根据滚动方向预加载更多内容
                    this.predictivePreload(currentRange);

                    // 使用很短的防抖加载预加载区域
                    if (this.updateTimeout) {
                        clearTimeout(this.updateTimeout);
                    }

                    const config = vscode.workspace.getConfiguration('gitBlameLens');
                    const debounceMs = config.get<number>('scrollDebounceMs', 20);

                    this.updateTimeout = setTimeout(async () => {
                        await this.loadPreloadLines();
                    }, debounceMs);

                    this.lastVisibleRange = currentRange;
                }
            });
        }
    }

    // 预测性预加载
    private predictivePreload(currentRange: { start: number; end: number }): void {
        if (!this.currentEditor || !this.lastVisibleRange) {
            return;
        }

        const scrollDirection = currentRange.start - this.lastVisibleRange.start;
        const config = vscode.workspace.getConfiguration('gitBlameLens');
        const preloadCount = config.get<number>('preloadLines', 30);

        // 根据滚动方向，在滚动方向上预加载更多行
        let extraPreloadStart = currentRange.start;
        let extraPreloadEnd = currentRange.end;

        if (scrollDirection > 0) {
            // 向下滚动，预加载下方更多行
            extraPreloadEnd = Math.min(
                this.currentEditor.document.lineCount - 1,
                currentRange.end + preloadCount * 2
            );
        } else if (scrollDirection < 0) {
            // 向上滚动，预加载上方更多行
            extraPreloadStart = Math.max(0, currentRange.start - preloadCount * 2);
        }

        // 立即开始预测性加载
        for (let lineIndex = extraPreloadStart; lineIndex <= extraPreloadEnd; lineIndex++) {
            if (!this.blameInfoMap.has(lineIndex) && !this.loadingPromises.has(lineIndex)) {
                const promise = this.loadSingleLine(lineIndex, this.currentEditor.document.uri.fsPath);
                this.loadingPromises.set(lineIndex, promise);

                promise.then((authorInfo) => {
                    this.loadingPromises.delete(lineIndex);
                    // 无论是否有authorInfo都要设置到缓存中
                    this.blameInfoMap.set(lineIndex, authorInfo);
                    this.cleanupCache();
                }).catch((error) => {
                    this.loadingPromises.delete(lineIndex);
                    // 出错时也要标记为null
                    this.blameInfoMap.set(lineIndex, null);
                    console.error(`Error in predictive loading for line ${lineIndex + 1}:`, error);
                });
            }
        }
    }

    private disposeScrollListener(): void {
        if (this.scrollListener) {
            this.scrollListener.dispose();
            this.scrollListener = undefined;
        }
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }
    }

    // 立即更新已缓存的装饰，提供即时反馈
    private updateCachedDecorations(): void {
        if (!this.currentEditor || !this.isActive) {
            return;
        }

        const editor = this.currentEditor;
        const visibleRanges = editor.visibleRanges;

        if (visibleRanges.length === 0) {
            return;
        }

        const normalDecorations: vscode.DecorationOptions[] = [];
        const recentDecorations: vscode.DecorationOptions[] = [];
        const emptyDecorations: vscode.DecorationOptions[] = [];

        // 处理所有可见行，确保布局一致
        for (let lineIndex = visibleRanges[0].start.line; lineIndex <= visibleRanges[visibleRanges.length - 1].end.line; lineIndex++) {
            const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
            const authorInfo = this.blameInfoMap.get(lineIndex);

            if (authorInfo !== undefined && authorInfo !== null) {
                const decoration = this.createDecoration(authorInfo, lineIndex);
                if (this.isRecentCommit(authorInfo.date)) {
                    recentDecorations.push(decoration);
                } else {
                    normalDecorations.push(decoration);
                }
            } else {
                // 为没有blame信息的行或新增未提交行添加空白装饰，保持布局一致
                emptyDecorations.push({ range });
            }
        }

        // 立即应用装饰
        editor.setDecorations(this.decorationType, normalDecorations);
        editor.setDecorations(this.recentDecorationType, recentDecorations);
        editor.setDecorations(this.emptyDecorationType, emptyDecorations);
    }

    // 立即加载可见行，无延迟
    private loadVisibleLinesImmediately(): void {
        if (!this.currentEditor || !this.isActive) {
            return;
        }

        const editor = this.currentEditor;
        const document = editor.document;
        const visibleRanges = editor.visibleRanges;

        if (visibleRanges.length === 0) {
            return;
        }

        // 先为所有可见行设置空白装饰，确保布局一致
        const emptyDecorations: vscode.DecorationOptions[] = [];
        for (let lineIndex = visibleRanges[0].start.line; lineIndex <= visibleRanges[visibleRanges.length - 1].end.line; lineIndex++) {
            const authorInfo = this.blameInfoMap.get(lineIndex);
            if (authorInfo === undefined || authorInfo === null) {
                const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
                emptyDecorations.push({ range });
            }
        }
        if (emptyDecorations.length > 0) {
            editor.setDecorations(this.emptyDecorationType, emptyDecorations);
        }

        // 只处理当前可见的行，立即开始
        for (let lineIndex = visibleRanges[0].start.line; lineIndex <= visibleRanges[visibleRanges.length - 1].end.line; lineIndex++) {
            if (!this.blameInfoMap.has(lineIndex) && !this.loadingPromises.has(lineIndex)) {
                // 立即开始异步加载，不等待
                const promise = this.loadSingleLine(lineIndex, document.uri.fsPath);
                this.loadingPromises.set(lineIndex, promise);

                // 加载完成后立即更新显示
                promise.then((authorInfo) => {
                    this.loadingPromises.delete(lineIndex);
                    // 无论是否有authorInfo都要设置到缓存中
                    this.blameInfoMap.set(lineIndex, authorInfo);
                    // 立即更新显示
                    this.updateCachedDecorations();
                }).catch((error) => {
                    this.loadingPromises.delete(lineIndex);
                    // 出错时也要标记为null
                    this.blameInfoMap.set(lineIndex, null);
                    console.error(`Error loading line ${lineIndex + 1}:`, error);
                    this.updateCachedDecorations();
                });
            }
        }
    }

    // 加载预加载区域
    private async loadPreloadLines(): Promise<void> {
        if (!this.currentEditor || !this.isActive) {
            return;
        }

        const editor = this.currentEditor;
        const document = editor.document;
        const visibleRanges = editor.visibleRanges;

        if (visibleRanges.length === 0) {
            return;
        }

        const config = vscode.workspace.getConfiguration('gitBlameLens');
        const preloadCount = config.get<number>('preloadLines', 30);

        // 预加载区域
        const preloadStart = Math.max(0, visibleRanges[0].start.line - preloadCount);
        const preloadEnd = Math.min(document.lineCount - 1, visibleRanges[visibleRanges.length - 1].end.line + preloadCount);

        const linesToLoad: number[] = [];

        // 收集需要加载的行
        for (let lineIndex = preloadStart; lineIndex < visibleRanges[0].start.line; lineIndex++) {
            if (!this.blameInfoMap.has(lineIndex) && !this.loadingPromises.has(lineIndex)) {
                linesToLoad.push(lineIndex);
            }
        }

        for (let lineIndex = visibleRanges[visibleRanges.length - 1].end.line + 1; lineIndex <= preloadEnd; lineIndex++) {
            if (!this.blameInfoMap.has(lineIndex) && !this.loadingPromises.has(lineIndex)) {
                linesToLoad.push(lineIndex);
            }
        }

        // 并行加载所有预加载行
        const promises = linesToLoad.map(async (lineIndex) => {
            const promise = this.loadSingleLine(lineIndex, document.uri.fsPath);
            this.loadingPromises.set(lineIndex, promise);

            try {
                const authorInfo = await promise;
                this.loadingPromises.delete(lineIndex);
                // 无论是否有authorInfo都要设置到缓存中
                this.blameInfoMap.set(lineIndex, authorInfo);
                this.cleanupCache();
            } catch (error) {
                this.loadingPromises.delete(lineIndex);
                // 出错时也要标记为null
                this.blameInfoMap.set(lineIndex, null);
                console.error(`Error loading preload line ${lineIndex + 1}:`, error);
            }
        });

        await Promise.all(promises);
    }

    // 加载单行数据
    private async loadSingleLine(lineIndex: number, filePath: string): Promise<AuthorInfo | null> {
        try {
            return await this.gitAuthorProvider.getAuthorInfo(filePath, lineIndex + 1);
        } catch (error) {
            console.error(`Error loading line ${lineIndex + 1}:`, error);
            return null;
        }
    }



    // 清理缓存，保持内存使用合理
    private cleanupCache(): void {
        if (this.blameInfoMap.size > this.maxCacheSize) {
            // 获取当前可见范围
            if (this.currentEditor) {
                const visibleRanges = this.currentEditor.visibleRanges;
                if (visibleRanges.length > 0) {
                    const config = vscode.workspace.getConfiguration('gitBlameLens');
                    const preloadCount = config.get<number>('preloadLines', 20);
                    const keepStart = Math.max(0, visibleRanges[0].start.line - preloadCount * 2);
                    const keepEnd = Math.min(
                        this.currentEditor.document.lineCount - 1,
                        visibleRanges[visibleRanges.length - 1].end.line + preloadCount * 2
                    );

                    // 删除远离可见区域的缓存
                    const keysToDelete: number[] = [];
                    for (const [lineIndex] of this.blameInfoMap) {
                        if (lineIndex < keepStart || lineIndex > keepEnd) {
                            keysToDelete.push(lineIndex);
                        }
                    }

                    keysToDelete.forEach(key => this.blameInfoMap.delete(key));
                    console.log(`Cleaned up ${keysToDelete.length} cached entries, ${this.blameInfoMap.size} remaining`);
                }
            }
        }
    }

    private hideBlameDecorations(): void {
        if (this.currentEditor) {
            this.currentEditor.setDecorations(this.decorationType, []);
            this.currentEditor.setDecorations(this.recentDecorationType, []);
            this.currentEditor.setDecorations(this.emptyDecorationType, []);
        }
        this.blameInfoMap.clear();
    }

    // 当编辑器改变时更新装饰
    async onActiveEditorChanged(editor: vscode.TextEditor | undefined): Promise<void> {
        if (this.isActive && editor) {
            this.currentEditor = editor;
            // 重新设置滚动监听器
            this.disposeScrollListener();
            this.setupScrollListener();
            await this.showBlameDecorations();
        }
    }

    dispose(): void {
        this.hideBlameDecorations();
        this.disposeScrollListener();
        this.decorationType.dispose();
        this.recentDecorationType.dispose();
        this.emptyDecorationType.dispose();
    }
}
