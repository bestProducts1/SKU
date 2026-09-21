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
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source("db.js"), sandbox);
  return { sandbox, memory };
}

test("SKU cart imports only SKU-tool entries from the formerly shared cart", () => {
  const { sandbox, memory } = createContext();
  memory.set("perfumeCart", JSON.stringify([
    { name: "IL-B016", warehouse: "IL", quantity: 1 },
    { name: "B02", internalId: "B02", orderSku: "IL-B016", quantity: 2 },
  ]));

  const cart = JSON.parse(JSON.stringify(sandbox.readSkuToolCart()));
  assert.deepEqual(cart.map((item) => item.name), ["B02"]);
  assert.equal(cart[0].cartSource, "sku-tool");
  assert.equal(JSON.parse(memory.get("bestProducts1SkuCartV1")).length, 1);
});

test("SKU cart writes only to its private key and marks its source", () => {
  const { sandbox, memory } = createContext();
  const written = JSON.parse(JSON.stringify(sandbox.writeSkuToolCart([
    { name: "B03", quantity: 1 },
  ])));

  assert.equal(written[0].cartSource, "sku-tool");
  assert.equal(JSON.parse(memory.get("bestProducts1SkuCartV1"))[0].name, "B03");
  assert.equal(memory.has("perfumeCart"), false);
});

test("internal legacy IDs are not rendered by either SKU page", () => {
  assert.doesNotMatch(source("index.html"), /Internal:/);
  assert.doesNotMatch(source("cart.html"), /Internal:/);
});
