# Egern Dashboard Widget

用于 Egern 的原生 iOS 主屏幕 / 锁屏小组件。第一版提供订阅剩余流量、已用 / 总流量、日期、订阅到期时间、手动配置的节点名称，以及「开启 VPN」入口。

## 通过模块链接安装

1. 在 Egern → 工具 → 模块中点击添加，粘贴以下链接并保存、启用模块：

   ```text
   https://raw.githubusercontent.com/zxas56555/egern-dashboard-widget/main/config/module.yaml
   ```

2. 在模块设置中填写 `SUBSCRIPTION_URL`（自己的 HTTPS 订阅地址），可选填写订阅名称和节点名称。Egern 会自动下载脚本并注册「订阅仪表盘」。
3. 长按 iOS 主屏幕 → 添加 Egern 小组件 → 编辑小组件 → 选择「订阅仪表盘」。建议先使用中号。

想先看样式，可以在模块设置中开启演示数据；接入真实订阅时关闭。

## 手动导入本地脚本

1. 在 Egern → 工具 → 脚本中新建脚本，名称 `egern-dashboard`，类型 `generic`，文件位置选本地，文件名 `dashboard.js`。
2. 打开「编辑文件」，粘贴 `dist/dashboard.js` 的全部内容并保存。这是专供 Egern 的独立发布脚本，只有一个默认入口，使用时不需要 npm 或其他 JS 文件。`src/dashboard.js` 保留本地测试用的命名导出，请不要直接导入 Egern。
3. 在分析页左上角进入小组件画廊，新建「订阅仪表盘」，关联 `egern-dashboard`。
4. 在小组件的 Env 中填写 `SUBSCRIPTION_URL`（自己的 HTTPS 订阅地址），可选填 `SUBSCRIPTION_NAME` 与 `NODE_NAME`。也可以在脚本 Env 中配置。
5. 长按 iOS 主屏幕 → 添加 Egern 小组件 → 编辑小组件 → 选择「订阅仪表盘」。建议先使用中号。

想先看样式，可以暂时设置 `DEMO=true`；接入真实订阅时删除此项或改为 `false`。

## 配置

| 环境变量            | 默认值   | 用途                                           |
| ------------------- | -------- | ---------------------------------------------- |
| `SUBSCRIPTION_URL`  | 空       | HTTPS 订阅地址；必填才能读取真实流量           |
| `SUBSCRIPTION_NAME` | 我的订阅 | 显示名称                                       |
| `NODE_NAME`         | 未设置   | 手动填写的节点名称，并非当前选中节点           |
| `USER_AGENT`        | Egern    | 订阅服务要求的请求 User-Agent                  |
| `REFRESH_MINUTES`   | 15       | 请求缓存间隔和刷新建议，限制 5–1440 分钟       |
| `TIMEZONE_OFFSET`   | 8        | 日期时区的 UTC 小时偏移，允许小数，限制 -12–14 |
| `DEMO`              | false    | 只有字符串 `true` 会启用模拟数据               |

日期默认使用 UTC+8。固定时区偏移不会自动跟随旅行或夏令时，需要手动修改。

`config/module.yaml` 已引用本仓库的远程脚本，可通过上面的链接直接导入。模块声明了 `env_schema`，供 Egern 生成参数设置控件；模块 Env 优先级最高。如果使用自己的 Fork，请同时修改模块里的 `homepage`、`script_url` 和安装链接。

请把真实订阅地址保留在 Egern Env 中。不要上传到公开脚本、截图或 Git 仓库；项目忽略 `.env*` 和 `*.local.yaml`。

## 数据与操作说明

- 流量读取订阅响应中的 `subscription-userinfo` 头，格式为 `upload=字节; download=字节; total=字节; expire=Unix秒`。至少需要前三个字段。单位按 1024 换算；`total=0` 显示额度未知，不推断为无限流量；未提供 `expire` 或为 0 时显示到期时间未知。服务商不提供此头时，第一版不能自动显示流量。
- 优先 HEAD，缺失或异常时回退 GET；GET 仅读取响应头，不解析节点列表或订阅正文。每次请求超时 6 秒，脚本超时建议 20 秒。
- 缓存按订阅地址和 User-Agent 分开存储，只保存流量头和更新时间。缓存失效后请求失败，会明确显示「更新失败 · 上次数据」。缓存没有最长保留期限，旧数据不会被当作刚更新的数据。
- `refreshAfter` 仅向 iOS 提出刷新建议，实际刷新时间由系统决定。流量及到期信息不是实时数据，日期在下一次系统刷新时更新。
- 按钮使用官方 `egern:/start` URL Scheme。点击后由系统跳转到 Egern 执行启动；它不显示或判断当前 VPN 状态。初次系统授权及实际启动结果请在设备上确认。
- 小号与锁屏组件整体点击开启 VPN；中号和大号使用按钮入口。小号优先显示流量、日期和启动入口；节点与到期时间在中号及大号显示。
- 已核查的公开 JavaScript API 没有当前策略组节点 / VPN 状态读取接口，因此第一版使用手动节点名称，不展示未经读取的连接状态。

## 本地开发与预览

需要 Node.js 18 或以上。原生 Egern 脚本没有第三方依赖；Prettier 仅用于开发格式化。

```powershell
npm install
npm run build
npm test
npm run format:check
npm run preview
```

打开 http://127.0.0.1:4173，可切换七种尺寸、明暗外观、数据异常状态和名称。页面从实际 `src/dashboard.js` 生成同一份 DSL，并在浏览器近似渲染。预览不发送订阅请求，不开启 VPN，不输入真实订阅地址。

浏览器预览不能验证 iOS 原生字体、WidgetKit 尺寸、SF Symbols 或 Egern URL 跳转；必须在设备上完成最终验证。

修改 `src/dashboard.js` 后运行 `npm run build`，并将生成的 `dist/dashboard.js` 一起提交。`npm test` 会自动重新构建，检查发布文件只保留一个默认入口，并对未配置、演示数据和模拟订阅请求进行执行验证。这些检查不等同于 Egern 真机运行。

### 仅显示组件名称时的排查

若小组件画廊只出现「订阅仪表盘」名称，没有流量或配置提示，说明还未显示出脚本的预期内容；仅凭这个界面不能区分下载、执行和渲染失败。

1. 在 Egern 中更新模块；此次兼容版本的脚本路径为 `dist/dashboard.js?v=0.1.1`，与初版地址不同。
2. 在工具 → 脚本中找到 `egern-dashboard`，手动运行并查看运行错误。不要公开包含订阅 token 的完整错误文本。
3. 在模块设置中暂时打开演示数据。演示模式不请求订阅，成功时应显示剩余 `161.5 GB` 和「开启 VPN」入口。
4. 若仍只显示名称，记录 Egern 版本号和手动运行错误，再排查下载与运行兼容性。

## 设备验收

1. 用中号组件确认订阅流量与服务商后台一致，检查时区和到期时间。
2. 点「开启 VPN」，确认 Egern 启动成功；在 VPN 已开时再点一次，检查设备上的实际行为。
3. 切换小号 / 大号及锁屏组件，检查长名称、系统大字体和明暗外观是否正常。
4. 断网并等待缓存间隔结束，确认显示失败提示和上次更新时间；恢复网络后等待系统刷新。

## 文档依据

- [Egern 小组件与 Widget DSL](https://egernapp.com/zh-CN/docs/configuration/widgets/)
- [Egern JavaScript API](https://egernapp.com/zh-CN/docs/javascript-api/)
- [Egern URL Scheme](https://egernapp.com/docs/url-scheme/)
- [Egern 模块配置](https://egernapp.com/docs/configuration/modules/)
- [MetaCubeX 订阅流量头惯例](https://github.com/MetaCubeX/metacubexd)

文档核查日期：2026-10-09。
