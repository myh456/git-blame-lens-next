import * as vscode from 'vscode';
import { getLogger } from './logger';
import { GitAuthorProvider } from './gitAuthorProvider';
import { BlameCache } from './blameCache';
import { BlameDecorator } from './blameDecorator';
import { DocumentChangeHandler } from './documentChangeHandler';

/**
 * Git Blame装饰器管理器（重构后的主管理器）
 */
export class BlameDecorationManager implements vscode.Disposable {
    private gitAuthorProvider: GitAuthorProvider;
    private cache: BlameCache;
    private decorator: BlameDecorator;
    private documentChangeHandler: DocumentChangeHandler;

    private isActive = false;
    private currentEditor: vscode.TextEditor | undefined;
    private isLoading = false;
    private updateTimeout: NodeJS.Timeout | undefined;

    private scrollListener: vscode.Disposable | undefined;
    private documentChangeListener: vscode.Disposable | undefined;
    private documentSaveListener: vscode.Disposable | undefined;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
        this.cache = new BlameCache();
        this.decorator = new BlameDecorator();
        this.documentChangeHandler = new DocumentChangeHandler(this.cache);

        this.setupDocumentChangeListener();
        this.setupDocumentSaveListener();
    }

    async toggle(): Promise<void> {
        this.isActive ? await this.hide() : await this.show();
    }

    async show(): Promise<void> {
        if (this.isActive) return;
        this.isActive = true;
        await this.showBlameDecorations();
        this.setupScrollListener();
        getLogger().info('Git Blame 注释已开启');
    }

    async hide(): Promise<void> {
        if (!this.isActive) return;
        this.isActive = false;
        this.hideBlameDecorations();
        this.disposeScrollListener();
        getLogger().info('Git Blame 注释已关闭');
    }

    async refresh(): Promise<void> {
        if (!this.isActive || !this.currentEditor) return;
        this.cache.clearAll();
        this.gitAuthorProvider.clearFileCache(this.currentEditor.document.uri.fsPath);
        await this.showBlameDecorations();
        getLogger().info('Git Blame 信息已刷新');
    }

    async onConfigurationChanged(): Promise<void> {
        this.decorator.recreate();
        getLogger().info('Git Blame 信息已重置');
    }

    private async showBlameDecorations(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || this.isLoading) return;
        if (editor.document.uri.scheme !== 'file') return;
        this.currentEditor = editor;
        this.isLoading = true;
        try {
            getLogger().info('正在加载 Git Blame 信息...');
            await this.loadVisibleBlameInfo();
            if (this.isActive) this.applyBlameDecorations();
        } finally {
            this.isLoading = false;
        }
    }

    private async loadVisibleBlameInfo(): Promise<void> {
        if (!this.currentEditor) return;

        const config = vscode.workspace.getConfiguration('gitBlameLens');
        const editor = this.currentEditor;
        const visibleRanges = editor.visibleRanges;
        if (!visibleRanges.length) return;

        const preload = config.get<number>('preloadLines', 30);
        const first = Math.max(0, visibleRanges[0].start.line - preload);
        const last = Math.min(editor.document.lineCount - 1, visibleRanges[visibleRanges.length - 1].end.line + preload);

        const lines = Array.from({ length: last - first + 1 }, (_, i) => i + first)
            .filter(line => !this.cache.hasBlameInfo(line));

        const batchSize = 8;
        for (let i = 0; i < lines.length; i += batchSize) {
            await Promise.all(lines.slice(i, i + batchSize).map(line =>
                this.loadAndCacheBlameInfo(line, editor.document.uri.fsPath)
            ));
            this.applyBlameDecorations();
            if (i + batchSize < lines.length) await new Promise(r => setTimeout(r, 20));
        }
    }

    private async loadAndCacheBlameInfo(line: number, file: string): Promise<void> {
        if (this.cache.isLineModified(line)) return this.cache.setBlameInfo(line, null);
        try {
            const info = await this.gitAuthorProvider.getAuthorInfo(file, line + 1);
            getLogger().info(`[blame] line ${line + 1}: info=${info ? info.author : 'null'}`);
            this.cache.setBlameInfo(line, info ?? null);
            if (info) this.cache.setDisplayText(line, this.decorator.generateBlameDisplayText(info));
        } catch (e) {
            getLogger().error(`Blame load error on line ${line + 1}:`, e);
            this.cache.setBlameInfo(line, null);
        }
    }

    private applyBlameDecorations() {
        if (this.currentEditor) this.decorator.applyDecorations(this.currentEditor, this.cache);
    }

    private hideBlameDecorations() {
        if (this.currentEditor) this.decorator.clearDecorations(this.currentEditor);
        this.cache.clearAll();
    }

    private setupScrollListener() {
        this.scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges(async e => {
            if (e.textEditor !== this.currentEditor || !this.isActive) return;
            if (e.textEditor.document.uri.scheme !== 'file') return;
            if (this.updateTimeout) clearTimeout(this.updateTimeout);
            const config = vscode.workspace.getConfiguration('gitBlameLens');
            this.updateTimeout = setTimeout(async () => {
                await this.loadVisibleBlameInfo();
                this.applyBlameDecorations();
            }, config.get<number>('scrollDebounceMs', 100));
        });
    }

    private disposeScrollListener() {
        this.scrollListener?.dispose();
        this.scrollListener = undefined;
        clearTimeout(this.updateTimeout);
        this.updateTimeout = undefined;
    }

    private setupDocumentChangeListener() {
        this.documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (!this.isActive || !this.currentEditor) return;
            if (event.document.uri.fsPath !== this.currentEditor.document.uri.fsPath) return;
            for (const change of event.contentChanges) this.documentChangeHandler.handleDocumentChange(change);
            this.gitAuthorProvider.clearFileCache(event.document.uri.fsPath);
        });
    }

    private setupDocumentSaveListener() {
        this.documentSaveListener = vscode.workspace.onDidSaveTextDocument(async doc => {
            if (!this.isActive || !this.currentEditor) return;
            if (doc.uri.fsPath !== this.currentEditor.document.uri.fsPath) return;
            const modifiedLines = Array.from(this.cache.getModifiedLines());
            this.cache.clearModifiedLines();
            this.gitAuthorProvider.clearFileCache(doc.uri.fsPath);
            await Promise.all(modifiedLines.map(l => this.loadAndCacheBlameInfo(l, doc.uri.fsPath)));
            this.applyBlameDecorations();
        });
    }


    async onActiveEditorChanged(editor: vscode.TextEditor | undefined): Promise<void> {
        if (!this.isActive) return;
        if (editor) {
            if (editor.document.uri.scheme !== 'file') return;
            this.currentEditor = editor;
            this.disposeScrollListener();
            this.setupScrollListener();
            await this.showBlameDecorations();
        }
    }

    dispose() {
        this.hideBlameDecorations();
        this.disposeScrollListener();
        this.documentChangeListener?.dispose();
        this.documentSaveListener?.dispose();
        this.decorator.dispose();
    }
}
