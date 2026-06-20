// ==========================================
// db.js - 产品数据管理中心 (满血修复最后一列成本换行符漏洞版)
// ==========================================

// !!! 请替换成你第一步里复制的 Google Sheet CSV 链接 !!!
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_1tyfxYn_N6GiapL-T1u325G_A5L7YlrgAZKd92Nnl_7l12c5hDeur-9kwuE4RfBY4a9lZzNnqzc9/pub?gid=0&single=true&output=csv";

// 缓存时间：5分钟 (300000毫秒)
const CACHE_DURATION = 5 * 60 * 1000;

// 全局变量，用来存放数据
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

  // 1. 检查缓存：如果有缓存且没过期，直接用
  if (cachedData && cachedTime && now - cachedTime < CACHE_DURATION) {
    console.log("🚀 (Cache) 加载本地数据 - 秒开");
    window.perfumeDB = JSON.parse(cachedData);
    runPageLogic(); // 启动页面渲染
    return;
  }

  // 2. 没有缓存或已过期：去 Google 下载
  console.log("🌐 (Network) 从 Google Sheet 下载最新数据...");

  const gallery =
    document.getElementById("perfume-list") ||
    document.getElementById("gallery");
  if (gallery)
    gallery.innerHTML =
      '<div style="grid-column:1/-1; text-align:center; padding:50px; color:#666;">Updating products...</div>';

  try {
    const response = await fetch(SHEET_URL);
    const data = await response.text();

    // 解析 CSV
    window.perfumeDB = parseCSV(data);

    // 自动计算供应商 (核心逻辑)
    window.perfumeDB.forEach((p) => {
      p.supplier = getSupplier(p.sku);
    });

    // 存入缓存
    localStorage.setItem(cacheKey, JSON.stringify(window.perfumeDB));
    localStorage.setItem(timeKey, now);

    runPageLogic(); // 启动页面渲染
  } catch (error) {
    console.error("下载失败:", error);
    if (cachedData) {
      window.perfumeDB = JSON.parse(cachedData);
      runPageLogic();
      alert("网络较慢，已加载离线数据");
    } else {
      alert("无法连接产品数据库，请检查网络连接。");
    }
  }
}

// --- 页面渲染分发器 ---
function runPageLogic() {
  if (typeof renderPerfumes === "function") {
    renderPerfumes();
  }
  if (typeof renderCart === "function") {
    renderCart();
  }
}

// --- 工具：CSV 解析器（清洗行尾不可见换行符） ---
function parseCSV(csvText) {
  // 核心清洗：统一清除表格末尾可能导致最后一列失效的各种干扰换行符
  const cleanCsvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanCsvText.trim().split("\n");
  
  // 强制全小写表头，绝不让大小写影响数据识别
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
        
        // ⭐【数智化漏洞修复】：将价格、库存以及全新添加的成本列一并强行剥离格式转化为数字
        if (header === "price" || header === "stock" || header === "cost") {
          val = val ? Number(val) : 0;
          if (isNaN(val)) val = 0; // 过滤非数字干扰
        }
        obj[header] = val;
      });
      return obj;
    })
    .filter((item) => item !== null);
}

// ==========================================
// 供应商判断逻辑
// ==========================================
function getSupplier(sku) {
  if (!sku) return "供应商二";
  const s = String(sku);

  if (
    s.startsWith("1Z") ||
    s === "1znvyou100" ||
    s === "AMXS-01" ||
    s === "DMXS-003"
  ) {
    return "供应商五";
  }

  if (/^H\d+/.test(s)) return "供应商三";
  if (/^A\d+/.test(s)) return "供应商一";

  if ((/^[a-z-]+$/.test(s) && s.includes("-")) || s === "kh-QAHWA") {
    return "供应商四";
  }

  return "供应商二";
}