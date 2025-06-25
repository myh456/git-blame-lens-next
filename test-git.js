// 测试Git blame功能的简单脚本
const { exec } = require('child_process');
const path = require('path');

// 测试当前目录是否是Git仓库
exec('git status', (error, stdout, stderr) => {
    if (error) {
        console.log('❌ 当前目录不是Git仓库或Git未安装');
        console.log('错误:', error.message);
        return;
    }
    console.log('✅ Git仓库检测成功');
    
    // 测试git blame命令
    const testFile = 'package.json'; // 测试package.json文件
    exec(`git blame -L 1,1 --porcelain "${testFile}"`, (error, stdout, stderr) => {
        if (error) {
            console.log('❌ Git blame命令失败');
            console.log('错误:', error.message);
            return;
        }
        console.log('✅ Git blame命令成功');
        console.log('输出:', stdout);
    });
});
