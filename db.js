// ==========================================
// db.js - 产品数据管理中心 (带缓存功能)
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

  // 如果是 index.html，可以在这里显示个简单的 loading
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
    // 失败回退：如果有旧缓存，就用旧的
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
  // 如果是首页 (有 renderPerfumes 函数)
  if (typeof renderPerfumes === "function") {
    renderPerfumes();
  }
  // 如果是购物车页 (有 renderCart 函数)
  if (typeof renderCart === "function") {
    renderCart();
  }
}

// --- 工具：CSV 解析器 ---
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  const headers = lines[0]
    .trim()
    .split(",")
    .map((h) => h.trim());

  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      const obj = {};

      if (values.length < headers.length) return null;

      headers.forEach((header, index) => {
        let val = values[index] ? values[index].trim() : "";
        if (header === "price" || header === "stock") {
          val = Number(val);
        }
        obj[header] = val;
      });
      return obj;
    })
    .filter((item) => item !== null);
}

// ==========================================
// 修改后的供应商判断逻辑 (包含最新规则)
// ==========================================
function getSupplier(sku) {
  // 0. 兜底保护
  if (!sku) return "供应商二";

  const s = String(sku); // 转字符串防止报错

  // 1. 规则: 1Z开头 或 特定例外 -> 供应商五
  // 包含: 1znvyou100, AMXS-01, DMXS-003
  if (
    s.startsWith("1Z") ||
    s === "1znvyou100" ||
    s === "AMXS-01" ||
    s === "DMXS-003"
  ) {
    return "供应商五";
  }

  // 2. 规则: H开头 + 数字 -> 供应商三
  if (/^H\d+/.test(s)) return "供应商三";

  // 3. 规则: A开头 + 数字 -> 供应商一
  // (注意：AMXS-01 虽然A开头，但在上面第1条规则已被截获为供应商五，不会冲突)
  if (/^A\d+/.test(s)) return "供应商一";

  // 4. 规则: 全小写且带横杠 (如 lattafa-zi) 或 特定例外 -> 供应商四
  // 正则 /^[a-z-]+$/ 确保不包含大写字母
  if ((/^[a-z-]+$/.test(s) && s.includes("-")) || s === "kh-QAHWA") {
    return "供应商四";
  }

  // 5. 规则: 其他所有 -> 供应商二
  // (包括中文名、纯数字如1001、T开头、(美中)结尾等)
  return "供应商二";
}
