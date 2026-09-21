// SKU conversion catalog: the current warehouse sheet is the only data source.
const PRODUCT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFWYImNbJ0ao5z0VDk_VZwhOP1pnY2UZdFuwxtYOvKaNfEX4sInJh7uk-MlRSH9kffdZ5TjzhudLao/pub?gid=1967485424&single=true&output=csv";

const CACHE_DURATION = 5 * 60 * 1000;
const PRODUCT_CACHE_KEY = "bestProducts1SkuProductsV1";
const PRODUCT_TIME_KEY = "bestProducts1SkuProductsTimeV1";
const SKU_CART_STORAGE_KEY = "bestProducts1SkuCartV2";
const SKU_CART_RESET_KEY = "bestProducts1SkuCartResetV2";
window.perfumeDB = [];
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

function resetSkuCartOnce() {
  if (localStorage.getItem(SKU_CART_RESET_KEY) === "done") return;
  localStorage.removeItem("perfumeCart");
  localStorage.removeItem("bestProducts1SkuCartV1");
  localStorage.removeItem(SKU_CART_STORAGE_KEY);
  localStorage.removeItem("perfumeDB_Data_v2");
  localStorage.removeItem("perfumeDB_Time_v2");
  localStorage.removeItem("costDB_Data");
  localStorage.removeItem("orderDB_Data_v1");
  localStorage.setItem(SKU_CART_RESET_KEY, "done");
}

function readSkuToolCart() {
  resetSkuCartOnce();
  return parseSkuCart(localStorage.getItem(SKU_CART_STORAGE_KEY));
}

function writeSkuToolCart(items) {
  resetSkuCartOnce();
  const cart = Array.isArray(items) ? items : [];
  localStorage.setItem(SKU_CART_STORAGE_KEY, JSON.stringify(cart));
  return cart;
}

document.addEventListener("DOMContentLoaded", () => {
  initAllData();
});

async function initAllData() {
  resetSkuCartOnce();
  const now = Date.now();
  const cachedTime = Number(localStorage.getItem(PRODUCT_TIME_KEY));
  const cachedProducts = parseSkuCart(localStorage.getItem(PRODUCT_CACHE_KEY));

  if (cachedProducts.length && cachedTime && now - cachedTime < CACHE_DURATION) {
    setProductData(cachedProducts);
    runPageLogic();
    return;
  }

  try {
    const response = await fetch(`${PRODUCT_SHEET_URL}&_=${now}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load the product sheet.");
    const products = parseProductCSV(await response.text()).filter(
      (product) => product.id && product.name && product.warehouse,
    );
    if (!products.length) throw new Error("The product sheet is empty.");

    setProductData(products);
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products));
    localStorage.setItem(PRODUCT_TIME_KEY, String(now));
    runPageLogic();
  } catch (error) {
    console.error("Product data could not be refreshed:", error);
    if (cachedProducts.length) {
      setProductData(cachedProducts);
      runPageLogic();
    }
  }
}

function setProductData(products) {
  window.perfumeDB = products;
  window.orderDB = products;
}

function runPageLogic() {
  if (typeof renderPerfumes === "function") renderPerfumes();
  if (typeof renderCart === "function") renderCart();
}

function parseProductCSV(csvText) {
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
  if (quoted) throw new Error("Incomplete quoted product data.");
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  const numericFields = new Set([
    "price",
    "stock",
    "hot_selling_weight",
    "new_arrival_weight",
    "coming_soon_weight",
  ]);
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => {
      const product = {};
      headers.forEach((header, index) => {
        const rawValue = values[index] || "";
        product[header] = numericFields.has(header)
          ? rawValue === "" ? "" : Number(rawValue)
          : rawValue;
      });
      product.id = String(product.sku || "").trim().toUpperCase();
      product.sku = product.id;
      product.img = product.image_url || "";
      product.gender = product.target || "";
      const warehouseMatch = product.id.match(/^([A-Z]+)-/);
      product.warehouse = warehouseMatch ? warehouseMatch[1] : "";
      return product;
    });
}

function findOrderCatalogProduct(product) {
  const sku = String(product?.id || product?.sku || "").trim().toUpperCase();
  if (!sku) return null;
  return (window.orderDB || []).find(
    (candidate) => String(candidate.sku || "").trim().toUpperCase() === sku,
  ) || null;
}

function getOrderSkuForProduct(product) {
  const orderProduct = findOrderCatalogProduct(product);
  return orderProduct ? String(orderProduct.sku || "").trim() : "";
}

window.findOrderCatalogProduct = findOrderCatalogProduct;
window.getOrderSkuForProduct = getOrderSkuForProduct;
