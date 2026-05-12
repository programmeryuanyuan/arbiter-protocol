# 队友操作指南（前端开发）

## 一、首次拉取项目

打开终端（Mac: 搜索 "终端"，Windows: 搜索 "PowerShell"），依次输入：

```bash
# 1. 进入你想放项目的文件夹（比如桌面）
cd ~/Desktop

# 2. 克隆项目
git clone https://github.com/programmeryuanyuan/arbiter-protocol.git

# 3. 进入项目
cd arbiter-protocol

# 4. 安装依赖（需要等几分钟）
yarn install
```

如果 `yarn install` 报错，试：
```bash
npm install
```

---

## 二、启动项目

需要打开 **两个终端窗口**：

### 终端 1：启动本地区块链
```bash
cd ~/Desktop/arbiter-protocol
yarn chain
```
看到一堆账户地址就说明成功了，**不要关闭这个窗口**。

### 终端 2：启动前端
```bash
cd ~/Desktop/arbiter-protocol
yarn start
```
然后浏览器打开 http://localhost:3000 就能看到页面。

---

## 三、你负责的文件

前端代码全部在这个目录：
```
packages/nextjs/
├── app/
│   ├── page.tsx          ← 首页（主要改这个）
│   └── ...
├── components/           ← 组件
└── styles/               ← 样式
```

**只需要改 `packages/nextjs/` 里的文件，其他不要动。**

---

## 四、每次开始工作前

先拉取最新代码，防止冲突：
```bash
cd ~/Desktop/arbiter-protocol
git pull
```

---

## 五、改完代码后提交

```bash
# 1. 查看改了哪些文件
git status

# 2. 添加你改的文件
git add packages/nextjs/

# 3. 提交（引号里写你做了什么）
git commit -m "更新首页 Dashboard 布局"

# 4. 推送到 GitHub
git push
```

---

## 六、常见问题

### Q: git push 提示冲突？
```bash
git pull
# 如果提示冲突，找我帮你解决
```

### Q: 页面白屏 / 报错？
```bash
# 停掉当前运行（Ctrl + C），重新启动
yarn start
```

### Q: 装依赖失败？
```bash
# 方法 1
yarn install

# 方法 2（如果 yarn 不行）
npm install
```

### Q: 怎么创建新组件？
在 `packages/nextjs/components/` 下新建文件，比如 `TaskStatus.tsx`，然后在 `page.tsx` 里引用：
```tsx
import TaskStatus from "../components/TaskStatus";
```

---

## 七、注意事项

1. **只改 `packages/nextjs/` 目录**，合约和脚本我来改
2. **每次开始前先 `git pull`**
3. **改完就提交推送**，别攒太多一起推
4. 有问题随时问我
