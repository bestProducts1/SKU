// ==========================================
// db.js - 产品数据管理中心 (纯净稳定版)
// ==========================================

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_1tyfxYn_N6GiapL-T1u325G_A5L7YlrgAZKd92Nnl_7l12c5hDeur-9kwuE4RfBY4a9lZzNnqzc9/pub?gid=0&single=true&output=csv";

const CACHE_DURATION = 5 * 60 * 1000;

window.perfumeDB = [];

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
    runPageLogic();
    return;
  }

  const gallery = document.getElementById("perfume-list") || document.getElementById("gallery");
  if (gallery) gallery.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px; color:#666;">Updating products...</div>';

  try {
    const response = await fetch(SHEET_URL);
    const data = await response.text();

    window.perfumeDB = parseCSV(data);

    window.perfumeDB.forEach((p) => {
      p.supplier = getSupplier(p.sku);
    });

    localStorage.setItem(cacheKey, JSON.stringify(window.perfumeDB));
    localStorage.setItem(timeKey, now);

    runPageLogic();
  } catch (error) {
    console.error("下载失败:", error);
    if (cachedData) {
      window.perfumeDB = JSON.parse(cachedData);
      runPageLogic();
    }
  }
}

function runPageLogic() {
  if (typeof renderPerfumes === "function") renderPerfumes();
  if (typeof renderCart === "function") renderCart();
}

function parseCSV(csvText) {
  const cleanCsvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanCsvText.trim().split("\n");
  
  const headers = lines[0]
    .trim()
    .split(",")
    .map((h) => h.trim().toLowerCase());

  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      const obj = {};

      if (values.length < headers.length) return null;

      headers.forEach((header, index) => {
        let val = values[index] ? values[index].trim() : "";
        
        if (header === "price" || header === "stock" || header === "cost") {
          val = val ? Number(val) : 0;
          if (isNaN(val)) val = 0;
        }
        obj[header] = val;
      });
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
  if ((/^[a-z-]+$/.test(s) && s.includes("-")) || s === "kh-QAHWA") return "供应商four";
  return "供应商二";
}