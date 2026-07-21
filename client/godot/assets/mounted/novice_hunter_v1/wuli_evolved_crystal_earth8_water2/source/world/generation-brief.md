# Phase326 晶甲乌力世界八方向生成与取舍记录

> 本文是依据本次留存输入与决策整理的生产记录，不冒充图像工具逐字 prompt。

- 对象：见习猎人与晶甲乌力一次生成的完整骑乘主体。
- 目标：南、西南、西、西北、北、东北、东、东南八个独立方向；每方向 1 帧 idle 与 4 帧连续 walk。
- 禁止：运行时镜像、人物与宠物分层拼接、标签/箭头作为方向真值、裁边、投影与洋红残留。
- 画面：512×512 透明源帧，确定性派生 256×256 运行帧；脚底统一，至少 4 px 安全边。
- 验收状态：候选自审与独立盲审均已通过；项目所有者验收未完成，runtimeEnabled=false。

## 源组与逐行决策

### mount-a

- 组结论：all four integrated whole-frame rows selected; self review and independent blind semantic audit passed; owner review pending。
- 第 1 行 `south`：`selected`；independent blind semantic audit passed; owner review pending。
- 第 2 行 `southwest`：`selected`；independent blind semantic audit passed; owner review pending。
- 第 3 行 `west`：`selected`；independent blind semantic audit passed; owner review pending。
- 第 4 行 `northwest`：`selected`；independent blind semantic audit passed; owner review pending。

### mount-b

- 组结论：all four integrated whole-frame rows selected, including a strict rear north distinct from northeast; self review and independent blind semantic audit passed; owner review pending。
- 第 1 行 `north`：`selected`；independent blind semantic audit passed; owner review pending。
- 第 2 行 `northeast`：`selected`；independent blind semantic audit passed; owner review pending。
- 第 3 行 `east`：`selected`；independent blind semantic audit passed; owner review pending。
- 第 4 行 `southeast`：`selected`；independent blind semantic audit passed; owner review pending。
