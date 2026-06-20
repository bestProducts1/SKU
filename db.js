// ==========================================
// db.js - 产品数据管理中心 (硬编码绝对穿透版)
// ==========================================

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_1tyfxYn_N6GiapL-T1u325G_A5L7YlrgAZKd92Nnl_7l12c5hDeur-9kwuE4RfBY4a9lZzNnqzc9/pub?gid=0&single=true&output=csv";
const CACHE_DURATION = 5 * 60 * 1000;
window.perfumeDB = [];

// 🛠️ 【本地死磕拿货价防漏装甲】
// 只要你表格里的 ID（A01, A02）对上了，这里的数字就拥有最高统治权，直接强制灌进去！
const BACKUP_COSTS = {
  "A01": 88, "A02": 88, "A03": 88, "A04": 74, "A05": 74,
  "A06": 78, "A07": 80, "A08": 75, "A09": 100, "A10": 82,
  "A11": 80, "A12": 77, "A13": 77, "A14": 76, "A15": 70
};

document.addEventListener("DOMContentLoaded", () => {
  initProductData();
});

async function initProductData() {
  const cacheKey = "perfumeDB_Data_v2";
  const timeKey = "perfumeDB_Time_v2";
  const now = new Date().getTime();
  const cachedTime = localStorage.getItem(timeKey);
  const cachedData = localStorage.getItem(cacheKey);

  if (cachedData && cachedTime && now - cachedTime < CACHE_DURATION) {
    window.perfumeDB = JSON.parse(cachedData);
    injectCostsForce(); // 强灌拿货价
    runPageLogic();
    return;
  }

  try {
    const response = await fetch(SHEET_URL);
    const data = await response.text();
    window.perfumeDB = parseCSV(data);
    
    window.perfumeDB.forEach((p) => {
      p.supplier = getSupplier(p.sku);
    });

    injectCostsForce(); // 强灌拿货价
    localStorage.setItem(cacheKey, JSON.stringify(window.perfumeDB));
    localStorage.setItem(timeKey, now);
    runPageLogic();
  } catch (error) {
    if (cachedData) {
      window.perfumeDB = JSON.parse(cachedData);
      injectCostsForce();
      runPageLogic();
    }
  }
}

// 💥 强制灌注逻辑：不管 CSV 解析出了什么垃圾，根据 ID 强行把真实的拿货价写进内存
function injectCostsForce() {
  if (!window.perfumeDB) return;
  window.perfumeDB.forEach(p => {
    if (p.id && BACKUP_COSTS[p.id] !== undefined) {
      p.cost = Number(BACKUP_COSTS[p.id]);
    } else {
      p.cost = Number(p.cost) || 0;
    }
  });
}

function runPageLogic() {
  if (typeof renderPerfumes === "function") renderPerfumes();
  if (typeof renderCart === "function") renderCart();
}

// --- 工具：CSV 解析器（全自动 200+ SKU 精准切分版） ---
function parseCSV(csvText) {
  // 1. 处理所有换行符，切分成行
  const cleanCsvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanCsvText.trim().split("\n");
  
  if (lines.length < 2) return [];

  // 2. 提取并洗净表头
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase());

  // 3. 精准定位 cost 列的索引
  const costIndex = headers.indexOf("cost");

  return lines
    .slice(1)
    .map((line) => {
      // ⭐ 核心修复：防止有的行末尾空列导致被直接腰斩切断
      // 强制使用与表头完全相同的长度来切分，确保第 14 列之后的 cost 不会丢失
      const values = [];
      let currentIdx = 0;
      
      for (let i = 0; i < headers.length; i++) {
        const nextComma = line.indexOf(",", currentIdx);
        if (nextComma === -1) {
          values.push(line.substring(currentIdx));
          currentIdx = line.length;
        } else {
          values.push(line.substring(currentIdx, nextComma));
          currentIdx = nextComma + 1;
        }
      }

      const obj = {};
      // 映射标准属性
      headers.forEach((header, index) => {
        let val = values[index] ? values[index].trim() : "";
        if (header === "price" || header === "stock") {
          val = val ? Number(val) : 0;
        }
        obj[header] = val;
      });

      // ⭐ 提取成本：只要这一列叫 cost，管你有几百行、有没有空格，全部精准提取
      if (costIndex !== -1 && values[costIndex] !== undefined) {
        let rawCost = values[costIndex].trim();
        let parsedCost = Number(rawCost);
        obj["cost"] = isNaN(parsedCost) ? 0 : parsedCost;
      } else {
        obj["cost"] = 0;
      }

      return obj;
    })
    .filter((item) => item !== null);
}
function getSupplier(sku) {
  if (!sku) return "供应商二";
  const s = String(sku);
  if (s.startsWith("1Z") || s === "1znvyou100" || s === "AMXS-01" || s === "DMXS-003") return "供应商五";
  if (/^H\d+/.test(s)) return "供应商三";
  if (/^A\d+/.test(s)) return "供应商一";
  return "供应商二";
}