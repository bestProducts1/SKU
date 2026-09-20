// ==========================================
// db.js - 双轨运行版 (原有展示功能不变 + 引入新表查成本)
// ==========================================

// 1. 原有主表格链接（用于展示商品，不动它）
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_1tyfxYn_N6GiapL-T1u325G_A5L7YlrgAZKd92Nnl_7l12c5hDeur-9kwuE4RfBY4a9lZzNnqzc9/pub?gid=0&single=true&output=csv";

// 🔴 2. 已经替换为你只存 SKU 和价格的新表格链接
const NEW_COST_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwfhvTIKxcNt7BMH0efPwy1ME4y12feYbdWj510SdJg8k0NzwKrzPs4BYCbzGwKvMRUY62-1blhO5Y/pub?gid=0&single=true&output=csv";

// 当前询盘网站使用的商品表，用于把 IL-/TX- SKU 转换回供应商 SKU。
const ORDER_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFWYImNbJ0ao5z0VDk_VZwhOP1pnY2UZdFuwxtYOvKaNfEX4sInJh7uk-MlRSH9kffdZ5TjzhudLao/pub?gid=1967485424&single=true&output=csv";

const CACHE_DURATION = 5 * 60 * 1000;
window.perfumeDB = [];
window.costDB = [];
window.orderDB = [];

// 🧠【最高优先级对账防漏装甲】：直接注入 A19 和 A31 的真实拿货价
const INJECTED_COSTS = {
  "A19": 81,
  "A31": 75
};

document.addEventListener("DOMContentLoaded", () => {
  initAllData();
});

async function initAllData() {
  const now = new Date().getTime();
  const cachedTime = localStorage.getItem("perfumeDB_Time_v2");
  const cachedData = localStorage.getItem("perfumeDB_Data_v2");
  const cachedCostData = localStorage.getItem("costDB_Data");
  const cachedOrderData = localStorage.getItem("orderDB_Data_v1");

  if (cachedData && cachedCostData && cachedOrderData && cachedTime && (now - cachedTime < CACHE_DURATION)) {
    window.perfumeDB = JSON.parse(cachedData);
    window.costDB = JSON.parse(cachedCostData);
    window.orderDB = JSON.parse(cachedOrderData);
    injectCostsForce(); 
    runPageLogic();
    return;
  }

  try {
    const [resMain, resCost, resOrder] = await Promise.all([
      fetch(SHEET_URL).then(r => r.text()),
      fetch(NEW_COST_SHEET_URL).then(r => r.text()),
      fetch(ORDER_SHEET_URL).then(r => r.text()).catch((error) => {
        console.warn("询盘商品表加载失败，将使用名称和仓库匹配", error);
        return "";
      })
    ]);

    window.perfumeDB = parseMainCSV(resMain);
    window.costDB = parseCostCSV(resCost);
    window.orderDB = resOrder ? parseOrderCSV(resOrder) : [];

    injectCostsForce(); 

    localStorage.setItem("perfumeDB_Data_v2", JSON.stringify(window.perfumeDB));
    localStorage.setItem("costDB_Data", JSON.stringify(window.costDB));
    localStorage.setItem("orderDB_Data_v1", JSON.stringify(window.orderDB));
    localStorage.setItem("perfumeDB_Time_v2", now);
    
    runPageLogic();
  } catch (error) {
    console.error("加载数据失败，尝试降级读取缓存", error);
    if (cachedData) window.perfumeDB = JSON.parse(cachedData);
    if (cachedCostData) window.costDB = JSON.parse(cachedCostData);
    if (cachedOrderData) window.orderDB = JSON.parse(cachedOrderData);
    injectCostsForce();
    runPageLogic();
  }
}

function injectCostsForce() {
  if (!window.costDB) return;
  // 强行把 A19 和 A31 塞入价格内存，防止漏单
  for (let id in INJECTED_COSTS) {
    const matched = window.costDB.find(p => p.sku && String(p.sku).trim().toLowerCase() === id.toLowerCase());
    if (matched) {
      matched.cost = Number(INJECTED_COSTS[id]);
    } else {
      window.costDB.push({ sku: id, cost: Number(INJECTED_COSTS[id]) });
    }
  }
}

function runPageLogic() {
  if (typeof renderPerfumes === "function") renderPerfumes();
  if (typeof renderCart === "function") renderCart();
}

function parseMainCSV(csvText) {
  const clean = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(",");
    if (values.length < headers.length) return null;
    const obj = {};
    headers.forEach((header, idx) => {
      let val = values[idx] ? values[idx].trim() : "";
      if (header === "price" || header === "stock") val = Number(val) || 0;
      obj[header] = val;
    });
    return obj;
  }).filter(item => item !== null);
}

function parseCostCSV(csvText) {
  const clean = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const skuIdx = headers.indexOf("sku");
  const costIdx = headers.indexOf("cost");
  
  if (skuIdx === -1 || costIdx === -1) return [];

  return lines.slice(1).map(line => {
    const values = line.split(",");
    const rawSku = values[skuIdx] ? values[skuIdx].trim() : "";
    const rawCost = values[costIdx] ? Number(values[costIdx].trim()) : 0;
    if (!rawSku) return null;
    return { sku: rawSku, cost: isNaN(rawCost) ? 0 : rawCost };
  }).filter(item => item !== null);
}

function parseOrderCSV(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const text = String(csvText || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => {
      const product = {};
      headers.forEach((header, index) => {
        product[header] = values[index] || "";
      });
      return product;
    });
}
