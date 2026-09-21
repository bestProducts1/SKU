import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = (file) => fs.readFileSync(new URL(file, root), "utf8");

function createContext() {
  const memory = new Map();
  const sandbox = {
    console,
    document: { addEventListener() {} },
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source("db.js"), sandbox);
  return { sandbox, memory };
}

test("SKU cart clears all legacy carts once", () => {
  const { sandbox, memory } = createContext();
  memory.set("perfumeCart", JSON.stringify([{ name: "B02", quantity: 2 }]));
  memory.set("bestProducts1SkuCartV1", JSON.stringify([{ name: "B03", quantity: 1 }]));

  const cart = JSON.parse(JSON.stringify(sandbox.readSkuToolCart()));
  assert.deepEqual(cart, []);
  assert.equal(memory.has("perfumeCart"), false);
  assert.equal(memory.has("bestProducts1SkuCartV1"), false);
  assert.equal(memory.get("bestProducts1SkuCartResetV2"), "done");
});

test("SKU cart writes only official SKUs to its private key", () => {
  const { sandbox, memory } = createContext();
  const written = JSON.parse(JSON.stringify(sandbox.writeSkuToolCart([
    { name: "IL-B008", quantity: 1 },
  ])));

  assert.equal(written[0].name, "IL-B008");
  assert.equal(JSON.parse(memory.get("bestProducts1SkuCartV2"))[0].name, "IL-B008");
  assert.equal(memory.has("perfumeCart"), false);
});

test("the new product sheet becomes the only SKU product model", () => {
  const { sandbox } = createContext();
  const csv = "sku,brand,name,target,price,ml,stock,hot_selling_weight,new_arrival_weight,coming_soon_weight,image_url,sku2\nIL-B008,Valentino,Uomo,Men,36,100,377,9,,,https://example.test/p.webp,机车骑士\nTX-A002,Valentino,Donna,Women,38,100,48,,,,https://example.test/q.webp,";
  const products = JSON.parse(JSON.stringify(sandbox.parseProductCSV(csv)));
  assert.deepEqual(products.map(({ id, sku, warehouse, img, sku2 }) => ({ id, sku, warehouse, img, sku2 })), [
    { id: "IL-B008", sku: "IL-B008", warehouse: "IL", img: "https://example.test/p.webp", sku2: "机车骑士" },
    { id: "TX-A002", sku: "TX-A002", warehouse: "TX", img: "https://example.test/q.webp", sku2: "" },
  ]);
});

test("internal legacy IDs are absent from SKU code and pages", () => {
  assert.doesNotMatch(source("db.js"), /internalId/);
  assert.doesNotMatch(source("index.html"), /Internal:/);
  assert.doesNotMatch(source("index.html"), /internalId/);
  assert.doesNotMatch(source("cart.html"), /Internal:/);
  assert.doesNotMatch(source("cart.html"), /internalId/);
});
