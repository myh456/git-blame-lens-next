// Git Blame Lens 图标生成脚本
// 需要安装: npm install canvas

const fs = require('fs');

// 如果没有canvas，提供备用方案
let createCanvas, loadImage;
try {
    const canvasModule = require('canvas');
    createCanvas = canvasModule.createCanvas;
    loadImage = canvasModule.loadImage;
} catch (error) {
    console.log('⚠️  Canvas模块未安装，将创建简单的图标说明');
    console.log('💡 请运行: npm install canvas');
    console.log('📝 或手动创建128x128的PNG图标');
    return;
}

async function generateIcon() {
    try {
        console.log('🎨 正在生成 Git Blame Lens 图标...');

        // 创建128x128的画布
        const canvas = createCanvas(128, 128);
        const ctx = canvas.getContext('2d');

        // 清除画布
        ctx.clearRect(0, 0, 128, 128);

        // 主背景渐变 - 编辑器风格
        const bgGradient = ctx.createLinearGradient(0, 0, 128, 128);
        bgGradient.addColorStop(0, '#667eea');
        bgGradient.addColorStop(1, '#764ba2');

        // 绘制圆角矩形背景
        ctx.fillStyle = bgGradient;
        roundRect(ctx, 0, 0, 128, 128, 24);
        ctx.fill();
        
        // 绘制编辑器窗口
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        roundRect(ctx, 16, 20, 96, 88, 8);
        ctx.fill();
        ctx.stroke();

        // 窗口标题栏
        ctx.fillStyle = 'rgba(102,126,234,0.1)';
        roundRect(ctx, 16, 20, 96, 20, 8);
        ctx.fill();

        // 窗口控制按钮
        ctx.fillStyle = '#ff5f56';
        ctx.beginPath();
        ctx.arc(28, 30, 3, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#ffbd2e';
        ctx.beginPath();
        ctx.arc(40, 30, 3, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#27ca3f';
        ctx.beginPath();
        ctx.arc(52, 30, 3, 0, 2 * Math.PI);
        ctx.fill();

        // Git blame 区域背景
        ctx.fillStyle = 'rgba(245,87,108,0.1)';
        roundRect(ctx, 20, 48, 32, 52, 4);
        ctx.fill();

        // Git blame 信息行
        const blameGradient = ctx.createLinearGradient(22, 52, 50, 88);
        blameGradient.addColorStop(0, '#f093fb');
        blameGradient.addColorStop(1, '#f5576c');

        const blameLines = [52, 62, 72, 82];
        const blameOpacities = [0.8, 0.8, 0.6, 0.9];

        blameLines.forEach((y, i) => {
            ctx.fillStyle = blameGradient;
            ctx.globalAlpha = blameOpacities[i];
            roundRect(ctx, 22, y, 28, 6, 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        });

        // 分隔线
        ctx.strokeStyle = 'rgba(102,126,234,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(54, 50);
        ctx.lineTo(54, 98);
        ctx.stroke();

        // 代码区域
        ctx.fillStyle = '#e0e0e0';
        ctx.globalAlpha = 0.6;
        const codeLines = [52, 62, 72, 82, 92];
        const codeWidths = [48, 42, 45, 38, 44];

        codeLines.forEach((y, i) => {
            roundRect(ctx, 58, y, codeWidths[i], 4, 1);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // 放大镜图标
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9;

        // 放大镜圆圈
        ctx.beginPath();
        ctx.arc(97, 87, 10, 0, 2 * Math.PI);
        ctx.stroke();

        // 放大镜内部
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(97, 87, 6, 0, 2 * Math.PI);
        ctx.fill();

        // 放大镜手柄
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(105, 95);
        ctx.lineTo(113, 103);
        ctx.stroke();

        // Git 图标
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.8;

        // Git 节点
        [[26, 91], [26, 100], [35, 95.5]].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Git 连接线
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(26, 93.5);
        ctx.lineTo(26, 97.5);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(26, 95.5);
        ctx.quadraticCurveTo(29, 95.5, 32.5, 95.5);
        ctx.stroke();

        // 装饰光点
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(96, 32, 2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(32, 96, 1.5, 0, 2 * Math.PI);
        ctx.fill();
        
        // 保存为PNG
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync('icon.png', buffer);
        console.log('✅ 编辑器风格 icon.png 生成成功！');
        console.log('📁 文件大小:', Math.round(buffer.length / 1024), 'KB');

    } catch (error) {
        console.error('❌ 生成图标失败:', error.message);
        console.log('💡 请手动创建128x128的PNG图标文件');
        console.log('🎨 或使用在线工具转换 icon.svg');
    }
}

// 圆角矩形辅助函数
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// 将roundRect添加到canvas上下文
if (typeof createCanvas !== 'undefined') {
    generateIcon.prototype = {
        roundRect: function(ctx, x, y, width, height, radius) {
            roundRect(ctx, x, y, width, height, radius);
        }
    };
}

generateIcon();
