import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class SvgGenerator {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'vscode-git-author');
        this.ensureTempDir();
    }

    private ensureTempDir(): void {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    generateBlameIcon(text: string, isRecent: boolean = false): vscode.Uri {
        const fileName = `blame-${this.hashString(text)}-${isRecent ? 'recent' : 'normal'}.svg`;
        const filePath = path.join(this.tempDir, fileName);

        // 如果文件已存在，直接返回
        if (fs.existsSync(filePath)) {
            return vscode.Uri.file(filePath);
        }

        const svg = this.createSvg(text, isRecent);
        fs.writeFileSync(filePath, svg);
        
        return vscode.Uri.file(filePath);
    }

    private createSvg(text: string, isRecent: boolean): string {
        // 限制文本长度
        const displayText = text.length > 25 ? text.substring(0, 22) + '...' : text;
        
        // 根据是否是最近提交选择颜色
        const backgroundColor = isRecent ? '#fff3cd' : '#f8f9fa';
        const textColor = isRecent ? '#856404' : '#6c757d';
        const borderColor = isRecent ? '#ffeaa7' : '#dee2e6';
        
        // 计算SVG宽度（基于文本长度）
        const textWidth = displayText.length * 7; // 大约每个字符7px
        const svgWidth = Math.max(textWidth + 16, 120); // 最小宽度120px
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="16" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${svgWidth}" height="16" 
          fill="${backgroundColor}" 
          stroke="${borderColor}" 
          stroke-width="1" 
          rx="3"/>
    <text x="8" y="12" 
          font-family="Consolas, 'Courier New', monospace" 
          font-size="10" 
          fill="${textColor}"
          text-anchor="start">${displayText}</text>
</svg>`;
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    cleanup(): void {
        try {
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                for (const file of files) {
                    if (file.endsWith('.svg')) {
                        fs.unlinkSync(path.join(this.tempDir, file));
                    }
                }
            }
        } catch (error) {
            console.error('Error cleaning up SVG files:', error);
        }
    }
}
