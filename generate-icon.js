// 执行方式：node ./generate-icon.js
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('canvas');

/**
 * 将 SVG 文件渲染为指定尺寸的 PNG
 * @param {string} svgPath  SVG 文件路径
 * @param {string} pngPath  输出 PNG 路径
 * @param {number} size     输出边长（正方形），默认 256
 * @param {boolean} keepRatio 是否保持原图宽高比（多余部分留透明），默认 false
 */
async function svgToPng(svgPath, pngPath, size = 256, keepRatio = false) {
    const svgBuffer = fs.readFileSync(svgPath);
    const image = await loadImage(svgBuffer);

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 默认透明背景
    ctx.clearRect(0, 0, size, size);

    if (keepRatio) {
        // 若 SVG 没有固有尺寸（width/height 缺失），退回按 size 处理
        const iw = image.width || size;
        const ih = image.height || size;
        const scale = Math.min(size / iw, size / ih);
        const w = iw * scale;
        const h = ih * scale;
        ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    } else {
        // 直接铺满 256x256
        ctx.drawImage(image, 0, 0, size, size);
    }

    fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
    return pngPath;
}

// 直接运行：node svg2png.js
if (require.main === module) {
    const svgPath = path.join(__dirname, 'icon.svg');
    const pngPath = path.join(__dirname, 'icon.png');

    svgToPng(svgPath, pngPath, 256)
        .then((p) => console.log('✅ 已生成:', p))
        .catch((err) => {
            console.error('❌ 转换失败:', err);
            process.exit(1);
        });
}

svgToPng('./icon.svg', './icon.png', 256);