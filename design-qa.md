# Phase 377 Design QA：觉醒风格背包与装备对比

## Result

- P0：无。
- P1：无。
- P2：无。最终 `1280×720` 画面中的概览、扩容、拆分、宠物目标、回血、
  五类筛选、装备对比、宠物蛋和骑宠证均没有越界、裁切、假图标或程序员字段。
- 这是基于参考层级和材质语言的 Beastbound 原创适配，不宣称像素级复制。
- 工程 Design QA 已通过；项目所有者的视觉验收仍保持 `owner_review_pending`，
  等待观看最终 1× 视频。

## Comparison target

- 概览参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-4849fe4f-2d51-410e-9f9e-6e53e48e3619.jpg`
- 装备比较参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e63d479d-4446-4a24-bbe2-32a3c430b48a.jpg`
- 实机概览：Phase377 v5 `frame-02.png`，`4.703125s`；
- 实机红绿比较：Phase377 v5 `frame-11.png`，`32.921875s`；
- 参考和实机均归一化为 `1280×720` 后同屏判断。

## Comparison evidence

- 概览同屏：
  `.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/overview-reference-vs-runtime.png`
- 装备比较同屏：
  `.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/compare-reference-vs-runtime.png`
- 最终视频：
  `.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/backpack-awakened-owner-review-1x.mp4`
- 联系表：
  `.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/contact-sheet.png`

## Required fidelity surfaces

- Layout：左装备／完整人物、右背包、顶部货币与关闭入口；九装备位和五列背包
  不相互遮挡。
- Material：深色石木背景、暖金框线、木质按钮和橙色关闭按钮保持与近期宠物页
  一致。
- Icons：81/81 物品有真实纹理；货币、装备、消耗、材料、宠物蛋和许可证均无
  emoji、文字图标或截图裁片。
- Controls：筛选、详情、装备、卸下、使用、拆分、丢弃、扩容、宠物目标和取消
  都是可操作控件，并接入真实现有流程。
- Comparison：当前／候选并列，强化与耐久可见，正属性为绿色、负属性为红色，
  同模板不同强化实例不会串选。
- Safety：普通玩家界面不显示实例 ID、schema、测试标志、来源、hash 或 QA
  说明。

## Intentional differences and P3 observations

- 参考图使用蓝／紫／橙品质色块；Beastbound 当前没有权威物品品质字段，因此
  使用统一黑金物品卡。这是避免伪造玩法的合同差异，不是遗漏。
- 物品格为了容纳 `5×4` 与 `15+5` 容量，长名称会省略；点击后详情显示完整名称
  和说明。后续如建立权威品质系统，可同时重新评估卡片密度与颜色。
- 装备比较下半部和按钮列比参考图留白更多，换取 1280×720 下稳定的并排阅读，
  不影响红绿差值和主操作。
- 本轮没有宣称完整屏幕阅读器或 GPU 单帧分析；左键主流程、真实跨帧鼠标压力和
  当前性能探针均已通过。

## Interaction and visual verification

- 22 个连续章节在真实 `Main.tscn`、`1.00x` 中完成；
- 拆分弹窗最终实测 `420×246`，居中且无底部溢出；
- 宠物目标显示芽耳布伊 `281/351`，使用后显示绿色 `+70` 并成为
  `351/351`；
- 三种目标层关闭路径均恰好取消一次，不会重新弹出；
- 装备实例比较先展示同模板 `+1 → +4`，再展示攻击 `+1`、敏捷 `-2`；
- 视频为 `50.166667s / 1505` 帧、H.264/AAC、`1280×720 / 30 FPS`，完整音
  视频解码通过。

final result: engineering_passed; owner_review_pending
