// ==========================================
// db.js - 产品数据管理中心 (满血修复最后一列成本换行符漏洞版)
// ==========================================

// !!! 请替换成你第一步里复制的 Google Sheet CSV 链接 !!!
// !!! 官方标准的纯 CSV 数据流通道，绝无网页代码干扰 !!!
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_1tyfxYn_N6GiapL-T1u325G_A5L7YlrgAZKd92Nnl_7l12c5hDeur-9kwuE4RfBY4a9lZzNnqzc9/pub?gid=0&single=true&output=csv";// 缓存时间：5分钟 (300000毫秒)
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
// --- 工具：CSV 解析器（强制兜底位置不讲道理版） ---
function parseCSV(csvText) {
  const cleanCsvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleanCsvText.trim().split("\n");
  
  const headers = lines[0]
    .trim()
    .split(",")
    .map((h) => h.trim().toLowerCase());

  // 🔍 现场精准定位你的 cost 在哪一列
  let costIndex = headers.indexOf("cost");
  // ⭐【强行绝杀】：如果你谷歌表格表头因为各种原因没有被认成小写"cost"，那我们就强行数格子！
  // 在你的表格里：A=id, B=name, C=brand, D=img, E=stock, F=inventory, G=price, H=sku, I=ml, J=new, K=gender, L=notes, M=top, N=cost
  // N 刚好是第 14 列，也就是索引号 13。如果在表头找不到，我们强制用第14列作为 cost！
  if (costIndex === -1) {
    costIndex = 13; 
  }

  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      const obj = {};

      if (values.length < headers.length) return null;

      headers.forEach((header, index) => {
        let val = values[index] ? values[index].trim() : "";
        if (header === "price" || header === "stock") {
          val = val ? Number(val) : 0;
        }
        obj[header] = val;
      });

      // 💥 无论表头叫什么名字，强制把第14列的数据洗净、转成数字，塞给 obj.cost！
      if (values[costIndex] !== undefined) {
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