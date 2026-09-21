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
const SKU_CART_STORAGE_KEY = "bestProducts1SkuCartV1";
const LEGACY_CART_STORAGE_KEY = "perfumeCart";
window.perfumeDB = [];
window.costDB = [];
window.orderDB = [];

function parseSkuCart(rawCart) {
  try {
    const cart = JSON.parse(rawCart || "[]");
    return Array.isArray(cart)
      ? cart.filter((item) => item && typeof item === "object")
      : [];
  } catch (error) {
    return [];
  }
}

function isSkuToolCartItem(item) {
  return item?.cartSource === "sku-tool" ||
    ["internalId", "orderSku", "sku", "sku2", "supplier", "cost", "tier"]
      .some((key) => Object.prototype.hasOwnProperty.call(item || {}, key));
}

function readSkuToolCart() {
  const storedCart = localStorage.getItem(SKU_CART_STORAGE_KEY);
  if (storedCart !== null) return parseSkuCart(storedCart);

  // Preserve SKU-tool entries from the previously shared cart while leaving
  // storefront entries behind for the catalog website.
  const legacyCart = parseSkuCart(localStorage.getItem(LEGACY_CART_STORAGE_KEY));
  const skuCart = legacyCart.filter(isSkuToolCartItem).map((item) => ({
    ...item,
    cartSource: "sku-tool",
  }));
  localStorage.setItem(SKU_CART_STORAGE_KEY, JSON.stringify(skuCart));
  return skuCart;
}

function writeSkuToolCart(items) {
  const cart = (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    cartSource: "sku-tool",
  }));
  localStorage.setItem(SKU_CART_STORAGE_KEY, JSON.stringify(cart));
  return cart;
}

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

function normalizeCatalogLookup(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCatalogWarehouse(product) {
  const source = [
    product && product.warehouse,
    product && product.gender,
    product && product.notes,
  ].join(" ");
  const match = source.match(/\b(IL|TX)\s*(?:WAREHOUSE)?\b/i);
  return match ? match[1].toUpperCase() : "";
}

function normalizeCatalogSize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/ml$/, "");
}

function findOrderCatalogProduct(product) {
  if (!product || !Array.isArray(window.orderDB)) return null;

  const warehouse = getCatalogWarehouse(product);
  const supplierCodes = new Set(
    [product.sku, product.sku2]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const sameWarehouse = (orderProduct) => {
    const match = String(orderProduct.sku || "").trim().toUpperCase().match(/^([A-Z]+)-/);
    return !warehouse || !match || match[1] === warehouse;
  };

  const productName = normalizeCatalogLookup(product.name);
  if (!productName) return null;
  const candidates = window.orderDB.filter(
    (orderProduct) =>
      sameWarehouse(orderProduct) &&
      [orderProduct.name, orderProduct.brand].some((value) => String(value || "").trim()),
  );
  const nameMatches = candidates.filter((orderProduct) => {
    return [orderProduct.name, orderProduct.brand]
      .map(normalizeCatalogLookup)
      .includes(productName);
  });
  if (nameMatches.length === 1) return nameMatches[0];
  if (nameMatches.length > 1) {
    const productSize = normalizeCatalogSize(product.ml);
    const sizeMatches = nameMatches.filter(
      (orderProduct) => normalizeCatalogSize(orderProduct.ml) === productSize,
    );
    if (sizeMatches.length === 1) return sizeMatches[0];
  }

  const alternateSkuMatches = candidates.filter((orderProduct) => {
    const alternateSku = String(orderProduct.sku2 || "").trim().toLowerCase();
    return alternateSku && supplierCodes.has(alternateSku);
  });
  if (alternateSkuMatches.length === 1) return alternateSkuMatches[0];

  const supplierAndNameMatches = candidates.filter((orderProduct) => {
    const orderSku = String(orderProduct.sku || "").trim().toLowerCase();
    const shortOrderSku = orderSku.replace(/^(?:il|tx)-/, "");
    if (!supplierCodes.has(shortOrderSku)) return false;
    const orderNames = [orderProduct.name, orderProduct.brand]
      .map(normalizeCatalogLookup)
      .filter(Boolean);
    return orderNames.some(
      (orderName) =>
        orderName === productName ||
        orderName.includes(productName) ||
        productName.includes(orderName),
    );
  });
  return supplierAndNameMatches.length === 1 ? supplierAndNameMatches[0] : null;
}

function getOrderSkuForProduct(product) {
  const orderProduct = findOrderCatalogProduct(product);
  return orderProduct ? String(orderProduct.sku || "").trim() : "";
}

window.findOrderCatalogProduct = findOrderCatalogProduct;
window.getOrderSkuForProduct = getOrderSkuForProduct;
