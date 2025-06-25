#!/usr/bin/env node

// Git Blame Lens 快速设置脚本
const fs = require('fs');
const { execSync } = require('child_process');

console.log('🚀 Git Blame Lens 快速设置\n');

// 1. 检查图标文件
console.log('📋 检查文件状态...');

const iconExists = fs.existsSync('icon.png');
const svgExists = fs.existsSync('icon.svg');

console.log(`📁 icon.svg: ${svgExists ? '✅' : '❌'}`);
console.log(`📁 icon.png: ${iconExists ? '✅' : '❌'}`);

// 2. 尝试生成PNG图标
if (!iconExists && svgExists) {
    console.log('\n🎨 尝试生成PNG图标...');
    
    try {
        // 检查是否安装了canvas
        try {
            require('canvas');
            console.log('✅ Canvas已安装，生成PNG图标...');
            execSync('node generate-icon.js', { stdio: 'inherit' });
        } catch (canvasError) {
            console.log('⚠️  Canvas未安装，提供替代方案...');
            console.log('\n💡 请选择以下方式之一生成PNG图标：');
            console.log('1. 安装Canvas: npm install canvas && npm run generate-icon');
            console.log('2. 在线转换: https://convertio.co/svg-png/');
            console.log('3. 手动转换: 用设计软件将icon.svg转为128x128px的PNG');
        }
    } catch (error) {
        console.log('❌ 生成失败:', error.message);
    }
}

// 3. 检查package.json配置
console.log('\n⚙️  检查配置...');

try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    const checks = [
        { key: 'publisher', value: packageJson.publisher, required: true },
        { key: 'icon', value: packageJson.icon, required: false },
        { key: 'repository', value: packageJson.repository?.url, required: false }
    ];
    
    checks.forEach(check => {
        const status = check.value && check.value !== 'your-publisher-name' && !check.value.includes('your-username') ? '✅' : '⚠️';
        console.log(`${status} ${check.key}: ${check.value || '未设置'}`);
    });
    
} catch (error) {
    console.log('❌ 读取package.json失败');
}

// 4. 编译检查
console.log('\n🔧 编译检查...');
try {
    execSync('npm run compile', { stdio: 'pipe' });
    console.log('✅ TypeScript编译成功');
} catch (error) {
    console.log('❌ 编译失败，请检查代码');
}

// 5. 发布准备状态
console.log('\n📦 发布准备状态:');

const readyChecks = [
    { name: 'PNG图标', status: fs.existsSync('icon.png') },
    { name: 'TypeScript编译', status: fs.existsSync('out/extension.js') },
    { name: 'README文档', status: fs.existsSync('README.md') },
    { name: 'CHANGELOG', status: fs.existsSync('CHANGELOG.md') },
    { name: 'LICENSE', status: fs.existsSync('LICENSE') }
];

readyChecks.forEach(check => {
    console.log(`${check.status ? '✅' : '❌'} ${check.name}`);
});

const allReady = readyChecks.every(check => check.status);

console.log('\n' + '='.repeat(50));

if (allReady) {
    console.log('🎉 恭喜！扩展已准备就绪，可以发布了！');
    console.log('\n📋 发布步骤：');
    console.log('1. npm install -g vsce');
    console.log('2. vsce login your-publisher-name');
    console.log('3. vsce publish');
} else {
    console.log('⚠️  还有一些项目需要完成才能发布');
    console.log('\n💡 下一步：');
    if (!fs.existsSync('icon.png')) {
        console.log('• 生成PNG图标');
    }
    console.log('• 更新package.json中的publisher字段');
    console.log('• 检查所有配置是否正确');
}

console.log('\n🎯 选择的图标风格：编辑器风格 (icon.svg)');
console.log('📚 查看完整指南：cat PRE-PUBLISH-CHECKLIST.md');
