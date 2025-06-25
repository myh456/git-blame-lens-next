# Git Blame Lens 发布指南

## 📋 发布前准备清单

### ✅ 必需文件检查
- [x] `package.json` - 扩展元数据已完善
- [x] `README.md` - 详细的使用说明
- [x] `CHANGELOG.md` - 版本更新记录
- [x] `LICENSE` - MIT许可证
- [x] `icon.svg` - 矢量图标源文件
- [ ] `icon.png` - 128x128px PNG图标

### 🔧 生成PNG图标

#### 方法1：使用Node.js脚本（推荐）
```bash
# 安装依赖
npm install canvas

# 运行生成脚本
node generate-icon.js
```

#### 方法2：手动转换
1. 使用在线工具将 `icon.svg` 转换为 128x128px 的 `icon.png`
2. 推荐工具：https://convertio.co/svg-png/

#### 方法3：使用设计软件
- 在Figma、Sketch或Photoshop中打开SVG
- 导出为128x128px的PNG格式

## 🚀 发布步骤

### 1. 安装发布工具
```bash
npm install -g vsce
```

### 2. 创建发布者账号
1. 访问 [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
2. 使用Microsoft账号登录
3. 创建发布者账号（建议使用有意义的名称）

### 3. 获取Personal Access Token
1. 访问 [Azure DevOps](https://dev.azure.com)
2. 点击右上角用户头像 → Personal access tokens
3. 创建新token，权限选择 "Marketplace (manage)"
4. 保存token（只显示一次）

### 4. 更新package.json
```json
{
  "publisher": "your-publisher-name"
}
```

### 5. 登录vsce
```bash
vsce login your-publisher-name
# 输入Personal Access Token
```

### 6. 发布前测试
```bash
# 编译项目
npm run compile

# 检查包内容
vsce ls

# 本地打包测试
vsce package
```

### 7. 发布到市场
```bash
# 发布扩展
vsce publish

# 或指定版本
vsce publish 1.0.0
```

## 📊 发布后管理

### 监控数据
- 访问 [Marketplace管理页面](https://marketplace.visualstudio.com/manage)
- 查看下载量、评分、用户反馈

### 更新扩展
```bash
# 补丁版本 (1.0.0 → 1.0.1)
vsce publish patch

# 次要版本 (1.0.0 → 1.1.0)
vsce publish minor

# 主要版本 (1.0.0 → 2.0.0)
vsce publish major
```

## 🎯 营销建议

1. **社交媒体推广**：在Twitter、LinkedIn分享
2. **技术社区**：在Reddit、Stack Overflow介绍
3. **博客文章**：写一篇介绍扩展的技术博客
4. **GitHub推广**：在相关项目中提及
5. **用户反馈**：积极回应用户评论和建议

## 🔍 SEO优化

- **关键词**：在描述中包含 "git blame", "code author", "vscode extension"
- **标签**：使用相关的marketplace标签
- **截图**：添加功能演示截图到README
- **视频**：制作简短的功能演示视频

---

**祝发布成功！** 🎉
