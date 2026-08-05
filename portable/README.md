# 卡坦島 Catan — USB 便攜版（Windows / Mac）

單機瀏覽器遊戲，**唔使安裝**。支援：

- 1–4 名人類玩家（熱座，同一部電腦輪流）
- 可加 AI 對手
- 玩家之間交易、銀行交易
- 多種地圖模式

---

## Windows 點玩（最快）

### 方法 A（推薦）

1. 插入 USB  
2. 打開資料夾 `Catan_Katan_Island`  
3. **雙擊** `Play_Catan.bat`  
   - 或雙擊 `開始遊戲.bat`  
   - 或直接雙擊 `index.html`

遊戲會用預設瀏覽器開啟（Edge / Chrome / Firefox 都可以）。

### 方法 B（如方法 A 畫面空白）

少數電腦對本機 `file://` 較嚴，可以：

1. 雙擊 `Play_Catan_Server.bat`  
2. 等瀏覽器打開 `http://localhost:8765/`  
3. 完咗玩喺黑色視窗按 `Ctrl+C` 停止伺服器  

需要：**Python** 或 **PowerShell**（Windows 10/11 通常已有 PowerShell）。

---

## Mac 點玩

1. 雙擊 `index.html`，或  
2. 終端機：

```bash
cd "/Volumes/你的USB/Catan_Katan_Island"
open index.html
```

---

## 遊戲操作簡述

| 項目 | 說明 |
|------|------|
| 目標 | 先到 **10 分** |
| 設置 | 每人放 2 個村莊 + 2 條路 |
| 回合 | 擲骰 → 收資源 → 建造 / 交易 → 結束回合 |
| 交易 | 銀行 4:1（港口可更好）；玩家之間任意比例（雙方同意） |
| 多人 | 熱座：換人時會提示交機，減少偷看手牌 |

詳見遊戲內 `?` 說明。

---

## 檔案說明

| 檔案 | 用途 |
|------|------|
| `index.html` | 完整遊戲（單一檔，雙擊即可） |
| `Play_Catan.bat` | Windows 一鍵開啟 |
| `開始遊戲.bat` | 同上（中文檔名） |
| `Play_Catan_Server.bat` | 用本機伺服器開啟（備用） |
| `tools/serve.ps1` | PowerShell 簡易伺服器 |
| `js/` + `styles.css` | 模組版原始檔（進階 / 開發用） |
| `README.md` / `README.txt` | 說明文件 |

---

## 系統需求

- Windows 10 / 11（或 macOS）
- 任何現代瀏覽器（建議 Edge 或 Chrome）
- **唔使**安裝 Node / 遊戲平台 / 帳號

---

## 常見問題

**Q: 雙擊 html 係空白頁？**  
A: 改用 `Play_Catan_Server.bat`，或換 Edge/Chrome。

**Q: 防毒軟件攔截 .bat？**  
A: 呢個 bat 只係開啟本機 html，可以允許，或直接開 `index.html`。

**Q: 可唔可以複製去第二部電腦？**  
A: 可以，成個 `Catan_Katan_Island` 資料夾複製就得。

**Q: 要唔要上網？**  
A: 唔使（字體如果載唔到會用系統字體）。

---

## 版本

便攜版由專案 `catan-web` 打包，包含單人 vs AI 同多人熱座交易功能。

玩得開心！🏝️
