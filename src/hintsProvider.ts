import * as vscode from 'vscode';
import { getLogger } from './logger';
import { GitAuthorProvider, AuthorInfo } from './gitAuthorProvider';

export class HintsProvider implements vscode.InlayHintsProvider, vscode.Disposable {
    private readonly gitAuthorProvider: GitAuthorProvider;
    private readonly _onDidChangeInlayHints = new vscode.EventEmitter<void>();

    /** VS Code 监听此事件来重新拉取 hint */
    readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

    constructor(gitAuthorProvider: GitAuthorProvider) {
        this.gitAuthorProvider = gitAuthorProvider;
    }

    async provideInlayHints(
        document: vscode.TextDocument,
        range: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.InlayHint[]> {
        // 配置开关
        const config = vscode.workspace.getConfiguration('gitBlameLens');
        if (config.get<string>('blameInfoType', 'InlayHints') !== 'InlayHints') {
            return [];
        }

        // 只对本地文件生效
        if (document.uri.scheme !== 'file') {
            return [];
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return [];
        }

        // 只处理"当前光标所在行"
        const currentLine = editor.selection.active.line;
        if (currentLine < range.start.line || currentLine > range.end.line) {
            return [];
        }

        const lineText = document.lineAt(currentLine);
        if (lineText.isEmptyOrWhitespace) {
            return [];
        }

        try {
            const authorInfo = await this.gitAuthorProvider.getAuthorInfo(
                document.uri.fsPath,
                currentLine + 1
            );

            if (!authorInfo || token.isCancellationRequested) {
                return [];
            }

            return [this.createHint(document, currentLine, authorInfo)];
        } catch (err) {
            getLogger().error('Error in hints provider:', err);
            return [];
        }
    }

    private createHint(
        document: vscode.TextDocument,
        line: number,
        authorInfo: AuthorInfo
    ): vscode.InlayHint {
        const position = new vscode.Position(
            line,
            document.lineAt(line).range.end.character
        );

        const shortDate = this.formatDate(authorInfo.date);
        const labelParts: vscode.InlayHintLabelPart[] = [];

        // 创建一个可点击的 label part，并绑定 command
        const clickablePart = new vscode.InlayHintLabelPart(`${shortDate} ${authorInfo.author}`);
        clickablePart.command = {
            command: 'gitBlameLens.toggleBlameAnnotations',
            title: '切换 Git Blame 注解',
            arguments: [authorInfo]
        };
        clickablePart.tooltip = '点击切换 Blame 注解';
        labelParts.push(clickablePart);

        const hint = new vscode.InlayHint(
            position,
            labelParts,
            vscode.InlayHintKind.Type
        );

        hint.paddingLeft = true;

        // tooltip：悬停 hint 时显示更多信息
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`### Git提交信息\n\n`);

        // 创建信息表格
        tooltip.appendMarkdown(`| | |\n|---|---|\n`);
        tooltip.appendMarkdown(`|**作者：**| ${authorInfo.author} |\n`);
        tooltip.appendMarkdown(`|**提交：**| \`${authorInfo.commit.substring(0, 12)}\` |\n`);
        tooltip.appendMarkdown(`|**时间：**| ${authorInfo.date} |\n`);
        tooltip.appendMarkdown(`|**摘要：**| ${authorInfo.summary} |\n\n`);

        // 添加操作按钮
        const showFullCommitCommand = `command:gitBlameLens.showFullCommit?${encodeURIComponent(JSON.stringify([authorInfo.commit]))}`;
        tooltip.appendMarkdown(`[查看文件差异](${showFullCommitCommand})`);

        tooltip.isTrusted = true;
        tooltip.supportThemeIcons = true;
        hint.tooltip = tooltip;

        return hint;
    }

    /** 把 ISO 日期截成 "YYYY-MM-DD HH:MM" */
    private formatDate(date: string): string {
        if (!date) return '';
        const m = date.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
        return m ? `${m[1]} ${m[2]}` : date;
    }

    /** 主动触发刷新（光标移动、配置变化等场景调用） */
    refresh(): void {
        this._onDidChangeInlayHints.fire();
    }

    dispose(): void {
        this._onDidChangeInlayHints.dispose();
    }
}