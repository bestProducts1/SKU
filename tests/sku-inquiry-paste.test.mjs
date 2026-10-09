import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = (file) => fs.readFileSync(new URL(file, root), "utf8");
const inquiryKey = "bestProducts1:sku:inquiry:v1";
const plain = (value) => JSON.parse(JSON.stringify(value));
const products = [
  { id: "IL-B008", sku: "IL-B008", name: "Valentino Uomo Born in Roma", brand: "Valentino", ml: "100", warehouse: "IL", stock: 377, price: 36, img: "https://example.test/il.webp", sku2: "机车骑士" },
  { id: "TX-A002", sku: "TX-A002", name: "Valentino Donna Born in Roma", brand: "Valentino", ml: "100", warehouse: "TX", stock: 48, price: 38, img: "https://example.test/tx.webp", sku2: "朋克甜心" },
];

function createElement() {
  const events = new Map();
  const classes = new Set();
  return {
    events,
    style: {},
    dataset: {},
    value: "",
    textContent: "",
    hidden: true,
    offsetHeight: 0,
    innerHTML: "",
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
      toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value),
    },
    addEventListener: (name, callback) => events.set(name, callback),
    appendChild() {},
    querySelectorAll: () => [],
    setAttribute() {},
    contains: () => false,
    focus() {},
  };
}

function createPage({ page = "index.html", stored = [], publisherFailure = false, missingPublisher = false } = {}) {
  const memory = new Map();
  const elements = new Map();
  const lifecycle = [];
  const alerts = [];
  const errors = [];
  const publishes = [];
  const writes = [];
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };
  const sandbox = {
    console: { ...console, error: (...args) => errors.push(args) },
    document: {
      addEventListener: (name, callback) => {
        if (name === "DOMContentLoaded") lifecycle.push(callback);
      },
      getElementById: getElement,
      querySelector: () => createElement(),
      querySelectorAll: () => [],
      createElement,
      body: { style: {}, appendChild() {} },
    },
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        writes.push(key);
        if (publisherFailure && key === inquiryKey) throw new Error("Browser storage is unavailable");
        memory.set(key, String(value));
      },
      removeItem: (key) => memory.delete(key),
    },
    alert: (message) => alerts.push(message),
    confirm: () => true,
    setTimeout: (callback) => { callback(); return 0; },
    clearTimeout() {},
    addEventListener() {},
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    crypto: { randomUUID: () => `fixture-revision-${publishes.length + 1}` },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (!missingPublisher) {
    vm.runInContext(source("inquiry-sync.js"), sandbox);
    const publish = sandbox.SkuInquirySync.publish;
    sandbox.SkuInquirySync = {
      ...sandbox.SkuInquirySync,
      publish(items) {
        publishes.push({ items: plain(items), saved: plain(sandbox.readSkuToolCart()) });
        return publish(items);
      },
    };
  }
  vm.runInContext(source("db.js"), sandbox);
  const cartKey = vm.runInContext("SKU_CART_STORAGE_KEY", sandbox);
  const resetKey = vm.runInContext("SKU_CART_RESET_KEY", sandbox);
  memory.set(resetKey, "done");
  memory.set(cartKey, JSON.stringify(stored));
  sandbox.perfumeDB = plain(products);
  sandbox.orderDB = sandbox.perfumeDB;
  const inline = [...source(page).matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(inline, sandbox);
  if (page === "index.html") sandbox.renderPerfumes = () => {};
  lifecycle.at(-1)();
  return {
    sandbox, memory, alerts, errors, publishes, writes, cartKey, getElement,
    cart: () => plain(sandbox.readSkuToolCart()),
    inquiry: () => memory.has(inquiryKey) ? JSON.parse(memory.get(inquiryKey)) : null,
    paste(text) {
      let prevented = false;
      getElement("search-input").events.get("paste")({
        preventDefault: () => { prevented = true; },
        clipboardData: { getData: () => text },
      });
      assert.equal(prevented, true);
    },
  };
}

const orderText = "New Order\nIL Warehouse\nIL-B008 - Valentino Uomo Born in Roma · 100ml\nx 3\nTX Warehouse\nTX-A002 - Valentino Donna Born in Roma · 100ml\nx 2\nSubtotal: $184.00";

test("SKU loads the inquiry helper before its existing database script", () => {
  const html = source("index.html");
  const helperIndex = html.indexOf('<script src="inquiry-sync.js?v=20261009-sku-inquiry"></script>');
  const databaseIndex = html.indexOf('<script src="db.js?v=5"></script>');
  assert.ok(helperIndex >= 0 && helperIndex < databaseIndex);
});

test("actual order paste saves a replacement cart before publishing only official SKU, warehouse and quantity", () => {
  const page = createPage({ stored: [{ name: "IL-B008", quantity: 9, price: 99 }] });
  page.paste(orderText);
  assert.equal(page.publishes.length, 1);
  assert.deepEqual(page.publishes[0].saved, page.cart());
  assert.deepEqual(page.inquiry().items, [
    { sku: "IL-B008", warehouse: "IL", quantity: 3 },
    { sku: "TX-A002", warehouse: "TX", quantity: 2 },
  ]);
  assert.equal(page.cart()[0].quantity, 3);
  assert.equal(page.cart()[0].price, 36);
  assert.equal(page.cart()[0].sku2, "机车骑士");
  assert.equal(page.cart()[0].img, products[0].img);
  assert.match(page.alerts.at(-1), /Refresh either site.*own prices/);
});

test("actual shorthand paste keeps append behavior and publishes the resulting full cart", () => {
  const page = createPage({ stored: [{ name: "IL-B008", quantity: 2, warehouse: "IL", price: 36 }] });
  page.paste("机车骑士*3+TX-A002*2");
  assert.equal(page.publishes.length, 1);
  assert.deepEqual(page.publishes[0].saved, page.cart());
  assert.deepEqual(page.inquiry().items, [
    { sku: "IL-B008", warehouse: "IL", quantity: 5 },
    { sku: "TX-A002", warehouse: "TX", quantity: 2 },
  ]);
  for (const item of page.inquiry().items) {
    assert.deepEqual(Object.keys(item).sort(), ["quantity", "sku", "warehouse"]);
  }
});

test("partially matched order publishes matched products and still reports omitted IDs", () => {
  const page = createPage();
  page.paste(`${orderText}\nTX-X999 x 4`);
  assert.equal(page.publishes.length, 1);
  assert.equal(page.inquiry().items.length, 2);
  assert.match(page.alerts.at(-1), /Skipped.*TX-X999/);
});

test("ordinary text, unmatched orders and unmatched shorthand do not create or replace an inquiry", () => {
  const page = createPage();
  for (const text of ["Valentino", "New Order\nTX-X999 x 3\nSubtotal $20", "No such scent*4", "IL-B008*0"]) {
    page.paste(text);
  }
  assert.equal(page.publishes.length, 0);
  assert.equal(page.inquiry(), null);
  assert.deepEqual(page.cart(), []);
});

test("unloaded database does not publish or replace an existing inquiry", () => {
  const page = createPage();
  page.paste(orderText);
  const before = page.memory.get(inquiryKey);
  page.sandbox.perfumeDB = [];
  page.paste(orderText);
  page.paste("IL-B008*2");
  assert.equal(page.publishes.length, 1);
  assert.equal(page.memory.get(inquiryKey), before);
  assert.match(page.alerts.at(-1), /Database not loaded/);
});

test("successful SKU add stays saved when inquiry storage fails and alert does not promise sync", () => {
  for (const text of [orderText, "机车骑士*3+TX-A002*2"]) {
    const page = createPage({ publisherFailure: true });
    page.paste(text);
    assert.equal(page.publishes.length, 1);
    assert.equal(page.cart().length, 2);
    assert.equal(page.inquiry(), null);
    assert.match(page.alerts.at(-1), /SKU cart saved.*syncing.*failed/);
    assert.doesNotMatch(page.alerts.at(-1), /Inquiry saved for/);
    assert.equal(page.errors.length, 1);
  }
});

test("unsafe pasted quantity cannot overwrite the last valid inquiry or carry an invalid list into a storefront", () => {
  const page = createPage();
  page.paste(orderText);
  const before = page.memory.get(inquiryKey);
  page.paste("IL-B008*9007199254740992");
  assert.equal(page.publishes.length, 2);
  assert.equal(page.memory.get(inquiryKey), before);
  assert.match(page.alerts.at(-1), /SKU cart saved.*syncing.*failed/);
  assert.equal(page.errors.length, 1);
  assert.ok(page.cart()[0].quantity > Number.MAX_SAFE_INTEGER);
});

test("failed publication of an invalid existing cart line leaves the previous valid snapshot intact", () => {
  const page = createPage({ stored: [{ name: "IL-B008", quantity: 2, warehouse: "TX", price: 36 }] });
  const oldInquiry = JSON.stringify({ version: 1, source: "SKU", revision: "previous", createdAt: Date.now(), items: [{ sku: "IL-B008", warehouse: "IL", quantity: 1 }] });
  page.memory.set(inquiryKey, oldInquiry);
  page.paste("TX-A002*2");
  assert.equal(page.cart().length, 2);
  assert.equal(page.memory.get(inquiryKey), oldInquiry);
  assert.match(page.alerts.at(-1), /syncing.*failed/);
});

test("missing helper cannot falsely report sync success or roll back a saved SKU cart", () => {
  const page = createPage({ missingPublisher: true });
  page.paste(orderText);
  assert.equal(page.cart().length, 2);
  assert.equal(page.inquiry(), null);
  assert.match(page.alerts.at(-1), /syncing.*failed/);
  assert.equal(page.errors.length, 1);
});

test("page initialization, manual add, normal search and clearing SKU cart never republish the inquiry", () => {
  const page = createPage();
  assert.equal(page.publishes.length, 0);
  page.paste(orderText);
  const before = page.memory.get(inquiryKey);
  page.sandbox.addItemToCart("IL-B008");
  page.paste("Valentino");
  page.getElement("search-input").value = "Dior";
  page.getElement("search-input").events.get("input")();
  page.sandbox.clearCart();
  assert.equal(page.publishes.length, 1);
  assert.equal(page.memory.get(inquiryKey), before);
  assert.deepEqual(page.cart(), []);
});

test("SKU cart page initialization, +/- and removal/clear do not publish an inquiry", () => {
  const page = createPage({ page: "cart.html", stored: [{ name: "IL-B008", quantity: 2, warehouse: "IL", price: 36 }] });
  const inquiry = { version: 1, source: "SKU", revision: "existing", createdAt: Date.now(), items: [{ sku: "IL-B008", warehouse: "IL", quantity: 2 }] };
  page.memory.set(inquiryKey, JSON.stringify(inquiry));
  const itemElement = { dataset: { name: "IL-B008" } };
  for (const action of ["increase-btn", "decrease-btn", "remove-btn"]) {
    page.getElement("cart-container").events.get("click")({ target: {
      closest: () => itemElement,
      classList: { contains: (value) => value === action },
    } });
  }
  page.getElement("clear-cart-btn").events.get("click")();
  assert.equal(page.publishes.length, 0);
  assert.equal(page.memory.get(inquiryKey), JSON.stringify(inquiry));
});
