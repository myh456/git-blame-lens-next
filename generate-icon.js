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

        // 背景渐变
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, '#007ACC');
        gradient.addColorStop(1, '#005A9E');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(64, 64, 60, 0, 2 * Math.PI);
        ctx.fill();

        // 外边框
        ctx.strokeStyle = '#003D6B';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Git分支线
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        // 主分支
        ctx.beginPath();
        ctx.moveTo(40, 35);
        ctx.lineTo(40, 95);
        ctx.stroke();
        
        // 分支
        ctx.beginPath();
        ctx.moveTo(40, 55);
        ctx.quadraticCurveTo(50, 55, 60, 65);
        ctx.lineTo(60, 85);
        ctx.stroke();
        
        // 提交点
        ctx.fillStyle = 'white';
        const commits = [
            [40, 35], [40, 55], [40, 75], [40, 95],
            [60, 65], [60, 85]
        ];
        
        commits.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Blame信息示意
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(70, 30 + i * 15, 45, 8);
        }
        
        // 文字
        ctx.fillStyle = 'white';
        ctx.font = '8px monospace';
        const authors = ['张三', '李四', '王五', '赵六'];
        authors.forEach((author, i) => {
            ctx.fillText(`01-15 ${author}`, 72, 37 + i * 15);
        });
        
        // 放大镜
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(100, 100, 12, 0, 2 * Math.PI);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(110, 110);
        ctx.lineTo(120, 120);
        ctx.stroke();
        
        // 保存为PNG
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync('icon.png', buffer);
        console.log('✅ icon.png 生成成功！');
        
    } catch (error) {
        console.error('❌ 生成图标失败:', error.message);
        console.log('💡 请手动创建128x128的PNG图标文件');
    }
}

generateIcon();
