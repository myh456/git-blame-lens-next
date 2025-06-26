# Git Blame Lens

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.git-blame-lens)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VSCode](https://img.shields.io/badge/VSCode-1.74.0+-brightgreen.svg)](https://code.visualstudio.com/)

优雅的Git Blame可视化工具，为VSCode提供美观的代码行作者信息和提交历史显示。

> 🎯 **让代码审查更高效** | 📊 **可视化提交历史** | ⚡ **智能缓存优化**

## 功能特性

- 🔍 **实时显示**: 在状态栏实时显示当前光标所在行的Git作者信息
- 🖱️ **悬停提示**: 鼠标悬停在代码行上时显示详细的提交信息
- ⚡ **性能优化**: 智能缓存机制，避免重复的Git查询
- 📜 **动态加载**: 只处理可见行和预加载区域，性能优异
- ⚡ **即时响应**: 0延迟显示已缓存内容，20ms加载新内容
- 🔄 **预测性加载**: 智能预测滚动方向，提前加载内容
- 🚀 **超流畅体验**: 并行加载，逐行更新，无卡顿感
- 🎨 **美观界面**: 使用VSCode图标和Markdown格式化显示信息
- ⚙️ **可配置**: 支持自定义显示选项

## 使用方法

### 状态栏显示
当你在编辑器中移动光标时，状态栏右侧会自动显示当前行的Git作者信息：
- 格式：`👤 作者名 (提交哈希)`
- 点击状态栏项目可以显示详细信息

### 悬停提示
将鼠标悬停在任意代码行上，会显示包含以下信息的详细提示：
- 作者姓名和邮箱
- 提交哈希和时间
- 提交摘要
- 行号

### Git Blame显示
1. 在Git仓库中打开文件
2. 右键点击编辑器 → 选择 **"显示 Git Blame"**
3. 或使用命令面板：`Ctrl+Shift+P` → 输入 "显示 Git Blame"

效果预览：
```
2024-01-15 张三*  │ function calculateSum(a, b) {
2024-01-10 李四   │     return a + b;
2024-01-15 张三*  │ }
```

### 命令面板
按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac) 打开命令面板，搜索：
- `显示Git作者信息` - 显示当前行的作者信息
- `显示 Git Blame` - 显示所有行的blame信息
- `关闭 Git Blame` - 关闭blame显示
- `显示完整提交信息` - 在终端中显示完整的提交详情
- `清除Git作者信息缓存` - 清除缓存的作者信息

## ⚙️ 配置选项

在VSCode设置中搜索 "Git Blame Lens" 可以找到以下配置选项：

- `gitBlameLens.showInStatusBar`: 在状态栏显示当前行的Git作者信息 (默认: true)
- `gitBlameLens.showOnHover`: 鼠标悬停时显示详细的提交信息 (默认: true)
- `gitBlameLens.enableBlameAnnotations`: 启动时自动显示Git blame注释 (默认: false)
- `gitBlameLens.recentCommitThreshold`: 最近提交的天数阈值，用星号标记 (默认: 3天)
- `gitBlameLens.blameAnnotationWidth`: Blame注释区域的宽度 (默认: 18em)
- `gitBlameLens.preloadLines`: 可见区域上下预加载的行数 (默认: 30行)
- `gitBlameLens.scrollDebounceMs`: 滚动防抖延迟时间 (默认: 20毫秒)

## 系统要求

- VSCode 1.74.0 或更高版本
- Git 已安装并在PATH中可用
- 当前文件必须在Git仓库中

## 安装方法

1. 在VSCode中打开扩展面板 (`Ctrl+Shift+X`)
2. 搜索 "Git Author"
3. 点击安装

或者从VSIX文件安装：
1. 下载 `.vsix` 文件
2. 在VSCode中按 `Ctrl+Shift+P` 打开命令面板
3. 输入 "Extensions: Install from VSIX..."
4. 选择下载的 `.vsix` 文件

## 开发

### 构建项目
```bash
npm install
npm run compile
```

### 调试
1. 在VSCode中打开项目
2. 按 `F5` 启动调试会话
3. 在新的VSCode窗口中测试扩展

### 打包
```bash
npm install -g vsce
vsce package
```

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 更新日志

### 0.0.2
- 移除了调试日志，提高运行性能
- 保持了缓存机制，避免重复查询
- 错误处理不再抛出异常，减少性能开销

### 0.0.1
- 初始版本
- 基本的Git blame功能
- 状态栏显示
- 悬停提示
- 缓存机制
