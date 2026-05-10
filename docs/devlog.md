# WebAnim 開發日誌

---

## 2026-05-03 — Phase 3 完成

### 本日完成功能

#### 1. 關鍵幀標記修復
- 標記位置與滑桿對不齊 → 改用 `calc(pct * (100% - 16px) + 8px)` 補償 range input 的內邊距
- 標記蓋住滑桿導致出現禁止游標、無法拖動 → 將標記移到滑桿下方獨立的 8px 高條帶（flex column 佈局），完全消除重疊

#### 2. 旋轉插值弧形內縮修復
- **問題**：兩關鍵幀之間播放時，物件會往內縮再展開，不是乾淨的旋轉弧
- **根因**：舊公式 `lerpPt(rotated_at_t, b, t)` 在旋轉弧與終點之間走直線，造成弦切捷徑
- **修法**：改用 residual 公式
  ```
  rot1 = a 完全旋轉到 t=1 的位置（不含縮放）
  final = rotated_at_t + t × (b - rot1)
  ```
  純旋轉時 `b - rot1 = 0`，殘差為零，軌跡完美沿弧；縮放/形變部分線性補上

#### 3. PNG 貼圖系統
- 支援：Ctrl+V 剪貼簿、右鍵選單、檔案選擇器
- 縮放邏輯：貼入時自動等比縮放到最大 400px，方塊長寬調整為 PNG 原始比例
- **Mesh 架構**：4 三角形扇形，以重心 UV 為中心頂點
  - 優點：UV 在梯形四角的扭曲比 2 三角形對角切更均勻
  - 重心 UV 不變時原地更新頂點位置（`buffer.update()`），不重建 GPU 物件
- **Blob URL 載入**：`Assets.load` 依副檔名選 parser，blob URL 無副檔名導致靜默失敗
  → 改用 `new Image()` + `img.decode()` + `Texture.from(img)`

#### 4. 變形器（Deformer）系統
- **概念**：藍色虛線框籠，子物件的四個頂點以 UV 儲存在變形器空間，變形器形變時子物件跟著映射
- **約束求解順序**：Step 1 = deformer binding → Step 2 = pin binding（確保 pin 偏移在 deformer 之後套用）
- **渲染**：
  - 變形器 zIndex 為負數，渲染在所有普通物件下方
  - 加入 stage 時用 `addChildAt(container, 1)`（bg 上方、其他物件下方）
  - 選取時邊框與控制點改為藍色系（`0x44aaff`）

**UI 操作流程：**
1. 點「新增變形器」→ 自動包覆已選取物件（加 20px 邊距）
2. 選普通物件 → 右側「變形器」區段 → 「綁定變形器…」
3. 點擊目標變形器完成綁定
4. 拖動/變形變形器角落，子物件即時跟隨

### 修改檔案
| 檔案 | 變更 |
|------|------|
| `src/core/model/types.ts` | 新增 `DeformerBinding` 型別、`isDeformer`、`deformerBinding` 欄位 |
| `src/core/constraint/solver.ts` | 新增 Step 1 變形器約束（重寫） |
| `src/core/parameter/interpolation.ts` | 旋轉插值改為 residual 公式 |
| `src/store/sceneStore.ts` | 新增 `addDeformer`、`bindToDeformer`、`unbindFromDeformer`、`setTexture`；`deleteSelected` 清理 deformerBinding 引用 |
| `src/render/QuadMesh.ts` | 新增 Mesh/貼圖系統；變形器虛線框渲染 |
| `src/render/StageManager.ts` | 新增 `bindDeformer` 模式處理、`setPendingDeformerBind` |
| `src/App.tsx` | 圖片貼入 UI、變形器操作 UI、Ctrl+V / 右鍵快捷鍵 |
| `src/App.css` | 關鍵幀標記移到獨立條帶、slider-wrap flex column |

### 技術備忘
- `worldToUV` 用 Newton-Raphson 反求雙線性插值，精度足夠，收斂快
- 最短旋轉路徑正規化：`while (delta > π) delta -= 2π`（兩方向都要做）
- Mesh 位置更新：直接改 `MeshGeometry.positions[]` 再 `getAttribute('aPosition').buffer.update()`，比 destroy/recreate 快很多

---

## 待辦（Phase 4 以後）
- 參數運算器（驅動參數、連動參數、公式引擎）
- IK（反向運動學）
- 節點編輯器 + 時間軸動畫
- 遮罩系統
- 匯出（GIF / WebM / JSON）
