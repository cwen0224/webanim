# WebAnim 技術架構文件

## 目錄
1. [專案結構](#1-專案結構)
2. [核心資料模型](#2-核心資料模型)
3. [渲染管線](#3-渲染管線)
4. [關鍵子系統](#4-關鍵子系統)
5. [JSON 格式規範](#5-json-格式規範)
6. [開發路線圖](#6-開發路線圖)

---

## 1. 專案結構

```
src/
├── core/               # 與 UI 無關的純邏輯
│   ├── model/          # 資料模型型別定義
│   ├── scene/          # 場景圖（Scene Graph）管理
│   ├── transform/      # 梯形變換、矩陣運算
│   ├── constraint/     # 重心插銷約束系統
│   ├── parameter/      # 參數系統、插值、DAG
│   └── calculator/     # 參數運算器（公式引擎）
├── render/             # PixiJS 渲染層
│   ├── QuadSprite.ts   # 梯形變形 sprite
│   ├── MaskSystem.ts   # 遮罩管理
│   └── StageManager.ts # 場景渲染統籌
├── ui/                 # React UI 元件
│   ├── panels/         # 工具面板（物件管理、參數列表）
│   ├── nodes/          # 節點編輯器
│   └── timeline/       # 時間軸
├── animation/          # 動畫系統
│   ├── NodeGraph.ts    # 動畫節點圖
│   ├── Timeline.ts     # 時間軸關鍵幀
│   └── LipSync.ts      # 嘴型同步
├── editor/             # 剪接模組
└── store/              # 全域狀態（Zustand 或 Jotai）
```

---

## 2. 核心資料模型

### 2.1 基礎型別

```typescript
// 2D 座標點
type Point = { x: number; y: number };

// 四頂點四邊形（順序：左上、右上、右下、左下）
type Quad = [Point, Point, Point, Point];

// UV 相對座標（0~1 百分比，相對於物件四邊形）
type UV = { u: number; v: number };
```

### 2.2 重心與插銷

```typescript
interface Pivot {
  id: string;
  name: string;      // 例：「左手手肘面向右側」
  uv: UV;            // 儲存相對座標，而非世界座標
}

interface Pin {
  id: string;
  name: string;
  uv: UV;
  boundPivotId: string | null;  // 綁定的重心 id（一個插銷對多個重心？依規格：一個重心不能與多個插銷綁定）
}

// 插銷 → 重心 綁定關係（存在全域 ConstraintMap）
interface PivotPinBinding {
  pinId: string;       // 插銷（父件上的點）
  pivotId: string;     // 重心（子件的軸心）
  // 綁定後，這兩個點在世界座標中永遠重合
}
```

### 2.3 場景物件

```typescript
type ObjectType = 'png' | 'deformer';

interface SceneObject {
  id: string;
  name: string;
  type: ObjectType;

  // 四頂點是唯一真實狀態
  quad: Quad;
  opacity: number;

  // 資源（png 專用）
  assetUrl?: string;

  // 重心：此物件旋轉的軸心
  pivot: Pivot;

  // 插銷：用來跟其他物件的重心綁定
  pins: Pin[];

  // 父子層級（變形器包裹）
  parentId: string | null;
  children: string[];  // 子物件 id 列表

  // 遮罩設定
  masks: MaskConfig[];

  // 圖層順序
  zIndex: number;
}
```

### 2.4 參數系統

```typescript
// 參數類型
type ParameterType = 'slider' | 'cross' | 'radar';

interface ParameterBase {
  id: string;
  name: string;      // 例：「眨左眼」、「頭部左右轉動」
  type: ParameterType;
}

// 線性滑桿參數
interface SliderParameter extends ParameterBase {
  type: 'slider';
  min: number;
  max: number;
  value: number;
  keyframes: SliderKeyframe[];
}

interface SliderKeyframe {
  t: number;                           // 參數值（min~max）
  objectStates: Record<string, Quad>;  // objectId → 此參數值下的四頂點狀態
  opacityStates: Record<string, number>;
}

// 十字參數（X × Y 二維混和）
interface CrossParameter extends ParameterBase {
  type: 'cross';
  xRange: [number, number];
  yRange: [number, number];
  value: { x: number; y: number };
  // 九宮格關鍵幀（或更多）
  keyframes: CrossKeyframe[];
}

interface CrossKeyframe {
  tx: number;
  ty: number;
  objectStates: Record<string, Quad>;
  opacityStates: Record<string, number>;
}

// 雷達參數（極座標扇形切換）
interface RadarParameter extends ParameterBase {
  type: 'radar';
  value: { angle: number; radius: number };  // 0~360, 0~100
  sectors: RadarSector[];
}

interface RadarSector {
  id: string;
  angleRange: [number, number];
  radiusRange: [number, number];
  // 此扇形對應的素材切換規則
  assetOverrides: Record<string, string>;   // objectId → assetUrl
  opacityOverrides: Record<string, number>;
}
```

### 2.5 遮罩

```typescript
type MaskType = 'positive' | 'negative' | 'stroke' | 'double';

interface MaskConfig {
  type: MaskType;
  maskObjectId: string;   // 作為遮罩的物件 id
  andMaskIds?: string[];  // 雙重遮罩用：需同時滿足的其他遮罩 id
}
```

### 2.6 參數連動（DAG）

```typescript
// 連動規則：當 sourceParamId 的值改變時，執行 formula 計算 targetParamId 的新值
interface ParameterLink {
  id: string;
  sourceParamIds: string[];   // 輸入參數（可多個）
  targetParamId: string;
  formula: string;            // math.js 公式字串，例：「p1 * 0.5 + p2」
  // 系統在新增前會做 DAG 驗證，拒絕形成循環的連動
}
```

---

## 3. 渲染管線

```
每幀更新流程：

1. 收集所有 active 參數的當前值
2. 執行 ParameterCalculator：
   a. 拓撲排序 DAG，依序計算所有連動參數
3. 對每個 SceneObject：
   a. 從參數系統插值計算當前 Quad（四頂點）
   b. 套用父層變換（scene graph 遞迴）
   c. 解析重心插銷約束，修正被約束物件的 Quad
4. 將 Quad 轉換為 homography matrix，傳入 PixiJS QuadSprite
5. PixiJS 渲染（含遮罩處理）
```

### Quad → Homography Matrix

梯形變形的核心：將一個矩形紋理映射到任意四邊形。

```typescript
// 使用 3×3 homography matrix
// 從單位正方形 [0,0],[1,0],[1,1],[0,1] 映射到目標 Quad
function computeHomography(targetQuad: Quad): mat3 {
  // 使用直接線性變換（DLT）算法求解
  // 參考：https://math.stackexchange.com/a/2092728
}
```

### 插值策略（轉動優先）

兩個 Quad 狀態之間的插值，不直接做頂點線性插值，而是：

1. 計算重心在兩個狀態的世界座標
2. 計算以重心為軸的旋轉角度差
3. 先旋轉到目標角度（lerp 旋轉）
4. 再對剩餘的縮放/位移做線性插值

---

## 4. 關鍵子系統

### 4.1 重心插銷約束求解

```
每幀，在 scene graph 計算完「自由狀態」的 Quad 後：

1. 遍歷所有 PivotPinBinding
2. 對每個綁定：
   a. 計算插銷（父件）的世界座標：pin_world = uvToWorld(pin.uv, parent.quad)
   b. 計算重心（子件）的當前世界座標：pivot_world = uvToWorld(pivot.uv, child.quad)
   c. 計算位移 delta = pin_world - pivot_world
   d. 將 delta 加到 child.quad 的所有四個頂點（平移子件使重心與插銷對齊）
3. 重複直到所有約束滿足（通常一次即可，除非有連鎖約束）
```

```typescript
// UV 座標轉世界座標（雙線性插值）
function uvToWorld(uv: UV, quad: Quad): Point {
  const { u, v } = uv;
  const top    = lerp(quad[0], quad[1], u);
  const bottom = lerp(quad[3], quad[2], u);
  return lerp(top, bottom, v);
}
```

### 4.2 十字參數雙線性插值

```
有四個角落關鍵幀：(x0,y0), (x1,y0), (x0,y1), (x1,y1)
當前值為 (tx, ty)

歸一化：u = (tx - x0) / (x1 - x0), v = (ty - y0) / (y1 - y0)

對每個頂點 i（0~3）：
  top_i    = lerp(keyframe[TL].quad[i], keyframe[TR].quad[i], u)
  bottom_i = lerp(keyframe[BL].quad[i], keyframe[BR].quad[i], u)
  result_i = lerp(top_i, bottom_i, v)
```

### 4.3 參數雷達扇形判斷

```typescript
function getActiveSector(param: RadarParameter): RadarSector | null {
  const { angle, radius } = param.value;
  if (radius === 0) return null;  // 基礎狀態
  return param.sectors.find(s =>
    radius  >= s.radiusRange[0] && radius  <= s.radiusRange[1] &&
    angleBetween(angle, s.angleRange[0], s.angleRange[1])
  ) ?? null;
}
```

### 4.4 DAG 驗證（防迴圈）

新增連動規則時，執行拓撲排序（Kahn's algorithm）。若佇列排完後仍有節點未處理，表示有環，拒絕新增並提示使用者。

```typescript
function validateDAG(links: ParameterLink[]): boolean {
  // 建立有向圖：source → target
  // 執行 Kahn's algorithm（BFS 拓撲排序）
  // 若 sorted.length !== totalNodes → 有環 → 回傳 false
}
```

### 4.5 公式引擎

```typescript
import { evaluate } from 'mathjs';

function evaluateLink(link: ParameterLink, params: Record<string, number>): number {
  const scope: Record<string, number> = {};
  link.sourceParamIds.forEach((id, i) => {
    scope[`p${i + 1}`] = params[id];
  });
  return evaluate(link.formula, scope) as number;
}
// 公式範例：「p1 * sin(p2)」、「clamp(p1 + p2, 0, 100)」
```

---

## 5. JSON 格式規範

### 5.1 動畫節點圖（AI 可讀寫）

```json
{
  "characterId": "char_001",
  "lanes": [
    {
      "laneId": "lane_head",
      "description": "頭部動作",
      "nodes": [
        {
          "id": "n1",
          "type": "param_state",
          "params": { "headLR": 0.0, "headUD": 0.0 }
        },
        {
          "id": "n2",
          "type": "wait",
          "duration": 0.8,
          "easing": "ease_in_out"
        },
        {
          "id": "n3",
          "type": "param_state",
          "params": { "headLR": 30.0, "headUD": -10.0 }
        }
      ],
      "edges": [
        { "from": "n1", "to": "n2" },
        { "from": "n2", "to": "n3" }
      ]
    },
    {
      "laneId": "lane_blink",
      "description": "眨眼",
      "nodes": [
        { "id": "b1", "type": "param_state", "params": { "eyeBlinkL": 0, "eyeBlinkR": 0 } },
        { "id": "b2", "type": "wait", "duration": 0.1, "easing": "linear" },
        { "id": "b3", "type": "param_state", "params": { "eyeBlinkL": 1, "eyeBlinkR": 1 } },
        { "id": "b4", "type": "wait", "duration": 0.08, "easing": "linear" },
        { "id": "b5", "type": "param_state", "params": { "eyeBlinkL": 0, "eyeBlinkR": 0 } }
      ],
      "edges": [
        { "from": "b1", "to": "b2" }, { "from": "b2", "to": "b3" },
        { "from": "b3", "to": "b4" }, { "from": "b4", "to": "b5" }
      ]
    }
  ]
}
```

### 5.2 多條 lane 加算邏輯

所有 lane 在同一時間點的參數值取**加算**（不是平均）。因此動畫師應確保不同 lane 控制不同參數，避免對同一參數重複加值。系統可提供警告提示。

### 5.3 剪接片段格式

```json
{
  "sequence": [
    {
      "id": "clip_001",
      "type": "clip",
      "animationId": "anim_greet",
      "audioFile": "greet.wav",
      "startTime": 0.0,
      "endTime": 3.5
    },
    {
      "id": "wait_001",
      "type": "wait",
      "duration": 0.5
    },
    {
      "id": "clip_002",
      "type": "clip",
      "animationId": "anim_talk",
      "audioFile": "talk.wav",
      "startTime": 4.0,
      "endTime": 8.2
    }
  ]
}
```

---

## 6. 開發路線圖

### Phase 1：渲染核心（約 3~4 週）
**目標：能在畫布上放一張 PNG 並做梯形變形**

- [ ] 專案初始化（Vite + TypeScript + PixiJS）
- [ ] `QuadSprite`：實作 homography matrix 渲染
- [ ] Scene Graph：父子層級、遞迴 transform
- [ ] 基礎 UI：畫布 + 簡易工具列
- [ ] 物件新增、選取、刪除

**驗收**：拖拉四個角落可以任意梯形變形一張 PNG，父層移動時子層跟著動。

---

### Phase 2：重心插銷系統（約 2~3 週）
**目標：可以建立關節**

- [ ] Pivot / Pin 定義介面（點擊設定，UV 座標儲存）
- [ ] PivotPinBinding 建立與解除
- [ ] 每幀約束求解
- [ ] 重心插銷視覺化（可顯示/隱藏）

**驗收**：用兩張 PNG 模擬手臂關節，移動上臂時前臂跟著轉動，插銷點不偏移。

---

### Phase 3：參數系統（約 3~4 週）
**目標：可以設定參數並錄製關鍵幀**

- [ ] 參數列表 UI（新增、命名、滑動）
- [ ] 滑桿參數：關鍵幀錄製與插值（轉動優先）
- [ ] 十字參數：雙線性插值
- [ ] 參數雷達：扇形判斷與素材切換
- [ ] 物件管理三檢視（圖層、變形器、資料夾）

**驗收**：拉動「頭部左右轉動」滑桿，頭部素材在三個關鍵幀間平滑插值。

---

### Phase 4：遮罩（約 1~2 週）
**目標：支援正遮罩、反遮罩、描邊遮罩**

- [ ] 正遮罩（WebGL stencil）
- [ ] 反遮罩
- [ ] 描邊遮罩（alpha 邊界偵測）
- [ ] 雙重遮罩（AND 邏輯）

---

### Phase 5：參數運算器（約 2~3 週）
**目標：參數可以用公式連動，實現 IK**

- [ ] 公式輸入介面（math.js 整合）
- [ ] DAG 建構與拓撲排序
- [ ] 循環偵測與錯誤提示
- [ ] 簡易 2-bone IK 範例

**驗收**：設定「右手 IK 目標點 X/Y」驅動參數，前臂與上臂跟著自動旋轉。

---

### Phase 6：動畫節點編輯器（約 3~4 週）
**目標：可以用節點編輯器製作動畫**

- [ ] 節點編輯器 UI（ParamState 節點、Wait 節點）
- [ ] 多 lane 加算邏輯
- [ ] 時間軸模式切換
- [ ] JSON 匯入匯出（AI 可操作）
- [ ] 嘴型同步（先做簡易音量分析版）

---

### Phase 7：剪接（約 2 週）
**目標：可以把動畫片段剪接成影片**

- [ ] 片段節點管理
- [ ] 多線時間軸
- [ ] 預覽播放
- [ ] 匯出（WebM 或 PNG 序列）

---

### Phase 8：Rhubarb 精確嘴型（視情況）
- [ ] 編譯 Rhubarb 為 WASM 或建立後端服務
- [ ] 整合到嘴型同步系統

---

## 附錄：重要算法參考

| 算法 | 說明 | 參考 |
|------|------|------|
| Homography DLT | 四點對應求 3×3 矩陣 | Hartley & Zisserman Ch.4 |
| Bilinear Interpolation | 十字參數混和 | 雙線性插值標準公式 |
| Kahn's Algorithm | DAG 拓撲排序（防迴圈） | CLRS 第22章 |
| 2-Bone IK | 餘弦定理求關節角度 | 標準 2-bone IK |
| Rhubarb Lip-Sync | 音素對嘴型映射 | github.com/DanielSWolf/rhubarb-lip-sync |
