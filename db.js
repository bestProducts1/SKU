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

function parseCSV(csvText) {
  const cleanCsvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanCsvText.trim().split("\n");
  const headers = lines[0].trim().split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj = {};
    if (values.length < headers.length) return null;
    headers.forEach((header, index) => {
      let val = values[index] ? values[index].trim() : "";
      if (header === "price" || header === "stock") {
        val = Number(val) || 0;
      }
      obj[header] = val;
    });
    return obj;
  }).filter((item) => item !== null);
}

function getSupplier(sku) {
  if (!sku) return "供应商二";
  const s = String(sku);
  if (s.startsWith("1Z") || s === "1znvyou100" || s === "AMXS-01" || s === "DMXS-003") return "供应商五";
  if (/^H\d+/.test(s)) return "供应商三";
  if (/^A\d+/.test(s)) return "供应商一";
  return "供应商二";
}