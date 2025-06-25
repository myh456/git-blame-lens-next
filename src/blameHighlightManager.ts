import * as vscode from 'vscode';
import { BlameTreeProvider } from './blameTreeProvider';

export class BlameHighlightManager implements vscode.Disposable {
    private decorationType: vscode.TextEditorDecorationType;
    private currentEditor: vscode.TextEditor | undefined;
    private blameTreeProvider: BlameTreeProvider;

    constructor(blameTreeProvider: BlameTreeProvider) {
        this.blameTreeProvider = blameTreeProvider;
        
        // 创建高亮装饰器
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.lineHighlightBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
    }

    async onCursorPositionChanged(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
        this.currentEditor = editor;
        const lineNumber = position.line + 1;
        
        // 高亮当前行
        const range = new vscode.Range(position.line, 0, position.line, 0);
        const decoration: vscode.DecorationOptions = {
            range,
            hoverMessage: await this.createHoverMessage(lineNumber)
        };
        
        editor.setDecorations(this.decorationType, [decoration]);
    }

    private async createHoverMessage(lineNumber: number): Promise<vscode.MarkdownString | undefined> {
        const blameInfo = this.blameTreeProvider.getBlameInfo(lineNumber);
        if (!blameInfo) {
            return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`### $(git-commit) Git Blame 信息\n\n`);
        markdown.appendMarkdown(`**行号:** ${lineNumber}\n\n`);
        markdown.appendMarkdown(`**作者:** ${blameInfo.author}\n\n`);
        markdown.appendMarkdown(`**邮箱:** ${blameInfo.email}\n\n`);
        markdown.appendMarkdown(`**时间:** ${blameInfo.date}\n\n`);
        markdown.appendMarkdown(`**提交:** \`${blameInfo.commit}\`\n\n`);
        markdown.appendMarkdown(`**摘要:** ${blameInfo.summary}\n\n`);
        
        return markdown;
    }

    clearHighlight(): void {
        if (this.currentEditor) {
            this.currentEditor.setDecorations(this.decorationType, []);
        }
    }

    dispose(): void {
        this.clearHighlight();
        this.decorationType.dispose();
    }
}
